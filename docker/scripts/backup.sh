#!/bin/bash

# Backup script for SpacetimeDB
# Usage: ./backup.sh [full|incremental]

set -e

BACKUP_TYPE=${1:-full}
BACKUP_DIR="/opt/spacetimedb/backups"
DATA_DIR="/var/lib/spacetimedb"
LOG_FILE="/var/log/spacetimedb/backup.log"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/backup_${BACKUP_TYPE}_${TIMESTAMP}"

echo "[$(date)]" >> "$LOG_FILE"
echo "Starting $BACKUP_TYPE backup: $BACKUP_FILE" >> "$LOG_FILE"

case $BACKUP_TYPE in
    full)
        # Full backup
        tar --exclude='*.lock' -czf "${BACKUP_FILE}.tar.gz" -C /opt/spacetimedb data/ 2>> "$LOG_FILE"
        ;;
    incremental)
        # Incremental backup (would need proper implementation with rsync/similar)
        rsync -av --delete "$DATA_DIR/" "${BACKUP_FILE}/" 2>> "$LOG_FILE"
        tar -czf "${BACKUP_FILE}.tar.gz" -C "${BACKUP_FILE}" . 2>> "$LOG_FILE"
        rm -rf "${BACKUP_FILE}"
        ;;
    *)
        echo "Invalid backup type: $BACKUP_TYPE" >> "$LOG_FILE"
        exit 1
        ;;
esac

# Verify backup
if [ -f "${BACKUP_FILE}.tar.gz" ]; then
    SIZE=$(du -h "${BACKUP_FILE}.tar.gz" | cut -f1)
    CHECKSUM=$(sha256sum "${BACKUP_FILE}.tar.gz" | awk '{print $1}')
    echo "Backup completed successfully. Size: $SIZE, Checksum: $CHECKSUM" >> "$LOG_FILE"
    echo "$TIMESTAMP|$BACKUP_TYPE|$SIZE|$CHECKSUM" >> "${BACKUP_DIR}/.backup_manifest"
else
    echo "ERROR: Backup failed" >> "$LOG_FILE"
    exit 1
fi

# Cleanup old backups (keep 30 days)
find "$BACKUP_DIR" -name "backup_full_*.tar.gz" -mtime +30 -delete

echo "" >> "$LOG_FILE"
