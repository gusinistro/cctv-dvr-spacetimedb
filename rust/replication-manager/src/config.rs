use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicationConfig {
    /// Replication mode: "synchronous", "asynchronous", or "hybrid"
    pub mode: ReplicationMode,

    /// Batch size for replication events
    pub batch_size: usize,

    /// Batch timeout in milliseconds
    pub batch_timeout_ms: u64,

    /// Local backup configuration
    pub local_backup: LocalBackupConfig,

    /// Remote backup targets
    pub backups: Vec<BackupTarget>,

    /// Health check configuration
    pub health_check: HealthCheckConfig,

    /// Failover configuration
    pub failover: FailoverConfig,

    /// Retention policies
    pub retention: RetentionPolicy,

    /// Tables that require synchronous replication (for hybrid mode)
    pub critical_tables: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ReplicationMode {
    /// Wait for acknowledgment from all remotes before committing
    Synchronous,
    /// Commit locally, async replication
    Asynchronous,
    /// Critical tables sync, others async
    Hybrid,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalBackupConfig {
    /// Directory for local backups
    pub backup_dir: PathBuf,

    /// Whether to enable compression
    pub compression: bool,

    /// Compression format: "gzip" or "zstd"
    pub compression_format: String,

    /// Backup interval in seconds
    pub interval_secs: u64,

    /// Maximum local backup retention days
    pub retention_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupTarget {
    /// Backup target name
    pub name: String,

    /// Backup type: "spacetimedb", "s3", "azure_blob", "nfs"
    pub backup_type: String,

    /// Connection configuration
    pub connection: BackupConnection,

    /// Sync interval in seconds
    pub sync_interval_secs: u64,

    /// Priority (lower = preferred in failover)
    pub priority: u32,

    /// Whether this backup is enabled
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupConnection {
    /// Connection string or endpoint
    pub endpoint: String,

    /// TLS enabled
    pub tls: bool,

    /// Certificate path (optional)
    pub cert_path: Option<PathBuf>,

    /// Authentication credentials
    #[serde(default)]
    pub credentials: BackupCredentials,

    /// Connection timeout in seconds
    pub timeout_secs: u64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BackupCredentials {
    /// Access key or username
    pub access_key: Option<String>,

    /// Secret key or password
    pub secret_key: Option<String>,

    /// Region (for S3, Azure, etc.)
    pub region: Option<String>,

    /// API key
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthCheckConfig {
    /// Health check interval in seconds
    pub interval_secs: u64,

    /// Health check timeout in seconds
    pub timeout_secs: u64,

    /// Number of missed heartbeats before marking unhealthy
    pub missed_heartbeats_threshold: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailoverConfig {
    /// Automatic promotion of backup to primary
    pub auto_promote: bool,

    /// Failover timeout in seconds
    pub timeout_secs: u64,

    /// Number of promotion attempts
    pub max_attempts: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RetentionPolicy {
    /// Local backup retention in days
    pub local_backups_days: u32,

    /// Remote backup retention in days
    pub remote_backups_days: u32,

    /// Enable compression for old backups
    pub compress_after_days: u32,
}

impl ReplicationConfig {
    /// Load configuration from YAML file
    pub fn from_file(path: &std::path::Path) -> crate::error::ReplicationResult<Self> {
        let content = std::fs::read_to_string(path)?;
        let config: Self = serde_yaml::from_str(&content)
            .map_err(|e| crate::error::ReplicationError::ConfigError(e.to_string()))?;
        config.validate()?;
        Ok(config)
    }

    /// Validate configuration
    pub fn validate(&self) -> crate::error::ReplicationResult<()> {
        if self.batch_size == 0 {
            return Err(crate::error::ReplicationError::ConfigError(
                "batch_size must be > 0".to_string(),
            ));
        }

        if self.backups.is_empty() && self.mode != ReplicationMode::Asynchronous {
            return Err(crate::error::ReplicationError::ConfigError(
                "At least one backup target required".to_string(),
            ));
        }

        if self.critical_tables.is_empty() && self.mode == ReplicationMode::Hybrid {
            tracing::warn!("Hybrid mode configured but no critical_tables specified");
        }

        Ok(())
    }
}

impl Default for ReplicationConfig {
    fn default() -> Self {
        Self {
            mode: ReplicationMode::Asynchronous,
            batch_size: 500,
            batch_timeout_ms: 100,
            local_backup: LocalBackupConfig {
                backup_dir: PathBuf::from("/opt/spacetimedb/backups"),
                compression: true,
                compression_format: "gzip".to_string(),
                interval_secs: 3600, // 1 hour
                retention_days: 30,
            },
            backups: vec![],
            health_check: HealthCheckConfig {
                interval_secs: 5,
                timeout_secs: 10,
                missed_heartbeats_threshold: 3,
            },
            failover: FailoverConfig {
                auto_promote: true,
                timeout_secs: 120,
                max_attempts: 3,
            },
            retention: RetentionPolicy {
                local_backups_days: 30,
                remote_backups_days: 90,
                compress_after_days: 7,
            },
            critical_tables: vec![
                "anomaly_events".to_string(),
                "security_alerts".to_string(),
            ],
        }
    }
}
