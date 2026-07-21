#!/bin/bash

# Health check script for replication targets
# Checks connectivity and synchronization status

LOG_FILE="/var/log/spacetimedb/health.log"
STATUS_FILE="/var/run/spacetimedb/health_status.json"

echo "[$(date)]" >> "$LOG_FILE"

# Initialize status JSON
echo '{' > "$STATUS_FILE"
echo '  "timestamp": "'$(date -Iseconds)'"," >> "$STATUS_FILE"
echo '  "checks": {' >> "$STATUS_FILE"

CHECK_COUNT=0

# Check SpacetimeDB Primary
echo "  Checking SpacetimeDB Primary..." >> "$LOG_FILE"
if curl -s -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "    ✓ Primary is healthy" >> "$LOG_FILE"
    echo '    "primary": { "status": "healthy", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
    HEALTH_PRIMARY=1
else
    echo "    ✗ Primary is unhealthy" >> "$LOG_FILE"
    echo '    "primary": { "status": "unhealthy", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
    HEALTH_PRIMARY=0
fi

# Check AWS S3 Backup
echo "  Checking AWS S3 backup..." >> "$LOG_FILE"
if aws s3 ls s3://cctv-backups-primary --region us-east-1 > /dev/null 2>&1; then
    echo "    ✓ AWS S3 is accessible" >> "$LOG_FILE"
    echo ',\n    "aws_s3": { "status": "accessible", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
    HEALTH_AWS=1
else
    echo "    ✗ AWS S3 is not accessible" >> "$LOG_FILE"
    echo ',\n    "aws_s3": { "status": "not_accessible", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
    HEALTH_AWS=0
fi

# Check NFS Backup
echo "  Checking NFS backup..." >> "$LOG_FILE"
if mountpoint -q /mnt/backup; then
    if [ -d /mnt/backup/spacetimedb ]; then
        echo "    ✓ NFS is mounted and accessible" >> "$LOG_FILE"
        echo ',\n    "nfs": { "status": "accessible", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
        HEALTH_NFS=1
    else
        echo "    ✗ NFS is mounted but spacetimedb directory not found" >> "$LOG_FILE"
        echo ',\n    "nfs": { "status": "not_accessible", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
        HEALTH_NFS=0
    fi
else
    echo "    ✗ NFS is not mounted" >> "$LOG_FILE"
    echo ',\n    "nfs": { "status": "not_mounted", "timestamp": "'$(date -Iseconds)'"}' >> "$STATUS_FILE"
    HEALTH_NFS=0
fi

# Overall status
echo '  }' >> "$STATUS_FILE"
echo '}' >> "$STATUS_FILE"

# Determine overall health
if [ $HEALTH_PRIMARY -eq 1 ] && [ $((HEALTH_AWS + HEALTH_NFS)) -gt 0 ]; then
    echo "Overall status: HEALTHY" >> "$LOG_FILE"
    exit 0
else
    echo "Overall status: DEGRADED" >> "$LOG_FILE"
    exit 1
fi
