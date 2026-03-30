#!/usr/bin/env bash
# 独立部署每日备份脚本
# 默认备份：
#   1. MongoDB（mongodump archive gzip）
#   2. uploads 目录（如存在）
#   3. keys 目录（如存在）
#   4. .env 文件（如存在）
#
# 用法：
#   BACKUP_ROOT=/data/backups /home/ubuntu/nlsw2/deploy/daily-backup.sh
#   /home/ubuntu/nlsw2/deploy/daily-backup.sh /data/backups

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -f "${PROJECT_ROOT}/.env" ]]; then
  # shellcheck disable=SC1091
  set -a
  source "${PROJECT_ROOT}/.env"
  set +a
fi

BACKUP_ROOT="${1:-${BACKUP_ROOT:-}}"
if [[ -z "${BACKUP_ROOT}" ]]; then
  echo "错误: 请通过参数或 BACKUP_ROOT 指定备份根目录"
  echo "示例: BACKUP_ROOT=/data/backups ${SCRIPT_DIR}/daily-backup.sh"
  exit 1
fi

RETENTION_DAYS="${RETENTION_DAYS:-14}"
TIMESTAMP="$(date '+%Y%m%d_%H%M%S')"
DATE_TAG="$(date '+%Y%m%d')"
HOST_TAG="${BACKUP_HOST_TAG:-$(hostname -s 2>/dev/null || hostname)}"
RUN_DIR="${BACKUP_ROOT}/${HOST_TAG}/${DATE_TAG}/${TIMESTAMP}"
LOCK_FILE="${BACKUP_ROOT}/.daily-backup.lock"
TMP_DIR="${RUN_DIR}/tmp"
MONGO_HOST="${MONGO_HOST:-localhost}"
MONGO_PORT="${MONGO_PORT:-27027}"
MONGO_DATABASE="${MONGO_DATABASE:-nldb}"
MONGO_USER="${MONGO_USER:-}"
MONGO_PASSWORD="${MONGO_PASSWORD:-}"
MONGO_AUTH_SOURCE="${MONGO_AUTH_SOURCE:-admin}"
EXTRA_PATHS="${BACKUP_EXTRA_PATHS:-}"

mkdir -p "${RUN_DIR}" "${TMP_DIR}"

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "错误: 检测到已有备份任务在运行，退出"
  exit 1
fi

log() {
  printf '[%s] %s\n' "$(date '+%F %T')" "$*"
}

cleanup() {
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "错误: 缺少命令 $1"
    exit 1
  fi
}

require_command mongodump
require_command tar
require_command flock

log "开始备份"
log "项目目录: ${PROJECT_ROOT}"
log "备份目录: ${RUN_DIR}"
log "数据库: ${MONGO_HOST}:${MONGO_PORT}/${MONGO_DATABASE}"

MONGO_ARCHIVE="${RUN_DIR}/mongo_${MONGO_DATABASE}_${TIMESTAMP}.archive.gz"
MONGODUMP_ARGS=(
  --host="${MONGO_HOST}"
  --port="${MONGO_PORT}"
  --db="${MONGO_DATABASE}"
  --archive="${MONGO_ARCHIVE}"
  --gzip
)

if [[ -n "${MONGO_USER}" && -n "${MONGO_PASSWORD}" ]]; then
  MONGODUMP_ARGS+=(
    --username="${MONGO_USER}"
    --password="${MONGO_PASSWORD}"
    --authenticationDatabase="${MONGO_AUTH_SOURCE}"
  )
fi

log "执行 MongoDB 备份"
mongodump "${MONGODUMP_ARGS[@]}"

collect_path() {
  local source_path="$1"
  local alias_name="$2"
  if [[ -e "${source_path}" ]]; then
    mkdir -p "${TMP_DIR}/${alias_name}"
    cp -a "${source_path}" "${TMP_DIR}/${alias_name}/"
    log "已收集: ${source_path}"
  else
    log "跳过不存在路径: ${source_path}"
  fi
}

collect_path "${PROJECT_ROOT}/uploads" "app-data"
collect_path "${PROJECT_ROOT}/keys" "app-data"
collect_path "${PROJECT_ROOT}/.env" "app-config"

if [[ -n "${EXTRA_PATHS}" ]]; then
  OLD_IFS="$IFS"
  IFS=':'
  for extra_path in ${EXTRA_PATHS}; do
    [[ -z "${extra_path}" ]] && continue
    collect_path "${extra_path}" "extra-data"
  done
  IFS="$OLD_IFS"
fi

if [[ -n "$(find "${TMP_DIR}" -mindepth 1 -print -quit 2>/dev/null)" ]]; then
  FILES_ARCHIVE="${RUN_DIR}/app_files_${TIMESTAMP}.tar.gz"
  log "打包应用文件"
  tar -C "${TMP_DIR}" -czf "${FILES_ARCHIVE}" .
else
  log "未发现需要打包的应用文件"
fi

{
  echo "backup_time=$(date '+%F %T %z')"
  echo "project_root=${PROJECT_ROOT}"
  echo "backup_root=${BACKUP_ROOT}"
  echo "run_dir=${RUN_DIR}"
  echo "mongo_host=${MONGO_HOST}"
  echo "mongo_port=${MONGO_PORT}"
  echo "mongo_database=${MONGO_DATABASE}"
  echo "retention_days=${RETENTION_DAYS}"
  echo "extra_paths=${EXTRA_PATHS}"
} > "${RUN_DIR}/backup.meta"

if [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] && [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  log "清理 ${RETENTION_DAYS} 天前的历史备份"
  find "${BACKUP_ROOT}/${HOST_TAG}" -mindepth 1 -maxdepth 1 -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} +
fi

log "备份完成"
log "输出目录: ${RUN_DIR}"
