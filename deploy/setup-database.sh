#!/bin/bash
# MongoDB 数据库配置脚本
# 在服务器上执行，用于配置 MongoDB 认证

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "======================================"
echo "  MongoDB 数据库配置脚本"
echo "======================================"

# 交互式获取配置
echo ""
echo -e "${YELLOW}请输入 MongoDB 配置:${NC}"

# MongoDB 端口
read -p "MongoDB 端口 [27027]: " MONGO_PORT
MONGO_PORT=${MONGO_PORT:-"27027"}

# MongoDB 用户名
read -p "MongoDB 用户名 [nlsw_user]: " MONGO_USER
MONGO_USER=${MONGO_USER:-"nlsw_user"}

# MongoDB 密码
read -s -p "MongoDB 密码 (留空自动生成): " MONGO_PASSWORD
echo ""
if [ -z "$MONGO_PASSWORD" ]; then
    MONGO_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
    echo -e "${YELLOW}已生成随机密码: $MONGO_PASSWORD${NC}"
fi

# MongoDB 数据库名
read -p "MongoDB 数据库名 [nldb]: " MONGO_DATABASE
MONGO_DATABASE=${MONGO_DATABASE:-"nldb"}

echo ""
echo "======================================"
echo "  配置确认"
echo "======================================"
echo "MongoDB 端口: $MONGO_PORT"
echo "MongoDB 用户: $MONGO_USER"
echo "MongoDB 数据库: $MONGO_DATABASE"
echo "======================================"
echo ""

read -p "确认以上配置? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "配置已取消"
    exit 0
fi

# 检查 MongoDB 是否在运行
if ! pgrep -f "mongod.*$MONGO_PORT" > /dev/null && ! systemctl is-active --quiet mongod; then
    echo -e "${RED}错误: MongoDB 未运行${NC}"
    echo "请先启动 MongoDB"
    exit 1
fi

# 检查是否已有认证配置
echo ""
echo "正在检查 MongoDB 认证状态..."
if mongosh --port "$MONGO_PORT" --eval "db.adminCommand({listDatabases: 1})" &> /dev/null; then
    echo -e "${YELLOW}MongoDB 当前未启用认证或已认证${NC}"
    read -p "是否继续创建/更新用户? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 0
    fi
fi

# 创建 MongoDB 用户
echo ""
echo "正在创建 MongoDB 用户..."
mongosh --port "$MONGO_PORT" << MONGOEOF
use $MONGO_DATABASE
db.createUser({
  user: "$MONGO_USER",
  pwd: "$MONGO_PASSWORD",
  roles: [{ role: "readWrite", db: "$MONGO_DATABASE" }]
})
MONGOEOF

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ MongoDB 用户创建成功${NC}"
else
    echo -e "${YELLOW}注意: 用户可能已存在或创建失败${NC}"
    read -p "是否更新用户密码? (y/n): " UPDATE_PWD
    if [ "$UPDATE_PWD" = "y" ]; then
        mongosh --port "$MONGO_PORT" << MONGOEOF
use $MONGO_DATABASE
db.updateUser("$MONGO_USER", {
  pwd: "$MONGO_PASSWORD"
})
MONGOEOF
        echo -e "${GREEN}✓ 密码已更新${NC}"
    fi
fi

echo ""
echo "======================================"
echo -e "  ${GREEN}配置完成!${NC}"
echo "======================================"
echo ""
echo "请将以下配置添加到 $PROJECT_ROOT/.env 文件中:"
echo ""
echo "MONGO_HOST=localhost"
echo "MONGO_PORT=$MONGO_PORT"
echo "MONGO_DATABASE=$MONGO_DATABASE"
echo "MONGO_USER=$MONGO_USER"
echo "MONGO_PASSWORD=$MONGO_PASSWORD"
echo "MONGO_AUTH_SOURCE=$MONGO_DATABASE"
echo ""
echo -e "${YELLOW}重要提示:${NC}"
echo "1. 请妥善保管数据库密码"
echo "2. 如需启用认证，请在 MongoDB 启动时添加 --auth 参数"
echo "3. 或修改 startdb.sh 脚本，添加 --auth 选项"
echo ""
