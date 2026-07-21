#pragma once

#include <iostream>
#include <memory>
#include <queue>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <chrono>
#include <functional>

namespace cctv::core {

// Frame processing callback
using FrameCallback = std::function<void(const std::vector<uint8_t>&, size_t, size_t)>;

/**
 * FFmpeg-based video stream decoder
 * Handles RTSP, MJPEG, and other protocols
 * Supports hardware acceleration (NVDEC, VAAPI, QSV)
 */
class FFmpegDecoder {
public:
    enum class HardwareAccel {
        NONE,
        NVDEC,    // NVIDIA
        VAAPI,    // Intel/AMD
        QSV,      // Intel Media SDK
        VIDEOTOOLBOX,  // Apple
    };

    FFmpegDecoder(const std::string& stream_url, HardwareAccel hwaccel = HardwareAccel::AUTO);
    ~FFmpegDecoder();

    bool open();
    void close();
    bool is_open() const { return is_open_; }

    // Start decoding in separate thread
    bool start_decoding(FrameCallback callback, int target_fps = 30);
    void stop_decoding();

    // Get stream properties
    int get_width() const { return width_; }
    int get_height() const { return height_; }
    int get_fps() const { return fps_; }
    const std::string& get_stream_url() const { return stream_url_; }

private:
    void decode_loop(FrameCallback callback, int target_fps);
    bool setup_hwaccel();

    std::string stream_url_;
    HardwareAccel hwaccel_;
    int width_, height_, fps_;
    bool is_open_;
    bool decoding_active_;

    std::unique_ptr<std::thread> decode_thread_;
    std::mutex state_mutex_;

    // FFmpeg context pointers (opaque)
    void* format_ctx_;
    void* codec_ctx_;
    void* frame_;
    void* packet_;
};

/**
 * Ring buffer for zero-copy frame passing
 */
class FrameRingBuffer {
public:
    explicit FrameRingBuffer(size_t num_buffers, size_t buffer_size);
    ~FrameRingBuffer();

    // Get next writable buffer
    uint8_t* acquire_write_buffer();
    void release_write_buffer(size_t bytes_written);

    // Get next readable frame
    const uint8_t* acquire_read_frame(size_t& frame_size);
    void release_read_frame();

    size_t get_buffer_size() const { return buffer_size_; }
    size_t get_available_frames() const;

private:
    std::vector<std::vector<uint8_t>> buffers_;
    std::vector<size_t> frame_sizes_;
    size_t write_idx_;
    size_t read_idx_;
    size_t available_frames_;

    mutable std::mutex mutex_;
    std::condition_variable cv_write_;
    std::condition_variable cv_read_;
};

/**
 * Multi-camera ingester coordinator
 */
class CameraIngester {
public:
    struct CameraConfig {
        std::string camera_id;
        std::string rtsp_url;
        int target_fps;
        int max_width, max_height;
        bool enable_hwaccel;
    };

    explicit CameraIngester(size_t max_concurrent_streams = 4);
    ~CameraIngester();

    bool add_camera(const CameraConfig& config);
    bool remove_camera(const std::string& camera_id);
    bool start_camera(const std::string& camera_id);
    void stop_camera(const std::string& camera_id);
    void stop_all();

    // Register frame consumer callback
    void register_frame_consumer(
        const std::string& camera_id,
        FrameCallback callback
    );

    // Get camera info
    std::vector<std::string> get_active_cameras() const;
    bool get_camera_info(const std::string& camera_id,
                         int& width, int& height, int& fps) const;

private:
    std::map<std::string, std::unique_ptr<FFmpegDecoder>> decoders_;
    std::map<std::string, FrameCallback> callbacks_;
    std::map<std::string, std::unique_ptr<FrameRingBuffer>> buffers_;

    size_t max_concurrent_streams_;
    mutable std::mutex cameras_mutex_;
};

}  // namespace cctv::core
