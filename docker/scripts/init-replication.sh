#!/bin/bash

# Initialize SpacetimeDB Replication Setup
# This script sets up local and remote backup infrastructure

set -e

echo "=== SpacetimeDB Replication Setup ==="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running with root privileges
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Please run as root${NC}"
    exit 1
fi

# Configuration
BACKUP_DIR="/opt/spacetimedb/backups"
CONFIG_DIR="/etc/spacetimedb"
DATA_DIR="/var/lib/spacetimedb"
LOG_DIR="/var/log/spacetimedb"
SSL_DIR="/etc/ssl/certs/spacetimedb"

echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p "$BACKUP_DIR" "$CONFIG_DIR" "$DATA_DIR" "$LOG_DIR" "$SSL_DIR"
chmod 700 "$BACKUP_DIR" "$DATA_DIR" "$SSL_DIR"
chmod 755 "$CONFIG_DIR" "$LOG_DIR"

echo -e "${YELLOW}Setting up SSL certificates...${NC}"

# Create self-signed certificates if they don't exist
if [ ! -f "$SSL_DIR/server.crt" ]; then
    echo "Generating server certificate..."
    openssl req -x509 -newkey rsa:4096 -keyout "$SSL_DIR/server.key" \
        -out "$SSL_DIR/server.crt" -days 365 -nodes \
        -subj "/CN=spacetimedb.local/O=CCTV/C=US"
    chmod 400 "$SSL_DIR/server.key"
    chmod 444 "$SSL_DIR/server.crt"
    echo -e "${GREEN}SSL certificates created${NC}"
else
    echo -e "${YELLOW}SSL certificates already exist${NC}"
fi

# Create client certificate
if [ ! -f "$SSL_DIR/client.crt" ]; then
    echo "Generating client certificate..."
    openssl req -x509 -newkey rsa:4096 -keyout "$SSL_DIR/client.key" \
        -out "$SSL_DIR/client.crt" -days 365 -nodes \
        -subj "/CN=cctv-dvr-client/O=CCTV/C=US"
    chmod 400 "$SSL_DIR/client.key"
    chmod 444 "$SSL_DIR/client.crt"
    echo -e "${GREEN}Client certificates created${NC}"
fi

echo -e "${YELLOW}Copying configuration files...${NC}"
cp config/replication.yaml "$CONFIG_DIR/replication.yaml"
cp config/backup-targets.yaml "$CONFIG_DIR/backup-targets.yaml"
cp config/ssl-certs.yaml "$CONFIG_DIR/ssl-certs.yaml"
cp config/policies.yaml "$CONFIG_DIR/policies.yaml"

echo -e "${YELLOW}Setting up backup scripts...${NC}"
mkdir -p /usr/local/bin/spacetimedb-scripts
cp docker/scripts/backup.sh /usr/local/bin/spacetimedb-scripts/backup.sh
cp docker/scripts/health_check.sh /usr/local/bin/spacetimedb-scripts/health_check.sh
chmod +x /usr/local/bin/spacetimedb-scripts/*.sh

echo -e "${YELLOW}Setting up cron jobs...${NC}"
# Backup daily at 2 AM
echo "0 2 * * * /usr/local/bin/spacetimedb-scripts/backup.sh" | crontab -

# Health check every 5 minutes
echo "*/5 * * * * /usr/local/bin/spacetimedb-scripts/health_check.sh" | crontab -

echo -e "${YELLOW}Loading environment variables...${NC}"
if [ -f "docker/.env" ]; then
    export $(cat docker/.env | grep -v '^#' | xargs)
    echo -e "${GREEN}Environment variables loaded${NC}"
else
    echo -e "${YELLOW}No .env file found, please create one from .env.example${NC}"
fi

echo -e "${YELLOW}Testing connectivity to backup targets...${NC}"
echo "Testing AWS S3..."
aws s3 ls s3://cctv-backups-primary --region us-east-1 2>/dev/null && \
    echo -e "${GREEN}✓ AWS S3 accessible${NC}" || \
    echo -e "${RED}✗ AWS S3 not accessible${NC}"

echo -e "${GREEN}\n=== Replication setup completed ==="
echo -e "\nNext steps:"
echo "1. Review configuration: cat $CONFIG_DIR/replication.yaml"
echo "2. Start services: docker-compose -f docker/docker-compose.yml up -d"
echo "3. Check status: docker-compose -f docker/docker-compose.yml ps"
echo "4. View logs: docker-compose -f docker/docker-compose.yml logs -f replication-manager"
echo ""
echo "Monitoring Dashboard: http://localhost:3001 (Grafana)"
echo "Log Aggregation: http://localhost:5601 (Kibana)"
