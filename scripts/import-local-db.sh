#!/usr/bin/env bash
# import-local-db.sh
# 将 MongoDB 3.6 导出的备份文件导入本地 MongoDB 8.2 (nldb_saas)
# 并为导入的业务数据注入 DEFAULT 租户 tenantId
#
# 依赖：mongorestore, mongosh (均需已安装并在 PATH 中)

set -euo pipefail

# ─────────────────────────── 帮助信息 ────────────────────────────
usage() {
  cat <<EOF
用法: $(basename "$0") [选项]

选项:
  -f, --file    <path>   备份的 .tar.gz 文件路径（必填）
  -m, --mode    <mode>   导入模式: fresh（全新）或 replace（覆盖），默认自动检测
  --host        <host>   MongoDB 主机，默认 localhost
  --port        <port>   MongoDB 端口，默认 27027
  --db          <db>     目标数据库名，默认 nldb_saas
  --user        <user>   MongoDB 用户名，默认 nlsw2026
  --password    <pass>   MongoDB 密码，默认 HiNlsw2026.
  --auth-source <db>     认证数据库，默认同 --db
  --help                 显示此帮助信息

示例:
  $(basename "$0") -f ~/backups/test-db_20260302.tar.gz
  $(basename "$0") -f ~/backups/test-db_20260302.tar.gz -m replace
EOF
  exit 0
}

# ─────────────────────────── 业务集合列表 ────────────────────────
BUSINESS_COLLECTIONS=(
  bills
  brands
  companies
  destinations
  drayageforklifts
  invoices
  orderplans
  saledeps
  settles
  vehicles
  vesselcosts
)

# ─────────────────────────── 默认参数 ────────────────────────────
BACKUP_FILE=""
MODE=""           # fresh | replace | "" (自动检测)
MONGO_HOST="localhost"
MONGO_PORT="27027"
MONGO_DB="nldb_saas"
MONGO_USER="nlsw2026"
MONGO_PASS="HiNlsw2026."
MONGO_AUTH_SOURCE=""

# ─────────────────────────── 参数解析 ────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    -f|--file)        BACKUP_FILE="$2";      shift 2 ;;
    -m|--mode)        MODE="$2";             shift 2 ;;
    --host)           MONGO_HOST="$2";       shift 2 ;;
    --port)           MONGO_PORT="$2";       shift 2 ;;
    --db)             MONGO_DB="$2";         shift 2 ;;
    --user)           MONGO_USER="$2";       shift 2 ;;
    --password)       MONGO_PASS="$2";       shift 2 ;;
    --auth-source)    MONGO_AUTH_SOURCE="$2"; shift 2 ;;
    --help)           usage ;;
    *) echo "未知参数: $1"; usage ;;
  esac
done

# auth-source 默认与目标 DB 一致
MONGO_AUTH_SOURCE="${MONGO_AUTH_SOURCE:-$MONGO_DB}"

# ─────────────────────────── 必填校验 ────────────────────────────
if [[ -z "$BACKUP_FILE" ]]; then
  echo "错误: -f/--file 为必填项"
  usage
fi

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "错误: 文件不存在: $BACKUP_FILE"
  exit 1
fi

if [[ "$MODE" != "" && "$MODE" != "fresh" && "$MODE" != "replace" ]]; then
  echo "错误: --mode 只接受 fresh 或 replace"
  exit 1
fi

# ─────────────────────────── 检查依赖 ────────────────────────────
for cmd in mongorestore mongosh tar; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "错误: 未找到命令 '$cmd'，请先安装 MongoDB Tools / mongosh"
    exit 1
  fi
done

# ─────────────────────────── 构建连接字符串 ──────────────────────
MONGO_URI="mongodb://${MONGO_USER}:${MONGO_PASS}@${MONGO_HOST}:${MONGO_PORT}/${MONGO_DB}?authSource=${MONGO_AUTH_SOURCE}"

# 测试连接
echo "正在验证 MongoDB 连接..."
if ! mongosh "$MONGO_URI" --quiet --eval "db.runCommand({ ping: 1 })" &>/dev/null; then
  echo "错误: 无法连接到 MongoDB，请检查连接参数"
  exit 1
fi
echo "  -> 连接成功"

# ─────────────────────────── 提前获取 DEFAULT 租户 ID ───────────
echo ""
echo "查询 DEFAULT 租户 ID ..."
DEFAULT_TENANT_ID=$(mongosh "$MONGO_URI" --quiet --eval \
  'const t = db.getSiblingDB("'"${MONGO_DB}"'").tenants.findOne({ code: "DEFAULT" }); t ? print(t._id.toString()) : print("")' \
  2>/dev/null | tail -1)

if [[ -z "$DEFAULT_TENANT_ID" ]]; then
  echo "错误: 目标数据库中未找到 code=DEFAULT 的租户，请先完成 SaaS 初始化"
  exit 1
fi
echo "  -> DEFAULT 租户 ID: $DEFAULT_TENANT_ID"

# ─────────────────────────── 解压备份文件 ────────────────────────
WORK_DIR=$(mktemp -d)
trap 'echo ""; echo "清理临时目录..."; rm -rf "$WORK_DIR"' EXIT

echo ""
echo "[1/4] 解压备份文件 ..."
tar -xzf "$BACKUP_FILE" -C "$WORK_DIR"

# 找到 dump 根目录（tar 包内第一层子目录，即原始 dump 目录名 test-db_YYYYMMDD）
DUMP_ROOT=$(find "$WORK_DIR" -mindepth 1 -maxdepth 1 -type d | head -1)
# 备份数据源库目录（dump 命令用的是 --db test，所以子目录是 test/）
SOURCE_DB_DIR="${DUMP_ROOT}/test"

if [[ ! -d "$SOURCE_DB_DIR" ]]; then
  echo "错误: 在压缩包中未找到 'test' 数据库目录"
  echo "  解压内容:"
  find "$DUMP_ROOT" -maxdepth 2
  exit 1
fi

echo "  -> 解压完成: $DUMP_ROOT"

# ─────────────────────────── 自动检测模式 ────────────────────────
if [[ -z "$MODE" ]]; then
  echo ""
  echo "[2/4] 自动检测 DEFAULT 租户业务数据..."
  HAS_DATA=false
  for COLL in "${BUSINESS_COLLECTIONS[@]}"; do
    COUNT=$(mongosh "$MONGO_URI" --quiet --eval \
      "db.getSiblingDB('${MONGO_DB}').${COLL}.countDocuments({ tenantId: ObjectId('${DEFAULT_TENANT_ID}') })" \
      2>/dev/null | tail -1 || echo "0")
    if [[ "$COUNT" =~ ^[0-9]+$ && "$COUNT" -gt 0 ]]; then
      echo "  -> 检测到 ${COLL} 有 ${COUNT} 条 DEFAULT 租户记录"
      HAS_DATA=true
      break
    fi
  done

  if $HAS_DATA; then
    echo ""
    echo "检测到 DEFAULT 租户业务数据已存在，自动切换为 replace 模式"
    echo "（仅清空 DEFAULT 租户的业务数据，不影响其他租户）"
    MODE="replace"
  else
    echo "  -> DEFAULT 租户无业务数据，使用 fresh 模式"
    MODE="fresh"
  fi
else
  echo ""
  echo "[2/4] 使用指定模式: $MODE"
fi

# ─────────────────────────── replace 模式：清空 DEFAULT 租户数据 ─
if [[ "$MODE" == "replace" ]]; then
  echo ""
  echo "  将删除以下集合中 DEFAULT 租户 (${DEFAULT_TENANT_ID}) 的业务数据："
  for COLL in "${BUSINESS_COLLECTIONS[@]}"; do
    echo "    - $COLL"
  done
  echo ""
  echo "  注意：其他租户的数据不受影响"
  echo ""
  read -r -p "确认继续？[y/N] " CONFIRM
  if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo "已取消。"
    exit 0
  fi

  echo ""
  echo "正在删除 DEFAULT 租户业务数据..."
  DELETE_TOTAL=0
  for COLL in "${BUSINESS_COLLECTIONS[@]}"; do
    DELETED=$(mongosh "$MONGO_URI" --quiet --eval \
      "const r = db.getSiblingDB('${MONGO_DB}').${COLL}.deleteMany({ tenantId: ObjectId('${DEFAULT_TENANT_ID}') }); print(r.deletedCount);" \
      2>/dev/null | tail -1 || echo "0")
    echo "  -> ${COLL}: 删除 ${DELETED} 条"
    DELETE_TOTAL=$(( DELETE_TOTAL + ${DELETED:-0} ))
  done
  echo "  共删除 ${DELETE_TOTAL} 条记录"
fi

# ─────────────────────────── 导入业务集合 ────────────────────────
echo ""
echo "[3/4] 导入业务集合 (源库: test  ->  目标库: ${MONGO_DB}) ..."
IMPORT_OK=0
IMPORT_SKIP=0

for COLL in "${BUSINESS_COLLECTIONS[@]}"; do
  BSON_FILE="${SOURCE_DB_DIR}/${COLL}.bson"

  if [[ ! -f "$BSON_FILE" ]]; then
    echo "  [跳过] ${COLL}  (备份中不存在)"
    (( IMPORT_SKIP++ )) || true
    continue
  fi

  mongorestore \
    --uri "$MONGO_URI" \
    --db "$MONGO_DB" \
    --collection "$COLL" \
    "$BSON_FILE" \
    2>&1 | grep -E "(done|error|document)" | sed 's/^/  /'

  echo "  [完成] ${COLL}"
  (( IMPORT_OK++ )) || true
done

echo ""
echo "  导入完成: ${IMPORT_OK} 个集合成功，${IMPORT_SKIP} 个跳过"

# ─────────────────────────── 注入 tenantId ───────────────────────
echo ""
echo "[4/4] 注入 DEFAULT 租户 tenantId ..."

INJECT_RESULT=$(mongosh "$MONGO_URI" --quiet --eval '
  const tenant = db.getSiblingDB("'"${MONGO_DB}"'").tenants.findOne({ code: "DEFAULT" });
  if (!tenant) {
    print("ERROR: 未找到 code=DEFAULT 的租户");
    quit(1);
  }
  const tenantId = tenant._id;
  print("TENANT_ID:" + tenantId.toString());

  const collections = '"$(printf '"%s",' "${BUSINESS_COLLECTIONS[@]}" | sed 's/,$//;s/.*/[&]/')"';

  let totalUpdated = 0;
  for (const coll of collections) {
    const result = db.getSiblingDB("'"${MONGO_DB}"'")[coll].updateMany(
      { tenantId: { $exists: false } },
      { $set: { tenantId: tenantId } }
    );
    if (result.modifiedCount > 0) {
      print("  更新 " + coll + ": " + result.modifiedCount + " 条");
      totalUpdated += result.modifiedCount;
    }
  }
  print("TOTAL_UPDATED:" + totalUpdated);
')

# 解析并打印结果
echo "$INJECT_RESULT" | grep -v "^TENANT_ID:" | grep -v "^TOTAL_UPDATED:" || true
TENANT_ID=$(echo "$INJECT_RESULT" | grep "^TENANT_ID:" | cut -d: -f2)
TOTAL_UPDATED=$(echo "$INJECT_RESULT" | grep "^TOTAL_UPDATED:" | cut -d: -f2)

if [[ -z "$TENANT_ID" ]]; then
  echo "  警告: tenantId 注入失败，请手动检查 tenants 集合中是否存在 code=DEFAULT 的文档"
  exit 1
fi

echo ""
echo "=================================================="
echo " 全部完成！"
echo " 模式         : $MODE"
echo " 目标数据库   : $MONGO_DB"
echo " 导入集合数   : $IMPORT_OK"
echo " DEFAULT 租户 : $TENANT_ID"
echo " 注入记录数   : $TOTAL_UPDATED"
echo "=================================================="
