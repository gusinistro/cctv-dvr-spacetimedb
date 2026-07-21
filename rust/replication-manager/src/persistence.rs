use crate::error::ReplicationResult;
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;

/// Persistent state for replication
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicationState {
    /// Current node role
    pub role: NodeRole,

    /// Last replicated batch ID
    pub last_batch_id: String,

    /// Last backup timestamp
    pub last_backup_timestamp: i64,

    /// Replication lag in ms
    pub replication_lag_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeRole {
    Primary,
    Backup,
    Syncing,
}

impl ReplicationState {
    /// Load state from file
    pub async fn load(path: &Path) -> ReplicationResult<Option<Self>> {
        if !path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(path).await?;
        let state: Self = serde_json::from_str(&content)
            .map_err(|e| crate::error::ReplicationError::SerializationError(e))?;

        Ok(Some(state))
    }

    /// Save state to file
    pub async fn save(&self, path: &Path) -> ReplicationResult<()> {
        let content = serde_json::to_string_pretty(self)
            .map_err(|e| crate::error::ReplicationError::SerializationError(e))?;
        fs::write(path, content).await?;
        Ok(())
    }
}
