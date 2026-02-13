#!/bin/bash
# 部署脚本
# 在本地执行，用于打包并上传到服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 获取项目根目录的绝对路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "======================================"
echo "  NLSW 项目部署脚本"
echo "======================================"

# 交互式获取配置
echo ""
echo -e "${YELLOW}请输入部署配置:${NC}"

# 服务器IP
read -p "服务器IP地址 [1.13.249.95]: " SERVER_IP
SERVER_IP=${SERVER_IP:-"1.13.249.95"}

# 服务器用户名
read -p "服务器用户名 [ubuntu]: " SERVER_USER
SERVER_USER=${SERVER_USER:-"ubuntu"}

# 服务器密码
read -s -p "服务器密码: " SERVER_PASSWORD
echo ""

# 是否首次部署
read -p "是否首次部署? (y/n) [n]: " FIRST_DEPLOY
FIRST_DEPLOY=${FIRST_DEPLOY:-"n"}

# 部署模式选择
echo ""
echo -e "${YELLOW}选择部署模式:${NC}"
echo "  1) 独立部署 (standalone) — 单公司，无平台概念"
echo "  2) SaaS 多租户部署 (saas) — 平台管理多公司"
read -p "请选择 [1]: " DEPLOY_MODE_CHOICE
DEPLOY_MODE_CHOICE=${DEPLOY_MODE_CHOICE:-"1"}

if [ "$DEPLOY_MODE_CHOICE" = "2" ]; then
    DEPLOY_MODE="saas"
    STANDALONE_COMPANY=""
else
    DEPLOY_MODE="standalone"
    read -p "公司名称 (STANDALONE_COMPANY) [江苏联润]: " STANDALONE_COMPANY
    STANDALONE_COMPANY=${STANDALONE_COMPANY:-"江苏联润"}
fi

# 应用配置（首次部署时需要）
if [ "$FIRST_DEPLOY" = "y" ]; then
    echo ""
    echo -e "${YELLOW}应用配置:${NC}"
    read -p "公司名称 [江苏联润]: " COMPANY_NAME
    COMPANY_NAME=${COMPANY_NAME:-"江苏联润"}
    read -p "系统名称 [${COMPANY_NAME}物流系统]: " SYSTEM_NAME
    SYSTEM_NAME=${SYSTEM_NAME:-"${COMPANY_NAME}物流系统"}

    # 生成 Session Secret
    SESSION_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

    # 本地 MongoDB 认证配置（用于导出数据）
    echo ""
    echo -e "${YELLOW}本地 MongoDB 认证配置（用于导出数据）:${NC}"
    read -p "本地 MongoDB 需要认证? (y/n) [y]: " LOCAL_MONGO_AUTH
    LOCAL_MONGO_AUTH=${LOCAL_MONGO_AUTH:-"y"}

    if [ "$LOCAL_MONGO_AUTH" = "y" ]; then
        read -p "本地 MongoDB 端口 [27027]: " LOCAL_MONGO_PORT
        LOCAL_MONGO_PORT=${LOCAL_MONGO_PORT:-"27027"}
        read -p "本地 MongoDB 用户名: " LOCAL_MONGO_USER
        read -s -p "本地 MongoDB 密码: " LOCAL_MONGO_PASSWORD
        echo ""
        read -p "本地 MongoDB 认证数据库 [admin]: " LOCAL_MONGO_AUTH_DB
        LOCAL_MONGO_AUTH_DB=${LOCAL_MONGO_AUTH_DB:-"admin"}
    else
        read -p "本地 MongoDB 端口 [27027]: " LOCAL_MONGO_PORT
        LOCAL_MONGO_PORT=${LOCAL_MONGO_PORT:-"27027"}
    fi

    # 服务器 MongoDB 认证配置（用于恢复数据）
    echo ""
    echo -e "${YELLOW}服务器 MongoDB 认证配置（用于恢复数据）:${NC}"
    read -p "服务器 MongoDB 需要认证? (y/n) [y]: " SERVER_MONGO_AUTH
    SERVER_MONGO_AUTH=${SERVER_MONGO_AUTH:-"y"}

    if [ "$SERVER_MONGO_AUTH" = "y" ]; then
        read -p "服务器 MongoDB 端口 [27017]: " SERVER_MONGO_PORT
        SERVER_MONGO_PORT=${SERVER_MONGO_PORT:-"27017"}
        read -p "服务器 MongoDB 用户名: " SERVER_MONGO_USER
        read -s -p "服务器 MongoDB 密码: " SERVER_MONGO_PASSWORD
        echo ""
        read -p "服务器 MongoDB 认证数据库 [admin]: " SERVER_MONGO_AUTH_DB
        SERVER_MONGO_AUTH_DB=${SERVER_MONGO_AUTH_DB:-"admin"}
    else
        read -p "服务器 MongoDB 端口 [27017]: " SERVER_MONGO_PORT
        SERVER_MONGO_PORT=${SERVER_MONGO_PORT:-"27017"}
    fi
fi

# 部署类型选择
echo ""
echo -e "${YELLOW}选择部署类型:${NC}"
echo "  1) 全量部署 (前端+后端)"
echo "  2) 仅部署前端"
echo "  3) 仅部署后端"
read -p "请选择 [1]: " DEPLOY_TYPE
DEPLOY_TYPE=${DEPLOY_TYPE:-"1"}

# 转换为变量
DEPLOY_FRONTEND="n"
DEPLOY_BACKEND="n"
case $DEPLOY_TYPE in
    1)
        DEPLOY_FRONTEND="y"
        DEPLOY_BACKEND="y"
        DEPLOY_TYPE_DESC="全量部署"
        ;;
    2)
        DEPLOY_FRONTEND="y"
        DEPLOY_TYPE_DESC="仅前端"
        ;;
    3)
        DEPLOY_BACKEND="y"
        DEPLOY_TYPE_DESC="仅后端"
        ;;
    *)
        DEPLOY_FRONTEND="y"
        DEPLOY_BACKEND="y"
        DEPLOY_TYPE_DESC="全量部署"
        ;;
esac

# 是否备份（仅非首次部署时询问）
BACKUP="y"
if [ "$FIRST_DEPLOY" != "y" ]; then
    read -p "是否备份旧版本? (y/n) [n]: " BACKUP
    BACKUP=${BACKUP:-"n"}

    # 询问是否需要更新 .env 配置
    read -p "是否需要创建/更新服务器 .env 配置? (y/n) [n]: " UPDATE_ENV
    UPDATE_ENV=${UPDATE_ENV:-"n"}

    if [ "$UPDATE_ENV" = "y" ]; then
        echo ""
        echo -e "${YELLOW}应用配置:${NC}"
        read -p "公司名称 [江苏联润]: " COMPANY_NAME
        COMPANY_NAME=${COMPANY_NAME:-"江苏联润"}

        # 生成 Session Secret
        SESSION_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
    fi
fi

# 部署路径
DEPLOY_PATH="/home/${SERVER_USER}/nlsw2"

echo ""
echo "======================================"
echo "  配置确认"
echo "======================================"
echo "服务器IP: $SERVER_IP"
echo "用户名: $SERVER_USER"
echo "部署路径: $DEPLOY_PATH"
echo "首次部署: $FIRST_DEPLOY"
echo "部署类型: $DEPLOY_TYPE_DESC"
echo "备份旧版本: $BACKUP"
echo "项目目录: $PROJECT_ROOT"
if [ -n "$DEPLOY_MODE" ]; then
    echo "--------------------------------------"
    if [ "$DEPLOY_MODE" = "standalone" ]; then
        echo "部署模式: standalone (独立部署)"
        echo "独立公司: $STANDALONE_COMPANY"
    else
        echo "部署模式: saas (多租户)"
    fi
fi
if [ "$FIRST_DEPLOY" = "y" ] || [ "$UPDATE_ENV" = "y" ]; then
    echo "--------------------------------------"
    echo "公司名称: $COMPANY_NAME"
    if [ -n "$SYSTEM_NAME" ]; then
        echo "系统名称: $SYSTEM_NAME"
    fi
    echo "更新 .env: 是"
fi
if [ "$FIRST_DEPLOY" = "y" ]; then
    echo "--------------------------------------"
    if [ "$LOCAL_MONGO_AUTH" = "y" ]; then
        echo "本地 MongoDB: localhost:$LOCAL_MONGO_PORT (需认证)"
    else
        echo "本地 MongoDB: localhost:$LOCAL_MONGO_PORT (无认证)"
    fi
    if [ "$SERVER_MONGO_AUTH" = "y" ]; then
        echo "服务器 MongoDB: localhost:$SERVER_MONGO_PORT (需认证)"
    else
        echo "服务器 MongoDB: localhost:$SERVER_MONGO_PORT (无认证)"
    fi
fi
echo "======================================"
echo ""

read -p "确认以上配置? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "部署已取消"
    exit 0
fi

# 检查 sshpass 是否安装
if ! command -v sshpass &> /dev/null; then
    echo -e "${YELLOW}正在安装 sshpass...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install hudochenkov/sshpass/sshpass 2>/dev/null || brew install esolitos/ipa/sshpass 2>/dev/null || {
            echo -e "${RED}请手动安装 sshpass: brew install hudochenkov/sshpass/sshpass${NC}"
            exit 1
        }
    else
        sudo apt-get install -y sshpass
    fi
fi

# SSH 和 SCP 命令封装
SSH_CMD="sshpass -p '$SERVER_PASSWORD' ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_IP}"
SCP_CMD="sshpass -p '$SERVER_PASSWORD' scp -o StrictHostKeyChecking=no"

# 步骤计数
STEP=1
TOTAL_STEPS=5
if [ "$DEPLOY_FRONTEND" = "n" ]; then
    TOTAL_STEPS=$((TOTAL_STEPS - 1))
fi

# 1. 构建前端（如果需要）
if [ "$DEPLOY_FRONTEND" = "y" ]; then
    echo ""
    echo -e "${GREEN}[$STEP/$TOTAL_STEPS] 构建前端项目...${NC}"
    STEP=$((STEP + 1))
    cd "$PROJECT_ROOT/front_end"

    # 更新前端环境变量
    # 读取本地 .env 中的公司配置（如果存在）
    if [ -f ".env" ]; then
        LOCAL_COMPANY_NAME=$(grep "^VITE_COMPANY_NAME=" .env | cut -d'=' -f2)
        LOCAL_SYSTEM_NAME=$(grep "^VITE_SYSTEM_NAME=" .env | cut -d'=' -f2)
        LOCAL_COMPANY_FULL_NAME=$(grep "^VITE_COMPANY_FULL_NAME=" .env | cut -d'=' -f2)
    fi
    # 使用首次部署的配置或本地配置
    PROD_COMPANY_NAME="${COMPANY_NAME:-${LOCAL_COMPANY_NAME:-江苏联润}}"
    # standalone 模式下，系统名称使用 STANDALONE_COMPANY + 物流系统
    if [ "$DEPLOY_MODE" = "standalone" ] && [ -n "$STANDALONE_COMPANY" ]; then
        PROD_SYSTEM_NAME="${SYSTEM_NAME:-${LOCAL_SYSTEM_NAME:-${STANDALONE_COMPANY}物流系统}}"
    else
        PROD_SYSTEM_NAME="${SYSTEM_NAME:-${LOCAL_SYSTEM_NAME:-江苏联润物流系统}}"
    fi
    PROD_COMPANY_FULL_NAME="${LOCAL_COMPANY_FULL_NAME:-${PROD_COMPANY_NAME}有限公司}"

    cat > .env.production << EOF
# 生产环境配置
VITE_COMPANY_NAME=${PROD_COMPANY_NAME}
VITE_SYSTEM_NAME=${PROD_SYSTEM_NAME}
VITE_COMPANY_FULL_NAME=${PROD_COMPANY_FULL_NAME}
VITE_SERVER_API_URL=http://${SERVER_IP}/api
VITE_SERVER_API_PREFIX=
VITE_SERVER_API_TIMEOUT=30000
EOF

    pnpm install
    pnpm build
    echo "前端构建完成!"
fi

# 2. 打包项目
echo ""
echo -e "${GREEN}[$STEP/$TOTAL_STEPS] 打包项目文件...${NC}"
STEP=$((STEP + 1))
cd "$PROJECT_ROOT"

# 创建临时目录
rm -rf /tmp/nlsw-deploy
mkdir -p /tmp/nlsw-deploy

# 复制后端文件（如果需要）
if [ "$DEPLOY_BACKEND" = "y" ]; then
    cp -r app.js config controllers middleware models routes.js routes_api.js package.json package-lock.json public views /tmp/nlsw-deploy/
    # 复制 keys 目录（如果存在）
    if [ -d "keys" ]; then
        cp -r keys /tmp/nlsw-deploy/
    fi
    # 复制 utils 目录（如果存在）
    if [ -d "utils" ]; then
        cp -r utils /tmp/nlsw-deploy/
    fi
fi

# 复制前端构建产物（如果需要）
if [ "$DEPLOY_FRONTEND" = "y" ]; then
    mkdir -p /tmp/nlsw-deploy/front_end
    cp -r front_end/dist /tmp/nlsw-deploy/front_end/
fi

# 复制部署配置
cp -r deploy /tmp/nlsw-deploy/

# 打包
cd /tmp
tar -czf nlsw-deploy.tar.gz nlsw-deploy
echo "打包完成: /tmp/nlsw-deploy.tar.gz"

# 3. 上传到服务器
echo ""
echo -e "${GREEN}[$STEP/$TOTAL_STEPS] 上传到服务器...${NC}"
STEP=$((STEP + 1))
eval "$SCP_CMD /tmp/nlsw-deploy.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/"
echo "上传完成!"

# 4. 在服务器上执行部署
echo ""
echo -e "${GREEN}[$STEP/$TOTAL_STEPS] 在服务器上执行部署...${NC}"
STEP=$((STEP + 1))

# 首次部署：安装依赖和初始化数据库
if [ "$FIRST_DEPLOY" = "y" ]; then
    echo "首次部署，正在安装服务器依赖..."

    # 导出本地 MongoDB 数据库
    echo "导出本地 MongoDB 数据库 nldb_saas..."
    if command -v mongodump &> /dev/null; then
        # 构建 mongodump 命令
        MONGODUMP_CMD="mongodump --db=nldb_saas --out=/tmp/nlsw-mongo-dump"

        if [ "$LOCAL_MONGO_AUTH" = "y" ]; then
            MONGODUMP_CMD="$MONGODUMP_CMD --port=$LOCAL_MONGO_PORT --username=$LOCAL_MONGO_USER --password=$LOCAL_MONGO_PASSWORD --authenticationDatabase=$LOCAL_MONGO_AUTH_DB"
        else
            MONGODUMP_CMD="$MONGODUMP_CMD --port=$LOCAL_MONGO_PORT"
        fi

        # 执行导出
        if eval "$MONGODUMP_CMD --quiet"; then
            echo "打包数据库导出..."
            cd /tmp
            tar -czf nlsw-mongo-dump.tar.gz nlsw-mongo-dump
            echo "上传数据库到服务器..."
            eval "$SCP_CMD /tmp/nlsw-mongo-dump.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/"
            rm -rf /tmp/nlsw-mongo-dump /tmp/nlsw-mongo-dump.tar.gz
            echo "数据库导出完成!"
        else
            echo -e "${YELLOW}警告: 数据库导出失败，跳过数据迁移${NC}"
            echo "请检查 MongoDB 是否运行以及认证信息是否正确"
        fi
    else
        echo -e "${YELLOW}警告: mongodump 命令不存在，跳过数据迁移${NC}"
        echo "请安装 MongoDB Database Tools: https://www.mongodb.com/try/download/database-tools"
    fi

    eval "$SSH_CMD" << ENDSSH
set -e
export PATH="\$HOME/sw/node-v22.22/bin:\$PATH"

echo "检查并安装 PM2 和 serve..."
INSTALL_PACKAGES=""
if ! command -v pm2 &> /dev/null; then
    INSTALL_PACKAGES="\$INSTALL_PACKAGES pm2"
fi
if ! command -v serve &> /dev/null; then
    INSTALL_PACKAGES="\$INSTALL_PACKAGES serve"
fi
if [ -n "\$INSTALL_PACKAGES" ]; then
    echo "安装:\$INSTALL_PACKAGES"
    npm install -g\$INSTALL_PACKAGES
else
    echo "PM2 和 serve 已安装，跳过"
fi

echo "配置 PM2 开机启动..."
pm2 startup systemd -u $SERVER_USER --hp /home/$SERVER_USER || true

# 创建目录
echo "创建目录..."
mkdir -p $DEPLOY_PATH/data
mkdir -p $DEPLOY_PATH/log

# 恢复 MongoDB 数据库（如果存在导出文件）
if [ -f "/tmp/nlsw-mongo-dump.tar.gz" ]; then
    echo "解压数据库导出文件..."
    cd /tmp
    tar -xzf nlsw-mongo-dump.tar.gz

    # 构建 MongoDB 连接参数
    MONGO_CONN_OPTS="--port=$SERVER_MONGO_PORT"
    if [ "$SERVER_MONGO_AUTH" = "y" ]; then
        MONGO_CONN_OPTS="\$MONGO_CONN_OPTS --username=$SERVER_MONGO_USER --password=$SERVER_MONGO_PASSWORD --authenticationDatabase=$SERVER_MONGO_AUTH_DB"
    fi

    # 检查 MongoDB 是否运行
    if ! pgrep -f "mongod" > /dev/null && ! systemctl is-active --quiet mongod; then
        echo -e "\033[1;33m警告: MongoDB 未运行\033[0m"
        echo "请先启动 MongoDB，然后手动运行数据恢复:"
        echo "  cd /tmp"
        if [ "$SERVER_MONGO_AUTH" = "y" ]; then
            echo "  mongorestore --db=nldb_saas --drop --port=$SERVER_MONGO_PORT --username=$SERVER_MONGO_USER --password=*** --authenticationDatabase=$SERVER_MONGO_AUTH_DB nlsw-mongo-dump/nldb_saas"
        else
            echo "  mongorestore --db=nldb_saas --drop --port=$SERVER_MONGO_PORT nlsw-mongo-dump/nldb_saas"
        fi
    else
        # 检查现有数据库（如果需要认证）
        echo "检查现有数据库 nldb_saas..."
        if [ "$SERVER_MONGO_AUTH" = "y" ]; then
            DB_CHECK_CMD="mongosh --port=$SERVER_MONGO_PORT --username=$SERVER_MONGO_USER --password=$SERVER_MONGO_PASSWORD --authenticationDatabase=$SERVER_MONGO_AUTH_DB --quiet --eval \"db.getMongo().getDBNames().includes('nldb_saas')\" 2>/dev/null"
        else
            DB_CHECK_CMD="mongosh --port=$SERVER_MONGO_PORT --quiet --eval \"db.getMongo().getDBNames().includes('nldb_saas')\" 2>/dev/null"
        fi
        DB_EXISTS=\$(eval "\$DB_CHECK_CMD" || echo "false")

        if [ "\$DB_EXISTS" = "true" ]; then
            echo "备份现有数据库..."
            BACKUP_FILE="/tmp/nldb_saas_backup_\$(date +%Y%m%d_%H%M%S).gz"
            if [ "$SERVER_MONGO_AUTH" = "y" ]; then
                mongodump --db=nldb_saas --archive=\$BACKUP_FILE --gzip --port=$SERVER_MONGO_PORT --username=$SERVER_MONGO_USER --password=$SERVER_MONGO_PASSWORD --authenticationDatabase=$SERVER_MONGO_AUTH_DB
            else
                mongodump --db=nldb_saas --archive=\$BACKUP_FILE --gzip --port=$SERVER_MONGO_PORT
            fi
            echo "✓ 备份已保存到: \$BACKUP_FILE"
        fi

        # 恢复数据库
        echo "恢复数据库 nldb_saas..."
        if [ "$SERVER_MONGO_AUTH" = "y" ]; then
            mongorestore --db=nldb_saas --drop --port=$SERVER_MONGO_PORT --username=$SERVER_MONGO_USER --password=$SERVER_MONGO_PASSWORD --authenticationDatabase=$SERVER_MONGO_AUTH_DB nlsw-mongo-dump/nldb_saas
        else
            mongorestore --db=nldb_saas --drop --port=$SERVER_MONGO_PORT nlsw-mongo-dump/nldb_saas
        fi

        if [ \$? -eq 0 ]; then
            echo "✓ 数据库恢复完成!"
            rm -rf /tmp/nlsw-mongo-dump /tmp/nlsw-mongo-dump.tar.gz
        else
            echo "✗ 数据库恢复失败，请检查认证信息是否正确"
        fi
    fi
else
    echo "未找到数据库导出文件，跳过数据恢复"
fi

# 创建后端 .env 文件
echo "创建后端 .env 配置文件..."
cat > $DEPLOY_PATH/.env << ENVEOF
# Server Configuration
PORT=1080
NODE_ENV=production

# Deploy Mode: standalone | saas
DEPLOY_MODE=$DEPLOY_MODE
STANDALONE_COMPANY=$STANDALONE_COMPANY

# Session
SESSION_SECRET=$SESSION_SECRET

# Company
COMPANY_NAME=$COMPANY_NAME

# MongoDB Configuration
# 请使用 deploy/setup-database.sh 脚本配置数据库认证
# MONGO_HOST=localhost
# MONGO_PORT=27027
# MONGO_DATABASE=nldb
# MONGO_USER=nlsw_user
# MONGO_PASSWORD=your_password
# MONGO_AUTH_SOURCE=nldb
ENVEOF
chmod 600 $DEPLOY_PATH/.env
echo ""
echo -e "\033[1;33m提示: MongoDB 配置未设置${NC}"
echo "首次部署后，请运行 deploy/setup-database.sh 脚本配置数据库"

echo "依赖安装完成!"
ENDSSH
fi

# 执行部署
eval "$SSH_CMD" << ENDSSH
set -e

# 设置 Node.js 路径
export PATH="\$HOME/sw/node-v22.22/bin:\$PATH"

# 验证环境
echo "Node.js 版本: \$(node -v)"
echo "npm 版本: \$(npm -v)"

DEPLOY_PATH="$DEPLOY_PATH"
DEPLOY_FRONTEND="$DEPLOY_FRONTEND"
DEPLOY_BACKEND="$DEPLOY_BACKEND"
BACKUP="$BACKUP"
FIRST_DEPLOY="$FIRST_DEPLOY"

# 首次部署或全量部署时需要处理目录
if [ "\$FIRST_DEPLOY" = "y" ]; then
    # 首次部署，解压到新目录
    echo "解压新版本..."
    mkdir -p \$DEPLOY_PATH
    cd /tmp
    tar -xzf nlsw-deploy.tar.gz 2>&1 | grep -v "Ignoring unknown extended header keyword" || true
    cp -rf nlsw-deploy/* \$DEPLOY_PATH/
    rm -rf nlsw-deploy nlsw-deploy.tar.gz
elif [ "\$BACKUP" = "y" ]; then
    # 需要备份
    BACKUP_DIR=""
    if [ -d "\$DEPLOY_PATH" ]; then
        echo "备份旧版本..."
        BACKUP_DIR="\${DEPLOY_PATH}_backup_\$(date +%Y%m%d_%H%M%S)"
        mv \$DEPLOY_PATH \$BACKUP_DIR
    fi
    # 解压新版本
    echo "解压新版本..."
    mkdir -p \$DEPLOY_PATH
    cd /tmp
    tar -xzf nlsw-deploy.tar.gz 2>&1 | grep -v "Ignoring unknown extended header keyword" || true
    cp -rf nlsw-deploy/* \$DEPLOY_PATH/
    rm -rf nlsw-deploy nlsw-deploy.tar.gz
    # 从备份中恢复 .env 文件
    if [ -n "\$BACKUP_DIR" ] && [ -f "\$BACKUP_DIR/.env" ]; then
        echo "恢复 .env 配置文件..."
        cp \$BACKUP_DIR/.env \$DEPLOY_PATH/.env
    fi
    # 从备份中恢复 keys 目录
    if [ -n "\$BACKUP_DIR" ] && [ -d "\$BACKUP_DIR/keys" ]; then
        echo "恢复 keys 目录..."
        cp -r \$BACKUP_DIR/keys \$DEPLOY_PATH/
    fi
else
    # 增量部署，不备份，直接覆盖
    echo "增量部署（不备份）..."
    cd /tmp
    tar -xzf nlsw-deploy.tar.gz 2>&1 | grep -v "Ignoring unknown extended header keyword" || true

    if [ "\$DEPLOY_BACKEND" = "y" ]; then
        echo "更新后端文件..."
        cp -rf nlsw-deploy/app.js \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/config \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/controllers \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/models \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/routes.js \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/routes_api.js \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/package.json \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/package-lock.json \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/public \$DEPLOY_PATH/ 2>/dev/null || true
        cp -rf nlsw-deploy/views \$DEPLOY_PATH/ 2>/dev/null || true
        # 更新 keys 和 utils 目录（如果存在）
        if [ -d "nlsw-deploy/keys" ]; then
            cp -rf nlsw-deploy/keys \$DEPLOY_PATH/ 2>/dev/null || true
        fi
        if [ -d "nlsw-deploy/utils" ]; then
            cp -rf nlsw-deploy/utils \$DEPLOY_PATH/ 2>/dev/null || true
        fi
    fi

    if [ "\$DEPLOY_FRONTEND" = "y" ]; then
        echo "更新前端文件..."
        mkdir -p \$DEPLOY_PATH/front_end
        rm -rf \$DEPLOY_PATH/front_end/dist
        cp -rf nlsw-deploy/front_end/dist \$DEPLOY_PATH/front_end/
    fi

    # 更新部署配置
    cp -rf nlsw-deploy/deploy \$DEPLOY_PATH/ 2>/dev/null || true

    rm -rf nlsw-deploy nlsw-deploy.tar.gz
fi

# 创建必要目录
mkdir -p \$DEPLOY_PATH/logs
mkdir -p \$DEPLOY_PATH/uploads/receipts
mkdir -p \$DEPLOY_PATH/data/db
mkdir -p \$DEPLOY_PATH/log
mkdir -p \$DEPLOY_PATH/keys

# 安装后端依赖（如果部署后端或首次部署）
if [ "\$DEPLOY_BACKEND" = "y" ] || [ "\$FIRST_DEPLOY" = "y" ] || [ "\$BACKUP" = "y" ]; then
    echo "安装后端依赖..."
    cd \$DEPLOY_PATH
    npm install --production
fi

# 创建或更新 .env 文件
UPDATE_ENV="$UPDATE_ENV"
if [ "\$UPDATE_ENV" = "y" ]; then
    echo "创建/更新 .env 配置文件..."
    cat > \$DEPLOY_PATH/.env << ENVEOF
# Server Configuration
PORT=1080
NODE_ENV=production

# Deploy Mode: standalone | saas
DEPLOY_MODE=$DEPLOY_MODE
STANDALONE_COMPANY=$STANDALONE_COMPANY

# Session
SESSION_SECRET=$SESSION_SECRET

# Company
COMPANY_NAME=$COMPANY_NAME

# MongoDB Configuration
# 请使用 deploy/setup-database.sh 脚本配置数据库认证
# MONGO_HOST=localhost
# MONGO_PORT=27027
# MONGO_DATABASE=nldb
# MONGO_USER=nlsw_user
# MONGO_PASSWORD=your_password
# MONGO_AUTH_SOURCE=nldb
ENVEOF
    chmod 600 \$DEPLOY_PATH/.env
    echo "✓ .env 配置文件已创建"
    echo -e "\033[1;33m提示: MongoDB 配置未设置${NC}"
    echo "请运行 deploy/setup-database.sh 脚本配置数据库"
elif [ "\$FIRST_DEPLOY" != "y" ] && [ ! -f "\$DEPLOY_PATH/.env" ]; then
    echo ""
    echo -e "\033[1;33m警告: 服务器上不存在 .env 配置文件!\033[0m"
    echo "后端服务需要 .env 文件才能正常运行。"
    echo "请手动创建 \$DEPLOY_PATH/.env 文件，或重新部署时选择'创建/更新 .env 配置'。"
fi

# 更新 PM2 配置中的路径
sed -i "s|/home/ubuntu/nlsw2|\$DEPLOY_PATH|g" \$DEPLOY_PATH/deploy/ecosystem.config.js 2>/dev/null || true

# 复制PM2配置
cp \$DEPLOY_PATH/deploy/ecosystem.config.js \$DEPLOY_PATH/ 2>/dev/null || true

# 确保 MongoDB 运行中
echo "检查 MongoDB..."
# 检查是否由 systemctl 管理
if systemctl list-units --type=service --all 2>/dev/null | grep -q mongod; then
    echo "MongoDB 由 systemctl 管理，跳过手动启动"
elif ! pgrep -f "mongod.*27027" > /dev/null; then
    echo "启动 MongoDB..."
    \$DEPLOY_PATH/startdb.sh 2>/dev/null || true
    sleep 3
fi

# 重启服务
if [ "\$DEPLOY_BACKEND" = "y" ]; then
    echo "重启后端服务..."
    pm2 delete nlsw-backend 2>/dev/null || true
    cd \$DEPLOY_PATH
    pm2 start ecosystem.config.js
    pm2 save
fi

if [ "\$DEPLOY_FRONTEND" = "y" ]; then
    echo "重启前端服务..."
    pm2 delete nlsw-frontend 2>/dev/null || true
    pm2 start "serve -s \$DEPLOY_PATH/front_end/dist -l 3000" --name nlsw-frontend
    pm2 save
fi

# 配置Nginx（首次部署或全量备份部署时）
if [ "\$FIRST_DEPLOY" = "y" ] || [ "\$BACKUP" = "y" ]; then
    echo "配置Nginx..."
    # 禁用默认站点
    sudo rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
    # 复制配置文件
    sudo cp \$DEPLOY_PATH/deploy/nginx.conf /etc/nginx/conf.d/nlsw.conf
    # 测试并重载配置
    sudo nginx -t && sudo nginx -s reload
fi

echo ""
echo "======================================"
echo "  服务状态"
echo "======================================"
pm2 list

echo "部署完成!"
ENDSSH

# 5. 清理本地临时文件
echo ""
echo -e "${GREEN}[$STEP/$TOTAL_STEPS] 清理临时文件...${NC}"
rm -rf /tmp/nlsw-deploy /tmp/nlsw-deploy.tar.gz

echo ""
echo "======================================"
echo -e "  ${GREEN}部署成功!${NC}"
echo "  访问地址: http://${SERVER_IP}"
echo "======================================"
