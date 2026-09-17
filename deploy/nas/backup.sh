#!/bin/bash
# MyDiary 备份脚本
# 用法: ./backup.sh [output_dir]
# 默认输出到 /volume1/docker/mydiary/backups/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="${SCRIPT_DIR}"
OUTPUT_DIR="${1:-${COMPOSE_DIR}/backups}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# Tag backup for retention: monthly if 1st day, weekly if Sunday, otherwise daily
DAY_OF_WEEK=$(date +%u)   # 1=Mon..7=Sun
DAY_OF_MONTH=$(date +%d)
if [ "${DAY_OF_MONTH}" = "01" ]; then
  BACKUP_DIR="${OUTPUT_DIR}/backup-${TIMESTAMP}.monthly"
elif [ "${DAY_OF_WEEK}" = "7" ]; then
  BACKUP_DIR="${OUTPUT_DIR}/backup-${TIMESTAMP}.weekly"
else
  BACKUP_DIR="${OUTPUT_DIR}/backup-${TIMESTAMP}"
fi

RETENTION_DAILY=7
RETENTION_WEEKLY=4
RETENTION_MONTHLY=12

echo "============================================"
echo "  MyDiary Backup - ${TIMESTAMP}"
echo "============================================"

mkdir -p "${BACKUP_DIR}"

# 1. Database backup (PostgreSQL custom format)
echo ">>> Backing up database..."
docker exec mydiary_db pg_dump -U mydiary -Fc mydiary > "${BACKUP_DIR}/database.dump"
DB_SIZE=$(ls -lh "${BACKUP_DIR}/database.dump" | awk '{print $5}')
echo "    Database dump size: ${DB_SIZE}"

# Get entry count from database for manifest
ENTRY_COUNT=$(docker exec mydiary_db psql -U mydiary -d mydiary -t -A -c "SELECT COUNT(*) FROM tb_diaries" 2>/dev/null || echo "")
ATTACHMENT_COUNT=$(docker exec mydiary_db psql -U mydiary -d mydiary -t -A -c "SELECT COUNT(*) FROM tb_attachments WHERE deleted_at IS NULL" 2>/dev/null || echo "")

# Fail if we couldn't get counts (DB unreachable)
if [ -z "${ENTRY_COUNT}" ] || [ -z "${ATTACHMENT_COUNT}" ]; then
  echo "❌ Failed to query database for entry/attachment counts."
  exit 1
fi

echo "    Diary entries: ${ENTRY_COUNT}"
echo "    Attachments: ${ATTACHMENT_COUNT}"

# 2. Attachments + legacy uploads backup (compressed archive)
echo ">>> Backing up attachments and uploads..."
ARCHIVE_DIRS=""
if [ -d "${COMPOSE_DIR}/storage/attachments" ]; then
  ARCHIVE_DIRS="${ARCHIVE_DIRS} storage/attachments"
fi
if [ -d "${COMPOSE_DIR}/uploads" ] && [ "$(ls -A ${COMPOSE_DIR}/uploads 2>/dev/null)" ]; then
  ARCHIVE_DIRS="${ARCHIVE_DIRS} uploads"
fi

if [ -n "${ARCHIVE_DIRS}" ]; then
  # shellcheck disable=SC2086
  tar -cf - -C "${COMPOSE_DIR}" ${ARCHIVE_DIRS} | zstd -o "${BACKUP_DIR}/attachments.tar.zst"
  ATTACH_SIZE=$(ls -lh "${BACKUP_DIR}/attachments.tar.zst" | awk '{print $5}')
  echo "    Archive size: ${ATTACH_SIZE}"
else
  echo "    No attachments or uploads found, skipping."
  touch "${BACKUP_DIR}/attachments.tar.zst"
fi

# 3. Application configuration manifest
echo ">>> Generating manifest..."
cat > "${BACKUP_DIR}/manifest.json" << EOF
{
  "backupVersion": 1,
  "createdAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "components": {
    "database": "database.dump",
    "attachments": "attachments.tar.zst"
  },
  "appVersion": "1.0.0",
  "entryCount": ${ENTRY_COUNT},
  "attachmentCount": ${ATTACHMENT_COUNT}
}
EOF

# Generate checksums (all files under backup dir)
echo ">>> Computing checksums..."
cd "${BACKUP_DIR}"
sha256sum database.dump attachments.tar.zst manifest.json > SHA256SUMS
cd - > /dev/null

echo ""
echo "✅ Backup completed: ${BACKUP_DIR}"
echo "   Size: $(du -sh "${BACKUP_DIR}" | cut -f1)"

# ============================================
# Retention policy cleanup
# ============================================
echo ""
echo ">>> Applying retention policy..."

cleanup_old_backups() {
  local pattern=$1
  local keep=$2
  local dirs
  dirs=$(ls -d ${OUTPUT_DIR}/backup-* 2>/dev/null | grep -E "${pattern}" | sort -r || true)
  if [ -z "$dirs" ]; then return; fi

  local count
  count=$(echo "$dirs" | wc -l)
  if [ "$count" -gt "$keep" ]; then
    echo "$dirs" | tail -n +$((keep + 1)) | while read dir; do
      echo "   Removing old backup: $(basename "${dir}")"
      rm -rf "${dir}"
    done
  fi
}

# Daily backups (no suffix): keep last 7
cleanup_old_backups 'backup-[0-9]{8}-[0-9]{6}$' ${RETENTION_DAILY}

# Weekly backups (Sunday runs): keep last 4
cleanup_old_backups 'backup-.*\.weekly$' ${RETENTION_WEEKLY}

# Monthly backups (1st of month runs): keep last 12
cleanup_old_backups 'backup-.*\.monthly$' ${RETENTION_MONTHLY}

echo "   Retention applied (daily: ${RETENTION_DAILY}, weekly: ${RETENTION_WEEKLY}, monthly: ${RETENTION_MONTHLY})"
echo ""
echo "============================================"
echo "  Backup Complete"
echo "============================================"
