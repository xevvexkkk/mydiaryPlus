#!/bin/bash
# MyDiary 恢复脚本
# 用法: ./restore.sh <backup_directory>
# 示例: ./restore.sh /volume1/docker/mydiary/backups/backup-20260916-030000

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup_directory>"
  exit 1
fi

BACKUP_DIR="$1"
COMPOSE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "${BACKUP_DIR}/manifest.json" ]; then
  echo "❌ Invalid backup directory: manifest.json not found"
  exit 1
fi

echo "============================================"
echo "  MyDiary Restore"
echo "  Source: ${BACKUP_DIR}"
echo "============================================"

# Verify checksums
echo ">>> Verifying backup integrity..."
cd "${BACKUP_DIR}"
sha256sum -c SHA256SUMS || {
  echo "❌ Checksum verification failed! Backup may be corrupted."
  exit 1
}
cd - > /dev/null
echo "    ✅ Checksums verified."

# Read expected counts from manifest
EXPECTED_ENTRIES=$(jq -r '.entryCount // 0' "${BACKUP_DIR}/manifest.json")
EXPECTED_ATTACHMENTS=$(jq -r '.attachmentCount // 0' "${BACKUP_DIR}/manifest.json")
echo "    Expected diary entries: ${EXPECTED_ENTRIES}"
echo "    Expected attachments: ${EXPECTED_ATTACHMENTS}"

# Confirm
echo ""
echo "⚠️  This will OVERWRITE the current database and attachments."
echo "   Press Ctrl+C to cancel, or Enter to continue."
read -r

# Stop application
echo ">>> Stopping application..."
docker compose -f "${COMPOSE_DIR}/compose.yaml" stop app

# Restore database
echo ">>> Restoring database..."
docker compose -f "${COMPOSE_DIR}/compose.yaml" exec -T db pg_restore --clean --if-exists -U mydiary -d mydiary < "${BACKUP_DIR}/database.dump"
echo "    ✅ Database restored."

# Restore attachments + legacy uploads
echo ">>> Restoring attachments and uploads..."
ATTACHMENTS_DIR="${COMPOSE_DIR}/storage/attachments"
if [ -d "${ATTACHMENTS_DIR}" ]; then
  mv "${ATTACHMENTS_DIR}" "${ATTACHMENTS_DIR}.pre-restore-$(date +%s)"
fi
mkdir -p "${ATTACHMENTS_DIR}"
if [ -s "${BACKUP_DIR}/attachments.tar.zst" ]; then
  zstd -d -c "${BACKUP_DIR}/attachments.tar.zst" | tar -xf - -C "${COMPOSE_DIR}"
fi
echo "    ✅ Attachments and uploads restored."

# Start application
echo ">>> Starting application..."
docker compose -f "${COMPOSE_DIR}/compose.yaml" up -d app

# Wait for health check
echo ">>> Waiting for application to become healthy..."
APP_HEALTHY=false
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health/ready > /dev/null 2>&1; then
    echo "    ✅ Application is healthy."
    APP_HEALTHY=true
    break
  fi
  sleep 2
done

if [ "$APP_HEALTHY" = false ]; then
  echo "    ⚠️  Application did not become healthy within timeout."
  echo "       Check logs: docker compose logs app"
  exit 1
fi

# Verification
echo ""
echo ">>> Running verification..."

# Get actual counts from the restored database
RESTORED_ENTRIES=$(docker compose -f "${COMPOSE_DIR}/compose.yaml" exec -T db psql -U mydiary -d mydiary -t -A -c "SELECT COUNT(*) FROM tb_diaries" 2>/dev/null || echo "unknown")
RESTORED_ATTACHMENTS=$(docker compose -f "${COMPOSE_DIR}/compose.yaml" exec -T db psql -U mydiary -d mydiary -t -A -c "SELECT COUNT(*) FROM tb_attachments WHERE deleted_at IS NULL" 2>/dev/null || echo "unknown")

# Fetch every active storage key and expected digest. Verification is done per
# record because soft-deleted attachment files are intentionally retained.
ATTACHMENT_ROWS_QUERY_FAILED=false
if ! ACTIVE_ATTACHMENT_ROWS=$(docker compose -f "${COMPOSE_DIR}/compose.yaml" exec -T db \
  psql -U mydiary -d mydiary -t -A -F $'\t' \
  -c "SELECT storage_key, sha256 FROM tb_attachments WHERE deleted_at IS NULL ORDER BY storage_key" 2>/dev/null); then
  ATTACHMENT_ROWS_QUERY_FAILED=true
  ACTIVE_ATTACHMENT_ROWS=""
fi

# Physical file verification: count actual files in storage
PHYSICAL_FILES=0
if [ -d "${COMPOSE_DIR}/storage/attachments" ]; then
  PHYSICAL_FILES=$(find "${COMPOSE_DIR}/storage/attachments" -type f | wc -l)
fi

VERIFICATION_FAILED=false

if [ "${RESTORED_ENTRIES}" = "unknown" ]; then
  echo "    ❌ Could not query restored diary entries!"
  VERIFICATION_FAILED=true
elif [ "${RESTORED_ENTRIES}" != "${EXPECTED_ENTRIES}" ]; then
  echo "    ❌ Diary entry count mismatch! Expected: ${EXPECTED_ENTRIES}, Got: ${RESTORED_ENTRIES}"
  VERIFICATION_FAILED=true
else
  echo "    ✅ Diary entries: ${RESTORED_ENTRIES} (matches expected)"
fi

if [ "${RESTORED_ATTACHMENTS}" = "unknown" ]; then
  echo "    ❌ Could not query restored attachments!"
  VERIFICATION_FAILED=true
elif [ "${RESTORED_ATTACHMENTS}" != "${EXPECTED_ATTACHMENTS}" ]; then
  echo "    ❌ Attachment count mismatch! Expected: ${EXPECTED_ATTACHMENTS}, Got: ${RESTORED_ATTACHMENTS}"
  VERIFICATION_FAILED=true
else
  echo "    ✅ Database attachment records: ${RESTORED_ATTACHMENTS} (matches expected)"
fi

echo "    Physical attachment files on disk: ${PHYSICAL_FILES}"

# Verify every active database attachment has the expected regular file and
# checksum. Extra physical files are allowed because soft deletion retains
# media until the backup retention window has elapsed.
if [ "${ATTACHMENT_ROWS_QUERY_FAILED}" = true ]; then
  echo "    ❌ Could not query attachment storage keys for verification!"
  VERIFICATION_FAILED=true
else
  VERIFIED_ATTACHMENT_FILES=0
  if [ -n "${ACTIVE_ATTACHMENT_ROWS}" ]; then
    while IFS=$'\t' read -r storage_key expected_sha256; do
      if [[ -z "${storage_key}" || "${storage_key}" = /* || "${storage_key}" = *".."* ]]; then
        echo "    ❌ Invalid attachment storage key in database: ${storage_key:-<empty>}"
        VERIFICATION_FAILED=true
        continue
      fi

      attachment_file="${COMPOSE_DIR}/storage/attachments/${storage_key}"
      if [ ! -f "${attachment_file}" ] || [ -L "${attachment_file}" ]; then
        echo "    ❌ Missing or unsafe attachment file: ${storage_key}"
        VERIFICATION_FAILED=true
        continue
      fi

      if ! actual_sha256=$(sha256sum "${attachment_file}" 2>/dev/null | awk '{print $1}'); then
        echo "    ❌ Could not checksum attachment file: ${storage_key}"
        VERIFICATION_FAILED=true
        continue
      fi
      if [ "${actual_sha256}" != "${expected_sha256}" ]; then
        echo "    ❌ Attachment checksum mismatch: ${storage_key}"
        VERIFICATION_FAILED=true
        continue
      fi

      VERIFIED_ATTACHMENT_FILES=$((VERIFIED_ATTACHMENT_FILES + 1))
    done <<< "${ACTIVE_ATTACHMENT_ROWS}"
  fi
  echo "    ✅ Verified active attachment files: ${VERIFIED_ATTACHMENT_FILES}"
fi

if [ "$VERIFICATION_FAILED" = true ]; then
  echo ""
  echo "⚠️  Restoration completed but verification found discrepancies."
  echo "   Previous attachments saved at: ${ATTACHMENTS_DIR}.pre-restore-*"
  exit 1
fi

echo ""
echo "============================================"
echo "  Restore Complete - All checks passed"
echo "============================================"
echo ""
echo "Next steps:"
echo "  1. Log in and verify your diary entries are intact"
echo "  2. Check that attachment images load correctly"
