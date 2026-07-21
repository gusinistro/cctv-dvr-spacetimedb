use crate::config::ReplicationConfig;
use crate::queue::{ReplicationBatch, ReplicationEvent, ReplicationQueue};
use crate::error::ReplicationResult;
use crate::remote_sync::RemoteSync;
use crate::backup_store::BackupStore;
use crate::health_monitor::HealthMonitor;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::time::{interval, Duration};
use tracing::{info, warn, error};

/// Main replication manager
pub struct ReplicationManager {
    config: Arc<ReplicationConfig>,
    queue: Arc<ReplicationQueue>,
    remote_sync: Arc<RemoteSync>,
    backup_store: Arc<BackupStore>,
    health_monitor: Arc<HealthMonitor>,
    is_primary: Arc<RwLock<bool>>,
}

impl ReplicationManager {
    /// Create new replication manager
    pub async fn new(config: ReplicationConfig) -> ReplicationResult<Self> {
        config.validate()?;

        let config = Arc::new(config);
        let queue = Arc::new(ReplicationQueue::new(10000));
        let remote_sync = Arc::new(RemoteSync::new(config.clone()).await?);
        let backup_store = Arc::new(BackupStore::new(config.clone()).await?);
        let health_monitor = Arc::new(HealthMonitor::new(config.clone(), remote_sync.clone()));

        Ok(Self {
            config,
            queue,
            remote_sync,
            backup_store,
            health_monitor,
            is_primary: Arc::new(RwLock::new(true)),
        })
    }

    /// Start replication manager
    pub async fn start(&self) -> ReplicationResult<()> {
        info!("Starting replication manager");

        // Start health monitoring
        let health_monitor = self.health_monitor.clone();
        tokio::spawn(async move {
            if let Err(e) = health_monitor.start().await {
                error!("Health monitor error: {}", e);
            }
        });

        // Start batch flush timer
        let queue = self.queue.clone();
        let config = self.config.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_millis(config.batch_timeout_ms));
            loop {
                ticker.tick().await;
                if let Err(e) = queue.flush_batch().await {
                    warn!("Failed to flush batch: {}", e);
                }
            }
        });

        // Start replication worker
        let queue = self.queue.clone();
        let remote_sync = self.remote_sync.clone();
        let backup_store = self.backup_store.clone();
        let config = self.config.clone();
        let is_primary = self.is_primary.clone();

        tokio::spawn(async move {
            loop {
                if *is_primary.read().await {
                    if let Some(batch) = queue.pop_batch().await {
                        if let Err(e) = Self::replicate_batch(&batch, &remote_sync, &backup_store, &config).await {
                            error!("Replication failed: {}", e);
                            // Re-queue on failure
                            let mut q = queue.queue.write().await;
                            q.push_front(batch);
                        }
                    }
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        });

        // Start backup scheduler
        let backup_store = self.backup_store.clone();
        let config = self.config.clone();
        tokio::spawn(async move {
            let mut ticker = interval(Duration::from_secs(config.local_backup.interval_secs));
            loop {
                ticker.tick().await;
                if let Err(e) = backup_store.create_backup().await {
                    warn!("Failed to create backup: {}", e);
                }
            }
        });

        info!("Replication manager started");
        Ok(())
    }

    /// Add event for replication
    pub async fn replicate_event(&self, event: ReplicationEvent) -> ReplicationResult<()> {
        self.queue.push_event(event).await
    }

    /// Replicate a batch
    async fn replicate_batch(
        batch: &ReplicationBatch,
        remote_sync: &RemoteSync,
        backup_store: &BackupStore,
        config: &ReplicationConfig,
    ) -> ReplicationResult<()> {
        // Check if batch has critical events
        let has_critical = batch.has_critical();

        match config.mode {
            crate::config::ReplicationMode::Synchronous if has_critical => {
                // Wait for all remotes
                remote_sync.sync_batch_synchronous(batch).await?
            }
            crate::config::ReplicationMode::Synchronous => {
                remote_sync.sync_batch_synchronous(batch).await?
            }
            crate::config::ReplicationMode::Asynchronous => {
                // Fire and forget
                remote_sync.sync_batch_asynchronous(batch).await
            }
            crate::config::ReplicationMode::Hybrid if has_critical => {
                remote_sync.sync_batch_synchronous(batch).await?
            }
            crate::config::ReplicationMode::Hybrid => {
                remote_sync.sync_batch_asynchronous(batch).await
            }
        }

        // Backup to local storage
        backup_store.backup_batch(batch).await?;

        info!("Batch {} replicated successfully", batch.id);
        Ok(())
    }

    /// Set primary status
    pub async fn set_primary(&self, is_primary: bool) {
        *self.is_primary.write().await = is_primary;
        if is_primary {
            info!("Promoted to primary");
        } else {
            info!("Demoted to backup");
        }
    }

    /// Get replication status
    pub async fn get_status(&self) -> ReplicationStatus {
        ReplicationStatus {
            is_primary: *self.is_primary.read().await,
            queue_length: self.queue.len().await,
            backup_targets: self.remote_sync.get_targets_status().await,
            last_backup: self.backup_store.get_last_backup_time().await,
        }
    }
}

/// Replication status
#[derive(Debug, Clone, serde::Serialize)]
pub struct ReplicationStatus {
    pub is_primary: bool,
    pub queue_length: usize,
    pub backup_targets: Vec<TargetStatus>,
    pub last_backup: Option<chrono::DateTime<chrono::Utc>>,
}

/// Target status
#[derive(Debug, Clone, serde::Serialize)]
pub struct TargetStatus {
    pub name: String,
    pub connected: bool,
    pub lag_ms: u64,
    pub last_sync: Option<chrono::DateTime<chrono::Utc>>,
}
