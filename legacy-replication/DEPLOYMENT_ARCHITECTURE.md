# CCTV/DVR System - Deployment Architecture

## System Overview

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    EDGE NODE (Local Site)                           │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │                    Video Ingest Layer                        │  │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │  │
│  │  │ Camera  │  │ Camera  │  │ Camera  │  │ Camera  │        │  │
│  │  │   RTSP  │  │  RTSP   │  │  RTSP   │  │  RTSP   │        │  │
│  │  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │  │
│  │       └──────────────┬──────────────┬──────────┘             │  │
│  └──────────────────────┼──────────────┼─────────────────────────┘  │
│                         │              │                            │
│  ┌──────────────────────▼──────────────▼─────────────────────────┐  │
│  │               Vision Processing Pipeline (C++)               │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ • Face Detection (YOLOv8 + ArcFace)                  │  │  │
│  │  │ • Plate Recognition (YOLOv8 + OCR)                  │  │  │
│  │  │ • Pose Estimation (HRNet - 17 keypoints)            │  │  │
│  │  │ • Activity Classification                            │  │  │
│  │  │ • Anomaly Detection (3D-CNN)                         │  │  │
│  │  │ • Audio Transcription (Whisper.cpp)                  │  │  │
│  │  └────────────────────┬───────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                         │                                             │
│  ┌──────────────────────▼─────────────────────────────────────────┐  │
│  │            SpacetimeDB LOCAL (Rust Client)                    │  │
│  │  ┌────────────────────────────────────────────────────────┐  │  │
│  │  │ Event Normalizer & Batch Queue                        │  │  │
│  │  │ - Accumulate: 100ms batches                          │  │  │
│  │  │ - Validate: Event schema                             │  │  │
│  │  │ - Dead-letter: Failed events                         │  │  │
│  │  └────────────────┬───────────────────────────────────────┘  │  │
│  │                  │                                             │  │
│  │  ┌───────────────▼────────────────────────────────────────┐  │  │
│  │  │ SpacetimeDB Instance (Primary)                        │  │  │
│  │  │ - 14 SQL tables (events, tracks, alerts)             │  │  │
│  │  │ - Local filesystem storage                            │  │  │
│  │  │ - ~1-2 GB/day for 4x 1080p cameras                   │  │  │
│  │  └────────────────┬──────────────────────────────────���────┘  │  │
│  └───────────────────┼────────────────────────────────────────────┘  │
│                      │ (localhost:3000)                               │
└──────────────────────┼───────────────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌─────────┐
   │Backup-1 │   │Backup-2 │   │Backup-3 │
   │Remote   │   │Remote   │   │Remote   │
   │Server   │   │Server   │   │Server   │
   └─────────┘   └─────────┘   └─────────┘
   AWS/Cloud     Azure/Cloud   On-Prem DC
   (S3 + DB)     (Blob + DB)    (NFS + DB)
```

---

## Component Architecture

### 1. Local SpacetimeDB Setup

**File Structure:**
```
/opt/spacetimedb/
├── data/                          # Primary data directory
│   ├── spacetime.db              # Main database file
│   ├── spacetime.db-wal          # Write-ahead log
│   └── backups/                  # Local point-in-time backups
│       ├── backup_2026-07-21_00-00.tar.gz
│       └── backup_2026-07-21_06-00.tar.gz
├── config/
│   ├── spacetime.yaml            # Primary config
│   ├── replication.yaml          # Replication targets
│   └── ssl/
│       ├── ca.crt
│       ├── server.crt
│       └── server.key
├── logs/
│   ├── spacetime.log             # Server logs
│   ├── replication.log           # Sync logs
│   └── health.log                # Health check logs
└── scripts/
    ├── init_replication.sh       # Setup replication
    ├── backup.sh                 # Backup script
    └── health_check.sh           # Health monitoring
```

---

### 2. Replication Strategy

#### **Write Path (Events)**
```
Vision Pipeline (C++)
    │ (Raw detections)
    ▼
Event Normalizer (Rust)
    │ (Validated + Normalized)
    ▼
Batch Queue (100ms accumulation)
    │ (100-1000 events/batch)
    ▼
Local SpacetimeDB (Primary)
    │ (INSERT into tables)
    ▼
Transaction Log (WAL)
    │ (Async replication)
    ├──► Backup-1 (gRPC sync)
    ├──► Backup-2 (gRPC sync)
    └──► Backup-3 (gRPC sync)
         (All async with acknowledgment)
```

#### **Read Path (Queries)**
```
API Server (Rust gRPC)
    │ (User query)
    ▼
Connection Manager
    │ (Route to primary or available backup)
    ▼
Local SpacetimeDB (or failover if down)
    │ (Execute query)
    ▼
Results
```

---

### 3. Replication Configurations

#### **Synchronous Replication (High Safety)**
- Waits for ACK from all remotes before committing locally
- **Pros**: No data loss, strong consistency
- **Cons**: Higher latency (not ideal for real-time events)
- **Best for**: Critical alerts, financial records

#### **Asynchronous Replication (High Performance)**
- Returns immediately after local commit
- Syncs remotes in background
- **Pros**: Low latency, high throughput
- **Cons**: Small window of data loss if primary fails
- **Best for**: Bulk events, large datasets

#### **Hybrid (Recommended)**
- **Critical events** (high-severity anomalies): Synchronous
- **Regular events** (detections, activities): Asynchronous
- **Configuration**: Per-table basis

---

### 4. Backup Topology

#### **Option A: Centralized Hub (Default)**
```
Edge (Local Primary)
    └─► Cloud Region 1 (Backup)
    └─► Cloud Region 2 (Backup)
    └─► On-Premise DC (Backup)
    
Failover: Any backup can become primary
```

#### **Option B: Multi-Tier Replication**
```
Edge (Local Primary)
    └─► Regional Hub (Secondary + Distributor)
        ├─► Cloud Region 1
        ├─► Cloud Region 2
        └─► Failover Node
```

#### **Option C: Ring Topology (Advanced)**
```
Edge (Primary)
    └─► Backup-1 ─┐
        └─► Backup-2 ─┐
            └─► Backup-3 ─┘
            
Circular replication + quorum
```

---

## Implementation Files

### Core Replication Module

**Location**: `rust/replication-manager/`

```
rust/replication-manager/
├── Cargo.toml
├── src/
│   ├── lib.rs
│   ├── config.rs                 # Configuration management
│   ├── replicator.rs             # Main replication logic
│   ├── backup_store.rs           # Local backup handling
│   ├── remote_sync.rs            # Remote synchronization
│   ├── health_monitor.rs         # Heartbeat + status
│   ├── failover.rs               # Failover management
│   ├── queue.rs                  # Event batching queue
│   └── persistence.rs            # State persistence
└── tests/
    ├── replication_tests.rs
    └── failover_tests.rs
```

### Configuration Files

**Location**: `config/`

```
config/
├── replication.yaml              # Replication settings
├── backup-targets.yaml           # Backup destinations
├── ssl-certs.yaml               # TLS configuration
└── policies.yaml                # Retention + sync policies
```

### Docker Deployment

**Location**: `docker/`

```
docker/
├── docker-compose.yml            # Multi-service setup
├── Dockerfile.replication        # Replication service
└── scripts/
    ├── init-replication.sh
    └── health-check.sh
```

---

## Key Features

### ✅ Automatic Failover
- **Detection**: 5-second heartbeat
- **Trigger**: 3 consecutive missed heartbeats = 15 seconds
- **Action**: Promote backup to primary role
- **Client Update**: Reconnect via service discovery

### ✅ Conflict Resolution
- **Timestamp-based**: Last-write-wins (for events)
- **Event ID-based**: Detect duplicates
- **Vector clocks**: Causal consistency tracking

### ✅ Compression & Bandwidth Optimization
- **Delta sync**: Only send changed records
- **Compression**: gzip for batch transfers
- **Smart batching**: Accumulate 100ms before sync

### ✅ Point-in-Time Recovery
- **Retention**: 30 days of incremental backups
- **RPO**: ~5 minutes (backup interval)
- **RTO**: ~2 minutes (restore + restart)

### ✅ Monitoring & Alerting
- Replication lag tracking
- Backup success/failure rates
- Network bandwidth usage
- Database size growth

---

## Configuration Examples

### Minimal Setup (Edge Site + 1 Remote Backup)
```yaml
replication:
  mode: asynchronous
  batch_size: 500
  batch_timeout_ms: 100
  
backups:
  - name: "aws-s3-backup"
    type: "s3"
    endpoint: "s3://my-backup-bucket/"
    connection:
      access_key: "${AWS_ACCESS_KEY}"
      secret_key: "${AWS_SECRET_KEY}"
      region: "us-east-1"
    sync_interval_secs: 300
    
health_check:
  interval_secs: 5
  timeout_secs: 10
```

### Production Setup (3 Geographically Distributed Backups)
```yaml
replication:
  mode: "hybrid"  # Critical events sync, bulk events async
  critical_tables:
    - "anomaly_events"
    - "security_alerts"
  
backups:
  - name: "aws-primary"
    type: "spacetimedb"
    connection: "grpc://aws-backup.example.com:3000"
    tls: true
    cert_path: "/etc/ssl/certs/aws.crt"
    priority: 1
    
  - name: "azure-secondary"
    type: "spacetimedb"
    connection: "grpc://azure-backup.example.com:3000"
    tls: true
    cert_path: "/etc/ssl/certs/azure.crt"
    priority: 2
    
  - name: "local-nfs"
    type: "nfs"
    path: "/mnt/backup/spacetimedb"
    priority: 3

failover:
  auto_promote: true
  health_check_interval: 5
  missed_heartbeats_threshold: 3
  
retention:
  local_backups_days: 30
  remote_backups_days: 90
  compression: gzip
```

---

## Security Considerations

### ✅ Encryption
- **In Transit**: TLS 1.3 for all gRPC connections
- **At Rest**: Optional AES-256 for database files
- **Key Management**: HashiCorp Vault integration

### ✅ Authentication
- **mTLS**: Certificate-based auth between nodes
- **API Keys**: For external backup services
- **Network**: Private VPN/NAT for remote backups

### ✅ Audit Logging
- All replication events logged
- Backup verification checksums
- Failed sync retry attempts tracked

---

## Deployment Steps

### Phase 1: Local SpacetimeDB Setup (Week 1)
- [ ] Deploy SpacetimeDB instance locally
- [ ] Configure database schema (14 tables)
- [ ] Setup local backup automation
- [ ] Implement health checks

### Phase 2: Remote Backup Infrastructure (Week 2)
- [ ] Provision remote backup servers
- [ ] Configure TLS certificates
- [ ] Setup network connectivity (VPN/Direct Connect)
- [ ] Test replication connectivity

### Phase 3: Replication Layer (Week 3)
- [ ] Implement ReplicationManager module (Rust)
- [ ] Add backup queue and batching
- [ ] Integrate with vision pipeline
- [ ] Add failover logic

### Phase 4: Testing & Validation (Week 4)
- [ ] Failover scenario testing
- [ ] Data consistency verification
- [ ] Performance benchmarks
- [ ] Disaster recovery drills

---

## Monitoring Dashboards

### Key Metrics
- **Replication Lag**: ms behind primary
- **Backup Success Rate**: % of successful syncs
- **Network Bandwidth**: MB/s to each backup
- **Database Size**: Growth rate per day
- **Event Throughput**: events/sec processed
- **Query Latency**: p50, p95, p99 response times

### Alerting Thresholds
- Replication lag > 5 minutes: Warning
- Backup failure rate > 5%: Critical
- Local disk usage > 80%: Warning
- Network latency > 500ms: Critical
- Failover triggered: Critical alert

---

## Recovery Procedures

### Scenario 1: Primary Node Failure
1. Backup automatically promoted to primary
2. Vision pipeline reconnects (via DNS)
3. Events resume flowing
4. Failed primary brought back online
5. Resync from backup

### Scenario 2: Network Partition
1. Local instance continues operating independently
2. Queues events for async sync
3. Network restored → catch-up sync begins
4. Conflict resolution applied
5. Full consistency restored

### Scenario 3: Backup Node Failure
1. Detected by health check
2. Marked unavailable
3. Replication to other backups continues
4. Failed node repaired/replaced
5. Full resync from primary

---

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Event Throughput | 10,000 events/sec | Per primary node |
| Replication Lag (async) | <5 sec | 95th percentile |
| Backup Sync Interval | 5 min | Configurable |
| Failover Time | <2 min | Detection + promotion |
| Query Latency (p99) | <100 ms | Local queries |
| Network Bandwidth | <100 Mbps | 4 cameras + 3 backups |
| Database Size Growth | ~1 GB/day | 4x 1080p cameras |

---

## References

- [SpacetimeDB Replication](https://spacetimedb.com/docs/replication)
- [Distributed Database Consistency](https://www.cnblogs.com/xybaby/p/7310063.html)
- [High Availability Patterns](https://martinfowler.com/articles/patterns-of-distributed-systems/)
- [Backup & Recovery Best Practices](https://www.veeam.com/blog/backup-recovery-best-practices.html)
