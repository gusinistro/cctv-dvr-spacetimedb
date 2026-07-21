#include "../include/ffmpeg_decoder.hpp"
#include <thread>
#include <chrono>

// Forward declarations (FFmpeg)
extern "C" {
#include <libavformat/avformat.h>
#include <libavcodec/avcodec.h>
#include <libswscale/swscale.h>
}

namespace cctv::core {

FFmpegDecoder::FFmpegDecoder(const std::string& stream_url, HardwareAccel hwaccel)
    : stream_url_(stream_url),
      hwaccel_(hwaccel),
      width_(0),
      height_(0),
      fps_(0),
      is_open_(false),
      decoding_active_(false),
      format_ctx_(nullptr),
      codec_ctx_(nullptr),
      frame_(nullptr),
      packet_(nullptr) {}

FFmpegDecoder::~FFmpegDecoder() { close(); }

bool FFmpegDecoder::open() {
    std::lock_guard<std::mutex> lock(state_mutex_);

    if (is_open_) {
        return true;
    }

    // TODO: Initialize FFmpeg contexts
    // 1. avformat_open_input()
    // 2. avformat_find_stream_info()
    // 3. Find video stream
    // 4. Setup hardware acceleration if requested
    // 5. avcodec_open2()

    is_open_ = true;
    return true;
}

void FFmpegDecoder::close() {
    std::lock_guard<std::mutex> lock(state_mutex_);

    stop_decoding();

    // TODO: Clean up FFmpeg resources
    // av_packet_free()
    // av_frame_free()
    // avcodec_free_context()
    // avformat_close_input()

    is_open_ = false;
}

bool FFmpegDecoder::start_decoding(FrameCallback callback, int target_fps) {
    if (!is_open_) {
        std::cerr << "Decoder not open" << std::endl;
        return false;
    }

    if (decoding_active_) {
        return true;  // Already running
    }

    decoding_active_ = true;
    decode_thread_ = std::make_unique<std::thread>(
        &FFmpegDecoder::decode_loop, this, callback, target_fps);

    return true;
}

void FFmpegDecoder::stop_decoding() {
    decoding_active_ = false;
    if (decode_thread_ && decode_thread_->joinable()) {
        decode_thread_->join();
    }
}

void FFmpegDecoder::decode_loop(FrameCallback callback, int target_fps) {
    std::chrono::milliseconds frame_delay(1000 / target_fps);

    while (decoding_active_) {
        // TODO: av_read_frame()
        // TODO: avcodec_send_packet()
        // TODO: avcodec_receive_frame()
        // TODO: Handle hardware frames
        // TODO: Convert to target format
        // TODO: Call callback with frame data

        std::this_thread::sleep_for(frame_delay);
    }
}

bool FFmpegDecoder::setup_hwaccel() {
    // TODO: Setup hardware acceleration based on hwaccel_ enum
    // NVDEC: av_hwdevice_ctx_create() with AV_HWDEVICE_TYPE_CUDA
    // VAAPI: AV_HWDEVICE_TYPE_VAAPI
    // QSV: AV_HWDEVICE_TYPE_QSV
    return true;
}

// FrameRingBuffer Implementation

FrameRingBuffer::FrameRingBuffer(size_t num_buffers, size_t buffer_size)
    : buffer_size_(buffer_size),
      write_idx_(0),
      read_idx_(0),
      available_frames_(0) {
    buffers_.resize(num_buffers);
    frame_sizes_.resize(num_buffers);

    for (auto& buf : buffers_) {
        buf.resize(buffer_size);
    }
}

FrameRingBuffer::~FrameRingBuffer() = default;

uint8_t* FrameRingBuffer::acquire_write_buffer() {
    std::unique_lock<std::mutex> lock(mutex_);

    // Wait if buffer is full
    cv_write_.wait(lock, [this]() {
        return available_frames_ < buffers_.size() - 1;
    });

    return buffers_[write_idx_].data();
}

void FrameRingBuffer::release_write_buffer(size_t bytes_written) {
    std::lock_guard<std::mutex> lock(mutex_);

    frame_sizes_[write_idx_] = bytes_written;
    write_idx_ = (write_idx_ + 1) % buffers_.size();
    available_frames_++;

    cv_read_.notify_one();
}

const uint8_t* FrameRingBuffer::acquire_read_frame(size_t& frame_size) {
    std::unique_lock<std::mutex> lock(mutex_);

    // Wait if no frames available
    cv_read_.wait(lock, [this]() { return available_frames_ > 0; });

    frame_size = frame_sizes_[read_idx_];
    return buffers_[read_idx_].data();
}

void FrameRingBuffer::release_read_frame() {
    std::lock_guard<std::mutex> lock(mutex_);

    read_idx_ = (read_idx_ + 1) % buffers_.size();
    available_frames_--;

    cv_write_.notify_one();
}

size_t FrameRingBuffer::get_available_frames() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return available_frames_;
}

// CameraIngester Implementation

CameraIngester::CameraIngester(size_t max_concurrent_streams)
    : max_concurrent_streams_(max_concurrent_streams) {}

CameraIngester::~CameraIngester() { stop_all(); }

bool CameraIngester::add_camera(const CameraConfig& config) {
    std::lock_guard<std::mutex> lock(cameras_mutex_);

    if (decoders_.size() >= max_concurrent_streams_) {
        std::cerr << "Max concurrent streams reached" << std::endl;
        return false;
    }

    auto hwaccel = config.enable_hwaccel ? FFmpegDecoder::HardwareAccel::AUTO
                                          : FFmpegDecoder::HardwareAccel::NONE;

    auto decoder = std::make_unique<FFmpegDecoder>(config.rtsp_url, hwaccel);

    if (!decoder->open()) {
        std::cerr << "Failed to open stream: " << config.rtsp_url << std::endl;
        return false;
    }

    decoders_[config.camera_id] = std::move(decoder);
    buffers_[config.camera_id] = std::make_unique<FrameRingBuffer>(
        8,  // 8 frame buffers
        config.max_width * config.max_height * 4  // RGBA
    );

    std::cout << "[CameraIngester] Added camera: " << config.camera_id
              << " (" << config.rtsp_url << ")" << std::endl;

    return true;
}

bool CameraIngester::remove_camera(const std::string& camera_id) {
    std::lock_guard<std::mutex> lock(cameras_mutex_);

    stop_camera(camera_id);

    decoders_.erase(camera_id);
    buffers_.erase(camera_id);
    callbacks_.erase(camera_id);

    return true;
}

bool CameraIngester::start_camera(const std::string& camera_id) {
    std::lock_guard<std::mutex> lock(cameras_mutex_);

    auto it = decoders_.find(camera_id);
    if (it == decoders_.end()) {
        return false;
    }

    auto callback_it = callbacks_.find(camera_id);
    if (callback_it == callbacks_.end()) {
        std::cerr << "No callback registered for: " << camera_id << std::endl;
        return false;
    }

    return it->second->start_decoding(callback_it->second, 30);
}

void CameraIngester::stop_camera(const std::string& camera_id) {
    std::lock_guard<std::mutex> lock(cameras_mutex_);

    auto it = decoders_.find(camera_id);
    if (it != decoders_.end()) {
        it->second->stop_decoding();
    }
}

void CameraIngester::stop_all() {
    std::lock_guard<std::mutex> lock(cameras_mutex_);

    for (auto& pair : decoders_) {
        pair.second->stop_decoding();
    }
}

void CameraIngester::register_frame_consumer(
    const std::string& camera_id,
    FrameCallback callback) {
    std::lock_guard<std::mutex> lock(cameras_mutex_);
    callbacks_[camera_id] = callback;
}

std::vector<std::string> CameraIngester::get_active_cameras() const {
    std::lock_guard<std::mutex> lock(cameras_mutex_);
    std::vector<std::string> active;

    for (const auto& pair : decoders_) {
        if (pair.second->is_open()) {
            active.push_back(pair.first);
        }
    }

    return active;
}

bool CameraIngester::get_camera_info(const std::string& camera_id, int& width,
                                      int& height, int& fps) const {
    std::lock_guard<std::mutex> lock(cameras_mutex_);

    auto it = decoders_.find(camera_id);
    if (it == decoders_.end()) {
        return false;
    }

    width = it->second->get_width();
    height = it->second->get_height();
    fps = it->second->get_fps();

    return true;
}

}  // namespace cctv::core
