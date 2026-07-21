#[cfg(test)]
mod tests {
    use crate::queue::{ReplicationEvent, ReplicationQueue, ReplicationBatch};
    use serde_json::json;

    #[tokio::test]
    async fn test_replication_queue_operations() {
        let queue = ReplicationQueue::new(100);

        // Add events
        for i in 0..5 {
            let event = ReplicationEvent::new(
                "face_events".to_string(),
                "INSERT".to_string(),
                json!({"camera_id": format!("cam_{}", i)}),
                false,
            );
            queue.push_event(event).await.unwrap();
        }

        // Check batch size
        assert_eq!(queue.current_batch_size().await, 5);

        // Flush batch
        queue.flush_batch().await.unwrap();
        assert_eq!(queue.len().await, 1);
        assert_eq!(queue.current_batch_size().await, 0);

        // Pop batch
        let batch = queue.pop_batch().await.unwrap();
        assert_eq!(batch.events.len(), 5);
        assert!(queue.is_empty().await);
    }

    #[test]
    fn test_replication_batch() {
        let mut batch = ReplicationBatch::new();
        
        let event = ReplicationEvent::new(
            "anomaly_events".to_string(),
            "INSERT".to_string(),
            json!({"severity": "high"}),
            true,
        );

        batch.add_event(event).unwrap();
        assert!(batch.has_critical());
        assert!(!batch.is_empty());
    }
}
