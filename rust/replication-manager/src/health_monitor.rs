use crate::config::ReplicationConfig;
use crate::remote_sync::RemoteSync;
use crate::error::ReplicationResult;
use std::sync::Arc;
use tokio::time::{interval, Duration};
use std::collections::HashMap;
use tokio::sync::RwLock;
use tracing::{info, warn, error};

/// Health monitoring for backup targets
pub struct HealthMonitor {
    config: Arc<ReplicationConfig>,
    remote_sync: Arc<RemoteSync>,
    target_health: Arc<RwLock<HashMap<String, TargetHealth>>>,
}

#[derive(Debug, Clone)]
struct TargetHealth {
    name: String,
    healthy: bool,
    missed_heartbeats: u32,
    consecutive_failures: u32,
}

impl HealthMonitor {
    pub fn new(config: Arc<ReplicationConfig>, remote_sync: Arc<RemoteSync>) -> Self {
        Self {
            config,
            remote_sync,
            target_health: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Start health monitoring
    pub async fn start(&self) -> ReplicationResult<()> {
        // Initialize health status for all targets
        for backup in &self.config.backups {
            if backup.enabled {
                self.target_health.write().await.insert(
                    backup.name.clone(),
                    TargetHealth {
                        name: backup.name.clone(),
                        healthy: false,
                        missed_heartbeats: 0,
                        consecutive_failures: 0,
                    },
                );
            }
        }

        let mut ticker = interval(Duration::from_secs(
            self.config.health_check.interval_secs,
        ));

        loop {
            ticker.tick().await;
            if let Err(e) = self.check_targets().await {
                error!("Health check failed: {}", e);
            }
        }
    }

    /// Check health of all targets
    async fn check_targets(&self) -> ReplicationResult<()> {
        for backup in &self.config.backups {
            if !backup.enabled {
                continue;
            }

            let name = backup.name.clone();
            let timeout = Duration::from_secs(self.config.health_check.timeout_secs);

            let result = tokio::time::timeout(
                timeout,
                self.health_check_target(&backup.backup_type, &backup.connection.endpoint),
            )
            .await;

            let is_healthy = result.is_ok() && result.unwrap().is_ok();

            if let Some(mut health) = self.target_health.write().await.get_mut(&name) {
                if is_healthy {
                    health.healthy = true;
                    health.missed_heartbeats = 0;
                    health.consecutive_failures = 0;
                    info!("Target {} is healthy", name);
                } else {
                    health.missed_heartbeats += 1;
                    health.consecutive_failures += 1;

                    if health.missed_heartbeats
                        >= self.config.health_check.missed_heartbeats_threshold
                    {
                        health.healthy = false;
                        warn!("Target {} marked unhealthy", name);
                    }
                }
            }
        }

        Ok(())
    }

    /// Health check for a specific target
    async fn health_check_target(
        &self,
        backup_type: &str,
        endpoint: &str,
    ) -> ReplicationResult<()> {
        match backup_type {
            "spacetimedb" => self.health_check_spacetimedb(endpoint).await,
            "s3" => self.health_check_s3(endpoint).await,
            "nfs" => self.health_check_nfs(endpoint).await,
            _ => Err(crate::error::ReplicationError::HealthCheckFailed(
                format!("Unknown backup type: {}", backup_type),
            )),
        }
    }

    async fn health_check_spacetimedb(&self, endpoint: &str) -> ReplicationResult<()> {
        // TODO: Implement actual health check via gRPC
        info!("Health check SpacetimeDB: {}", endpoint);
        Ok(())
    }

    async fn health_check_s3(&self, endpoint: &str) -> ReplicationResult<()> {
        // TODO: Implement S3 health check
        info!("Health check S3: {}", endpoint);
        Ok(())
    }

    async fn health_check_nfs(&self, endpoint: &str) -> ReplicationResult<()> {
        // TODO: Implement NFS health check
        info!("Health check NFS: {}", endpoint);
        Ok(())
    }

    /// Get health status
    pub async fn get_health_status(&self) -> HashMap<String, TargetHealth> {
        self.target_health.read().await.clone()
    }
}
