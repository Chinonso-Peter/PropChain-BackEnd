#!/bin/bash

# PropChain Database Restore Script
# Usage: ./restore.sh <backup_file>

set -e

# Configuration
DATABASE_URL="${DATABASE_URL:-postgresql://postgres:password@localhost:5432/propchain}"

# Parse DATABASE_URL
parse_db_url() {
    local url="$1"
    # Remove protocol
    url="${url#postgresql://}"
    
    # Extract user:password
    local auth="${url%%@*}"
    DB_USER="${auth%%:*}"
    DB_PASSWORD="${auth#*:}"
    
    # Extract host:port/database
    url="${url#*@}"
    local host_port="${url%%/*}"
    DB_HOST="${host_port%%:*}"
    DB_PORT="${host_port#*:}"
    
    # Extract database name (remove query params)
    DB_NAME="${url#*/}"
    DB_NAME="${DB_NAME%%\?*}"
}

# Check arguments
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file>"
    echo ""
    echo "Examples:"
    echo "  $0 ./backups/propchain_backup_20250123_120000.dump"
    echo "  $0 ./backups/propchain_backup_20250123_120000.dump.gz"
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Parse database URL
parse_db_url "$DATABASE_URL"

echo "=== PropChain Database Restore ==="
echo "Backup File: $BACKUP_FILE"
echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# Confirmation prompt
read -p "WARNING: This will overwrite all data in $DB_NAME. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Restore cancelled."
    exit 0
fi

# Set password for psql/pg_restore
export PGPASSWORD="$DB_PASSWORD"

# Decompress if necessary
RESTORE_FILE="$BACKUP_FILE"
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing backup..."
    RESTORE_FILE="${BACKUP_FILE%.gz}"
    gunzip -k -f "$BACKUP_FILE"
fi

# Verify checksum if available
CHECKSUM_FILE="${RESTORE_FILE}.sha256"
if [ -f "$CHECKSUM_FILE" ]; then
    echo "Verifying checksum..."
    if sha256sum -c "$CHECKSUM_FILE"; then
        echo "Checksum verification passed."
    else
        echo "ERROR: Checksum verification failed!"
        exit 1
    fi
fi

# Drop existing connections
echo "Dropping existing connections..."
psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
    2>/dev/null || true

# Drop and recreate database
echo "Recreating database..."
psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "DROP DATABASE IF EXISTS $DB_NAME;"

psql \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d postgres \
    -c "CREATE DATABASE $DB_NAME;"

# Restore backup
echo "Restoring backup..."
pg_restore \
    -h "$DB_HOST" \
    -p "$DB_PORT" \
    -U "$DB_USER" \
    -d "$DB_NAME" \
    -v \
    --no-owner \
    --no-privileges \
    "$RESTORE_FILE"

# Run Prisma migrations to ensure schema is current
echo "Running Prisma migrations..."
npx prisma migrate deploy

echo ""
echo "=== Restore Complete ==="
echo "Database $DB_NAME has been restored from $BACKUP_FILE"
