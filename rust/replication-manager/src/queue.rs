use crate::error::ReplicationResult;
use serde_json::{json, Value};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc};

/// Event batch for replication
#[derive(Debug, Clone)]
pub struct ReplicationEvent {
    /// Unique event ID
    pub id: String,

    /// Table name
    pub table: String,

    /// Operation: INSERT, UPDATE, DELETE
    pub operation: String,

    /// Event data
    pub data: Value,

    /// Timestamp
    pub timestamp: DateTime<Utc>,

    /// Whether this event requires synchronous replication
    pub critical: bool,
}

impl ReplicationEvent {
    pub fn new(
        table: String,
        operation: String,
        data: Value,
        critical: bool,
    ) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            table,
            operation,
            data,
            timestamp: Utc::now(),
            critical,
        }
    }
}

/// Batch of replication events
#[derive(Debug, Clone)]
pub struct ReplicationBatch {
    pub id: String,
    pub events: Vec<ReplicationEvent>,
    pub created_at: DateTime<Utc>,
    pub size_bytes: usize,
}

impl ReplicationBatch {
    pub fn new() -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            events: Vec::new(),
            created_at: Utc::now(),
            size_bytes: 0,
        }
    }

    pub fn add_event(&mut self, event: ReplicationEvent) -> ReplicationResult<()> {
        let size = serde_json::to_string(&event.data)
            .unwrap_or_default()
            .len();
        self.events.push(event);
        self.size_bytes += size;
        Ok(())
    }

    pub fn is_full(&self, max_size: usize) -> bool {
        self.size_bytes >= max_size
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn has_critical(&self) -> bool {
        self.events.iter().any(|e| e.critical)
    }
}

/// Queue for batching replication events
pub struct ReplicationQueue {
    queue: Arc<RwLock<VecDeque<ReplicationBatch>>>,
    current_batch: Arc<RwLock<ReplicationBatch>>,
    max_queue_size: usize,
}

impl ReplicationQueue {
    pub fn new(max_queue_size: usize) -> Self {
        Self {
            queue: Arc::new(RwLock::new(VecDeque::new())),
            current_batch: Arc::new(RwLock::new(ReplicationBatch::new())),
            max_queue_size,
        }
    }

    /// Add event to current batch
    pub async fn push_event(&self, event: ReplicationEvent) -> ReplicationResult<()> {
        let mut batch = self.current_batch.write().await;
        batch.add_event(event)?;
        Ok(())
    }

    /// Flush current batch to queue if not empty
    pub async fn flush_batch(&self) -> ReplicationResult<()> {
        let mut batch = self.current_batch.write().await;
        if !batch.is_empty() {
            let mut queue = self.queue.write().await;
            if queue.len() >= self.max_queue_size {
                return Err(crate::error::ReplicationError::QueueOverflow);
            }
            queue.push_back(batch.clone());
            *batch = ReplicationBatch::new();
        }
        Ok(())
    }

    /// Get next batch to replicate
    pub async fn pop_batch(&self) -> Option<ReplicationBatch> {
        let mut queue = self.queue.write().await;
        queue.pop_front()
    }

    /// Get queue length
    pub async fn len(&self) -> usize {
        self.queue.read().await.len()
    }

    /// Check if queue is empty
    pub async fn is_empty(&self) -> bool {
        self.queue.read().await.is_empty()
    }

    /// Get current batch size
    pub async fn current_batch_size(&self) -> usize {
        self.current_batch.read().await.events.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_replication_queue() {
        let queue = ReplicationQueue::new(10);
        
        let event = ReplicationEvent::new(
            "face_events".to_string(),
            "INSERT".to_string(),
            json!({"camera_id": "cam_1", "confidence": 0.95}),
            false,
        );

        queue.push_event(event).await.unwrap();
        assert_eq!(queue.current_batch_size().await, 1);

        queue.flush_batch().await.unwrap();
        assert_eq!(queue.len().await, 1);
        assert_eq!(queue.current_batch_size().await, 0);

        let batch = queue.pop_batch().await.unwrap();
        assert_eq!(batch.events.len(), 1);
    }
}
