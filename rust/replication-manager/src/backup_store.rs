use crate::config::ReplicationConfig;
use crate::queue::ReplicationBatch;
use crate::error::ReplicationResult;
use std::sync::Arc;
use std::path::PathBuf;
use tokio::fs;
use chrono::Utc;
use tracing::{info, warn};
use std::sync::RwLock;

/// Local backup storage handler
pub struct BackupStore {
    config: Arc<ReplicationConfig>,
    last_backup: Arc<RwLock<Option<chrono::DateTime<chrono::Utc>>>>,
}

impl BackupStore {
    pub async fn new(config: Arc<ReplicationConfig>) -> ReplicationResult<Self> {
        // Create backup directory if doesn't exist
        fs::create_dir_all(&config.local_backup.backup_dir).await?;

        Ok(Self {
            config,
            last_backup: Arc::new(RwLock::new(None)),
        })
    }

    /// Create a full backup
    pub async fn create_backup(&self) -> ReplicationResult<()> {
        let timestamp = Utc::now().format("%Y-%m-%d_%H-%M-%S").to_string();
        let backup_name = format!("backup_{}.tar.gz", timestamp);
        let backup_path = self.config.local_backup.backup_dir.join(&backup_name);

        info!("Creating backup: {}", backup_name);

        // TODO: Implement actual database backup
        // This would involve:
        // 1. Taking a snapshot of the SpacetimeDB files
        // 2. Compressing with gzip/zstd if enabled
        // 3. Writing to backup_path

        // For now, create an empty file
        fs::write(&backup_path, vec![]).await?;

        // Update last backup time
        *self.last_backup.write().unwrap() = Some(Utc::now());

        // Cleanup old backups
        self.cleanup_old_backups().await?;

        info!("Backup completed: {}", backup_name);
        Ok(())
    }

    /// Backup a batch to local storage
    pub async fn backup_batch(&self, batch: &ReplicationBatch) -> ReplicationResult<()> {
        let timestamp = Utc::now().format("%Y-%m-%d_%H-%M-%S%.3f").to_string();
        let batch_name = format!("batch_{}_{}.json", batch.id, timestamp);
        let batch_path = self.config.local_backup.backup_dir.join(&batch_name);

        let batch_json = serde_json::to_string(batch)
            .map_err(|e| crate::error::ReplicationError::SerializationError(e))?;

        fs::write(&batch_path, batch_json).await?;

        Ok(())
    }

    /// Restore from backup
    pub async fn restore_backup(&self, backup_name: &str) -> ReplicationResult<Vec<u8>> {
        let backup_path = self.config.local_backup.backup_dir.join(backup_name);
        let content = fs::read(&backup_path).await?;
        info!("Restored backup: {}", backup_name);
        Ok(content)
    }

    /// List available backups
    pub async fn list_backups(&self) -> ReplicationResult<Vec<String>> {
        let mut entries = fs::read_dir(&self.config.local_backup.backup_dir).await?;
        let mut backups = Vec::new();

        while let Some(entry) = entries.next_entry().await? {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("backup_") {
                    backups.push(name.to_string());
                }
            }
        }

        backups.sort();
        Ok(backups)
    }

    /// Cleanup old backups based on retention policy
    async fn cleanup_old_backups(&self) -> ReplicationResult<()> {
        let retention_days = self.config.retention.local_backups_days as i64;
        let cutoff_date = Utc::now() - chrono::Duration::days(retention_days);

        let mut entries = fs::read_dir(&self.config.local_backup.backup_dir).await?;

        while let Some(entry) = entries.next_entry().await? {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("backup_") {
                    if let Ok(metadata) = entry.metadata().await {
                        if let Ok(modified) = metadata.modified() {
                            let time: chrono::DateTime<Utc> = modified.into();
                            if time < cutoff_date {
                                if let Err(e) = fs::remove_file(entry.path()).await {
                                    warn!("Failed to remove old backup: {}", e);
                                }
                            }
                        }
                    }
                }
            }
        }

        Ok(())
    }

    /// Get last backup time
    pub async fn get_last_backup_time(&self) -> Option<chrono::DateTime<chrono::Utc>> {
        *self.last_backup.read().unwrap()
    }
}
