//! Replication Manager for SpacetimeDB
//!
//! This module provides:
//! - Local/remote backup orchestration
//! - Asynchronous and synchronous replication
//! - Automatic failover
//! - Health monitoring
//! - Point-in-time recovery

pub mod config;
pub mod replicator;
pub mod backup_store;
pub mod remote_sync;
pub mod health_monitor;
pub mod failover;
pub mod queue;
pub mod persistence;
pub mod metrics;
pub mod error;

pub use config::ReplicationConfig;
pub use replicator::ReplicationManager;
pub use backup_store::BackupStore;
pub use remote_sync::RemoteSync;
pub use health_monitor::HealthMonitor;
pub use failover::FailoverManager;
pub use queue::ReplicationQueue;
pub use error::ReplicationError;

#[cfg(test)]
mod tests;
