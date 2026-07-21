use replication_manager::{ReplicationManager, ReplicationConfig};
use std::path::PathBuf;
use tracing_subscriber;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("replication_manager=info".parse()?),
        )
        .init();

    // Load configuration
    let config_path = std::env::var("REPLICATION_CONFIG")
        .unwrap_or_else(|_| "config/replication.yaml".to_string());
    
    let config = ReplicationConfig::from_file(PathBuf::from(&config_path).as_path())?;
    
    // Create and start replication manager
    let manager = ReplicationManager::new(config).await?;
    manager.start().await?;
    
    // Keep running
    tokio::signal::ctrl_c().await?;
    println!("Shutting down...");
    
    Ok(())
}
