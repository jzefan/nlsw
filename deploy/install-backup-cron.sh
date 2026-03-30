#!/usr/bin/env bash
# 安装每日 02:00 备份任务

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKUP_SCRIPT="${SCRIPT_DIR}/daily-backup.sh"
BACKUP_ROOT="${1:-${BACKUP_ROOT:-}}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
CRON_LOG="${CRON_LOG:-${PROJECT_ROOT}/logs/daily-backup.log}"

if [[ -z "${BACKUP_ROOT}" ]]; then
  echo "错误: 请指定备份根目录"
  echo "用法: $(basename "$0") /data/backups"
  exit 1
fi

mkdir -p "$(dirname "${CRON_LOG}")"

CRON_CMD="0 2 * * * BACKUP_ROOT=${BACKUP_ROOT} RETENTION_DAYS=${RETENTION_DAYS} ${BACKUP_SCRIPT} >> ${CRON_LOG} 2>&1"
TMP_CRON="$(mktemp)"

crontab -l 2>/dev/null | grep -Fv "${BACKUP_SCRIPT}" > "${TMP_CRON}" || true
echo "${CRON_CMD}" >> "${TMP_CRON}"
crontab "${TMP_CRON}"
rm -f "${TMP_CRON}"

echo "已安装每日备份任务:"
echo "${CRON_CMD}"
