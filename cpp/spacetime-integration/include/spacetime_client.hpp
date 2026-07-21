#pragma once

#include <string>
#include <vector>
#include <memory>
#include <map>
#include <chrono>
#include <mutex>
#include <queue>

namespace cctv::spacetime {

/**
 * SpacetimeDB Event Structures
 */

struct FaceEvent {
    std::string face_id;
    std::vector<float> embedding;  // 512-D
    std::string matched_person_id;
    std::string matched_person_name;
    float confidence;
    std::chrono::system_clock::time_point timestamp;
};

struct VoiceEvent {
    std::string transcript;
    std::string language;
    std::string speaker_id;
    std::string speaker_name;
    float confidence;
    std::chrono::system_clock::time_point timestamp;
};

struct PlateEvent {
    std::string plate_text;
    std::string vehicle_class;
    float confidence;
    std::string image_path;
    std::chrono::system_clock::time_point timestamp;
};

struct AnomalyEvent {
    std::string anomaly_type;  // fighting, intrusion, etc.
    std::string description;
    std::string severity;  // low, medium, high
    float confidence;
    std::chrono::system_clock::time_point timestamp;
};

struct PoseEvent {
    std::vector<std::tuple<float, float, float>> keypoints;  // x, y, confidence
    std::string skeleton_id;
    float confidence;
    std::chrono::system_clock::time_point timestamp;
};

struct ActivityEvent {
    std::string activity_type;  // walking, running, falling
    float confidence;
    int duration_ms;
    std::string skeleton_id;
    std::chrono::system_clock::time_point timestamp;
};

/**
 * SpacetimeDB Client for high-performance event ingestion
 */
class SpacetimeClient {
public:
    SpacetimeClient(const std::string& host, int port);
    ~SpacetimeClient();

    bool connect();
    void disconnect();
    bool is_connected() const { return connected_; }

    // Single event insertion
    bool insert_face_event(const std::string& camera_id,
                          const FaceEvent& event);
    bool insert_voice_event(const std::string& camera_id,
                           const VoiceEvent& event);
    bool insert_plate_event(const std::string& camera_id,
                           const PlateEvent& event);
    bool insert_anomaly_event(const std::string& camera_id,
                             const AnomalyEvent& event);
    bool insert_pose_event(const std::string& camera_id,
                          const PoseEvent& event);
    bool insert_activity_event(const std::string& camera_id,
                              const ActivityEvent& event);

    // Batch insertion (more efficient)
    bool insert_face_events_batch(const std::string& camera_id,
                                  const std::vector<FaceEvent>& events);
    bool insert_events_batch(
        const std::vector<std::pair<std::string, FaceEvent>>& events);

    // Query operations
    std::vector<FaceEvent> query_face_events(
        const std::string& camera_id,
        std::chrono::system_clock::time_point start,
        std::chrono::system_clock::time_point end);

    std::vector<PlateEvent> query_plate_by_text(const std::string& plate_text);

    // Connection pooling
    size_t get_pool_size() const { return pool_size_; }
    void set_pool_size(size_t size) { pool_size_ = size; }

private:
    bool execute_query(const std::string& sql);
    bool execute_insert(const std::string& sql);

    std::string host_;
    int port_;
    bool connected_;
    size_t pool_size_;

    // Connection pool (opaque pointers)
    std::vector<void*> connection_pool_;
    std::mutex pool_mutex_;

    // Event queue for batch operations
    std::queue<std::string> event_queue_;
    std::mutex queue_mutex_;
};

}  // namespace cctv::spacetime
