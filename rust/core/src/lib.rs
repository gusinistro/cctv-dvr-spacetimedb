//! CCTV Core Streaming Module - Complete Implementation
//!
//! Handles video ingestion, frame extraction, and preprocessing
//! for maximum performance on edge hardware.

pub mod ingester;
pub mod frame;
pub mod config;
pub mod audio_pipeline;

pub use ingester::VideoIngester;
pub use frame::{Frame, FrameBuffer};
pub use config::IngesterConfig;

/// Initialize the core module
pub fn init() -> anyhow::Result<()> {
    tracing::info!("Initializing CCTV Core module");
    Ok(())
}
