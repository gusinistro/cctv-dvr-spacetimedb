use thiserror::Error;

#[derive(Error, Debug)]
pub enum ReplicationError {
    #[error("Configuration error: {0}")]
    ConfigError(String),

    #[error("Connection failed: {0}")]
    ConnectionFailed(String),

    #[error("Replication failed: {0}")]
    ReplicationFailed(String),

    #[error("Backup failed: {0}")]
    BackupFailed(String),

    #[error("Restore failed: {0}")]
    RestoreFailed(String),

    #[error("Failover failed: {0}")]
    FailoverFailed(String),

    #[error("Health check failed: {0}")]
    HealthCheckFailed(String),

    #[error("Queue overflow")]
    QueueOverflow,

    #[error("Serialization error: {0}")]
    SerializationError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Database error: {0}")]
    DatabaseError(String),

    #[error("Timeout")]
    Timeout,

    #[error("Invalid state: {0}")]
    InvalidState(String),
}

pub type ReplicationResult<T> = Result<T, ReplicationError>;
