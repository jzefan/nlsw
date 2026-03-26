#!/usr/bin/env bash
# dump-remote-db.sh
# 登录远程服务器，执行 mongodump，打包后传回本地指定目录
# 依赖：sshpass（brew install sshpass 或 apt install sshpass）

set -euo pipefail

# ─────────────────────────── 帮助信息 ────────────────────────────
usage() {
  cat <<EOF
用法: $(basename "$0") [选项]

选项:
  -h, --host      <ip>   远程服务器 IP 地址  (必填)
  -u, --user      <user> SSH 用户名          (必填)
  -p, --password  <pass> SSH 密码            (必填)
  -d, --database  <name> 远程 MongoDB 数据库名 (必填)
  -o, --output    <dir>  本地目标目录        (默认: ./backups)
  --help                 显示此帮助信息

示例:
  $(basename "$0") -h 192.168.1.100 -u ubuntu -p secret -d test -o ~/backups
EOF
  exit 0
}

# ─────────────────────────── 默认值 ──────────────────────────────
REMOTE_HOST=""
REMOTE_USER=""
REMOTE_PASS=""
REMOTE_DB_NAME=""
LOCAL_OUTPUT_DIR="./backups"

# ─────────────────────────── 参数解析 ────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--host)      REMOTE_HOST="$2";       shift 2 ;;
    -u|--user)      REMOTE_USER="$2";       shift 2 ;;
    -p|--password)  REMOTE_PASS="$2";       shift 2 ;;
    -d|--database)  REMOTE_DB_NAME="$2";    shift 2 ;;
    -o|--output)    LOCAL_OUTPUT_DIR="$2";  shift 2 ;;
    --help)         usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

# ─────────────────────────── 必填校验 ────────────────────────────
if [[ -z "$REMOTE_HOST" || -z "$REMOTE_USER" || -z "$REMOTE_PASS" || -z "$REMOTE_DB_NAME" ]]; then
  echo "错误: -h / -u / -p / -d 均为必填项"
  usage
fi

# ─────────────────────────── 检查依赖 ────────────────────────────
if ! command -v sshpass &>/dev/null; then
  echo "错误: 未找到 sshpass，请先安装："
  echo "  macOS : brew install hudochenkov/sshpass/sshpass"
  echo "  Ubuntu: sudo apt install sshpass"
  exit 1
fi

# ─────────────────────────── 变量准备 ────────────────────────────
DATE_TAG=$(date +%Y%m%d)
REMOTE_DUMP_DIR="/tmp/${REMOTE_DB_NAME}-db_${DATE_TAG}"
REMOTE_ARCHIVE="/tmp/${REMOTE_DB_NAME}-db_${DATE_TAG}.tar.gz"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=15"

mkdir -p "$LOCAL_OUTPUT_DIR"

echo "=================================================="
echo " 远程主机 : $REMOTE_HOST"
echo " 用户名   : $REMOTE_USER"
echo " 数据库   : $REMOTE_DB_NAME"
echo " 本地目录 : $LOCAL_OUTPUT_DIR"
echo "=================================================="

# ─────────────────────────── Step 1: 远程 dump ───────────────────
echo ""
echo "[1/3] 在远程服务器执行 mongodump ..."
sshpass -p "$REMOTE_PASS" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" bash <<REMOTE_SCRIPT
set -e
echo "  -> 开始 mongodump ..."
mongodump --host localhost --port 27027 --db "${REMOTE_DB_NAME}" --out "${REMOTE_DUMP_DIR}"
echo "  -> mongodump 完成，输出目录: ${REMOTE_DUMP_DIR}"
REMOTE_SCRIPT

# ─────────────────────────── Step 2: 远程打包 ────────────────────
echo ""
echo "[2/3] 压缩打包 ..."
sshpass -p "$REMOTE_PASS" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" bash <<REMOTE_SCRIPT
set -e
cd /tmp
tar -czf "${REMOTE_ARCHIVE}" "$(basename "${REMOTE_DUMP_DIR}")"
echo "  -> 打包完成: ${REMOTE_ARCHIVE}"
# 清理临时 dump 目录
rm -rf "${REMOTE_DUMP_DIR}"
REMOTE_SCRIPT

# ─────────────────────────── Step 3: 拉取到本地 ──────────────────
echo ""
echo "[3/3] 传输文件到本地 ${LOCAL_OUTPUT_DIR} ..."
sshpass -p "$REMOTE_PASS" scp $SSH_OPTS \
  "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_ARCHIVE}" \
  "${LOCAL_OUTPUT_DIR}/"

LOCAL_FILE="${LOCAL_OUTPUT_DIR}/${REMOTE_DB_NAME}-db_${DATE_TAG}.tar.gz"
FILE_SIZE=$(du -sh "$LOCAL_FILE" | cut -f1)

echo ""
echo "=================================================="
echo " 完成！"
echo " 文件路径 : $LOCAL_FILE"
echo " 文件大小 : $FILE_SIZE"
echo "=================================================="

# ─────────────────────────── 可选：清理远程压缩包 ────────────────
echo ""
read -r -p "是否删除远程服务器上的压缩包 ${REMOTE_ARCHIVE}？[y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  sshpass -p "$REMOTE_PASS" ssh $SSH_OPTS "${REMOTE_USER}@${REMOTE_HOST}" \
    "rm -f '${REMOTE_ARCHIVE}'"
  echo "远程压缩包已删除。"
fi
