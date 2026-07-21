# CCTV/DVR System with SpacetimeDB - Implementation Guide

## Current Progress

### ✅ Completed

#### Architecture & Documentation
- [x] README with full overview
- [x] Cargo.toml workspace structure
- [x] SpacetimeDB schema (14 tables)
- [x] Protocol Buffers definitions
- [x] Configuration templates (cameras, models)
- [x] Architecture documentation
- [x] Schema design documentation

#### Rust Modules
- [x] `rust/core` - Frame structures and ingestion skeleton
- [x] `rust/spacetime-client` - Event types and client interface
- [x] `rust/event-normalizer` - Event validation and normalization
- [x] `rust/api-server` - gRPC server skeleton

#### C++ Modules
- [x] `cpp/vision-pipeline` - Full header + implementation stubs
  - FaceDetector with ArcFace
  - PlateDetector with OCR
  - PoseEstimator (HRNet)
  - ActivityClassifier
  - AnomalyDetector
- [x] `cpp/video-ingestion` - FFmpeg decoder with hardware acceleration
  - FFmpegDecoder (NVDEC, VAAPI, QSV)
  - FrameRingBuffer (zero-copy)
  - CameraIngester (multi-camera coordinator)
- [x] `cpp/spacetime-integration` - SpacetimeDB client
  - Event insertion methods
  - Query operations
  - Batch processing

### 🔄 Next Priority Tasks

#### Phase 1: Core Infrastructure (Weeks 1-2)

1. **FFmpeg Integration** (C++)
   - [ ] Complete `FFmpegDecoder::open()` with full RTSP/MJPEG decoding
   - [ ] Implement hardware acceleration setup
   - [ ] Frame extraction and buffering
   - [ ] Test with real camera streams
   - **Files**: `cpp/video-ingestion/src/ffmpeg_decoder.cpp`

2. **Vision Models Loading** (C++)
   - [ ] ONNX Runtime session management
   - [ ] TensorRT engine compilation and caching
   - [ ] GPU memory allocation
   - [ ] Implement FaceDetector::detect() full inference pipeline
   - **Files**: `cpp/vision-pipeline/src/face_detector.cpp`

3. **Rust FFmpeg Bindings** (Rust)
   - [ ] Create safe Rust wrappers for FFmpeg
   - [ ] Implement `VideoIngester::start_stream()`
   - [ ] Connect to C++ pipeline
   - **Files**: `rust/core/src/ingester.rs`

#### Phase 2: Event Pipeline (Weeks 3-4)

4. **SpacetimeDB Connection** (Rust + C++)
   - [ ] Implement gRPC client connection pooling
   - [ ] Batch insert optimization
   - [ ] Retry logic with exponential backoff
   - [ ] Connection health checks
   - **Files**:
     - `rust/spacetime-client/src/connection.rs`
     - `cpp/spacetime-integration/src/spacetime_client.cpp`

5. **Event Normalization** (Rust)
   - [ ] Complete normalizer implementation
   - [ ] Type validation
   - [ ] Error handling and dead-letter queuing
   - **Files**: `rust/event-normalizer/src/normalizer.rs`

6. **Inference Pipeline** (C++)
   - [ ] Implement all detector::detect() methods
   - [ ] Parallel inference (faces + plates + pose simultaneously)
   - [ ] Batch processing optimization
   - [ ] Performance profiling
   - **Files**: `cpp/vision-pipeline/src/*.cpp`

#### Phase 3: Advanced Features (Weeks 5-6)

7. **Audio Pipeline** (Rust + C++)
   - [ ] FFmpeg audio extraction
   - [ ] Whisper.cpp integration
   - [ ] Real-time transcription
   - **Files**:
     - `cpp/video-ingestion/src/audio_extractor.cpp`
     - `rust/core/src/audio_pipeline.rs`

8. **Anomaly Detection** (C++)
   - [ ] 3D-CNN temporal analysis
   - [ ] Optical flow computation
   - [ ] Multi-frame buffering
   - **Files**: `cpp/vision-pipeline/src/anomaly_detector.cpp`

9. **Activity Classification** (C++)
   - [ ] Pose sequence accumulation
   - [ ] Activity classifier inference
   - [ ] Skeleton tracking
   - **Files**: `cpp/vision-pipeline/src/activity_classifier.cpp`

#### Phase 4: Integration & Optimization (Weeks 7-8)

10. **API Server** (Rust)
    - [ ] gRPC service implementation
    - [ ] Query endpoints
    - [ ] Alert management
    - [ ] Real-time subscriptions
    - **Files**: `rust/api-server/src/`

11. **Docker Deployment**
    - [ ] Multi-stage Dockerfile for C++
    - [ ] Rust application container
    - [ ] docker-compose.yml
    - [ ] Environment configuration
    - **Files**: `docker/`

12. **Performance Tuning**
    - [ ] GPU memory profiling
    - [ ] Latency measurements
    - [ ] Throughput optimization
    - [ ] Edge device testing

---

## Development Setup

### Prerequisites

```bash
# System packages (Ubuntu 22.04)
sudo apt-get install -y \
  build-essential cmake \
  libcuda-dev \
  libcudnn8-dev \
  libtensorrt-dev \
  libopencv-dev \
  libavformat-dev libavcodec-dev libswscale-dev \
  libssl-dev pkg-config

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# SpacetimeDB CLI
curl --proto '=https' --tlsv1.2 -sSf https://install.spacetimedb.com | sh
```

### Build

```bash
# Rust
cd rust && cargo build --release

# C++
cd cpp && mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release ..
make -j$(nproc)

# Both
make -j$(nproc)  # In root directory if you have a master Makefile
```

---

## Implementation Details by Component

### FFmpeg Decoder (C++)

**Key Functions to Implement**:
- `open()` - Open RTSP stream with fallback logic
- `setup_hwaccel()` - Configure NVIDIA/AMD/Intel acceleration
- `decode_loop()` - Main decode thread with frame extraction
- Hardware frame mapping (CUDA/DMA-BUF)

**Performance Targets**:
- 4x 1080p@30fps streams on RTX 3060
- <50ms latency per frame
- Hardware decoding offloads CPU

### Vision Pipeline (C++)

**Inference Execution Order** (per frame):
1. Face detection (YOLOv8) → get person bboxes
2. Plate detection (YOLOv8) → get vehicle plates
3. Pose estimation (HRNet) → 17 keypoints per person
4. Activity classification → from pose sequence (buffer 16 frames)
5. Anomaly detection → from optical flow (buffer 30 frames)

**Batch Sizes** (configurable in `models-config.yaml`):
- Face: 4 images
- Plate: 8 images
- Pose: 16 images
- Anomaly: 30 images (temporal)

### SpacetimeDB Integration (Rust/C++)

**Insert Flow**:
```
Raw Detection (C++)
    ↓
Normalize (Rust)
    ↓
Batch Queue (Rust) [accumulate 100ms]
    ↓
SpacetimeDB Batch Insert (gRPC)
    ↓
Event Store (SQL)
```

**Query Examples**:
```sql
-- All faces in last hour for camera
SELECT * FROM face_events
WHERE camera_id = 'lobby_main'
  AND timestamp > now() - INTERVAL 1 HOUR
ORDER BY timestamp DESC;

-- Vehicle trajectory
SELECT * FROM tracks
WHERE entity_type = 'vehicle'
  AND entity_id = 'vehicle_XYZ1234'
ORDER BY start_timestamp;

-- High-severity anomalies
SELECT * FROM anomaly_events
WHERE severity = 'high'
  AND timestamp > now() - INTERVAL 24 HOURS;
```

---

## Testing Strategy

### Unit Tests
- Frame buffer correctness
- Event normalization
- Query builder

### Integration Tests
- FFmpeg → Vision → SpacetimeDB pipeline
- Multi-camera coordination
- Connection recovery

### Performance Tests
- Throughput: frames/sec across cameras
- Latency: frame arrival → event stored
- Memory: peak usage with different configs
- GPU utilization

### Edge Device Testing
- Jetson Orin Nano (4 GB RAM)
- Raspberry Pi 4 (8 GB RAM)
- x86 NUC with integrated GPU

---

## Deployment Checklist

- [ ] All models downloaded and quantized (INT8 for edge)
- [ ] Docker images built and tested
- [ ] SpacetimeDB instance running
- [ ] Camera credentials configured
- [ ] SSL certificates set up
- [ ] Monitoring/logging configured
- [ ] Backup strategy for events database
- [ ] Performance baselines established

---

## References

- [FFmpeg Hardware Acceleration](https://trac.ffmpeg.org/wiki/HWAccelIntro)
- [ONNX Runtime Performance Tuning](https://onnxruntime.ai/docs/performance/)
- [TensorRT Best Practices](https://docs.nvidia.com/deeplearning/tensorrt/developer-guide/)
- [SpacetimeDB SQL](https://spacetimedb.com/docs/sql)
- [COCO Pose Format](https://cocodataset.org/#keypoints-2016)

