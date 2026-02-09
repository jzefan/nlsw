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

# MongoDB 认证配置（首次部署或后端部署时需要）
if [ "$FIRST_DEPLOY" = "y" ]; then
    echo ""
    echo -e "${YELLOW}MongoDB 认证配置:${NC}"
    read -p "MongoDB 用户名 [nlsw_user]: " MONGO_USER
    MONGO_USER=${MONGO_USER:-"nlsw_user"}
    read -s -p "MongoDB 密码: " MONGO_PASSWORD
    echo ""
    if [ -z "$MONGO_PASSWORD" ]; then
        # 生成随机密码
        MONGO_PASSWORD=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)
        echo -e "${YELLOW}已生成随机密码: $MONGO_PASSWORD${NC}"
    fi
    read -p "MongoDB 数据库名 [nldb]: " MONGO_DATABASE
    MONGO_DATABASE=${MONGO_DATABASE:-"nldb"}

    echo ""
    echo -e "${YELLOW}应用配置:${NC}"
    read -p "公司名称 [江苏联润]: " COMPANY_NAME
    COMPANY_NAME=${COMPANY_NAME:-"江苏联润"}
    read -p "系统名称 [${COMPANY_NAME}物流系统]: " SYSTEM_NAME
    SYSTEM_NAME=${SYSTEM_NAME:-"${COMPANY_NAME}物流系统"}

    # 生成 Session Secret
    SESSION_SECRET=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
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
        echo -e "${YELLOW}MongoDB 认证配置:${NC}"
        read -p "MongoDB 用户名 [nlsw_user]: " MONGO_USER
        MONGO_USER=${MONGO_USER:-"nlsw_user"}
        read -s -p "MongoDB 密码: " MONGO_PASSWORD
        echo ""
        read -p "MongoDB 数据库名 [nldb]: " MONGO_DATABASE
        MONGO_DATABASE=${MONGO_DATABASE:-"nldb"}

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
if [ "$FIRST_DEPLOY" = "y" ] || [ "$UPDATE_ENV" = "y" ]; then
    echo "--------------------------------------"
    echo "MongoDB 用户: $MONGO_USER"
    echo "MongoDB 数据库: $MONGO_DATABASE"
    echo "公司名称: $COMPANY_NAME"
    if [ -n "$SYSTEM_NAME" ]; then
        echo "系统名称: $SYSTEM_NAME"
    fi
    echo "更新 .env: 是"
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
    PROD_SYSTEM_NAME="${SYSTEM_NAME:-${LOCAL_SYSTEM_NAME:-江苏联润物流系统}}"
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
    cp -r app.js config controllers models routes.js routes_api.js package.json package-lock.json public views /tmp/nlsw-deploy/
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

    # 打包本地 MongoDB 数据目录
    echo "打包本地 MongoDB 数据..."
    if [ -d "$PROJECT_ROOT/data/db" ]; then
        cd "$PROJECT_ROOT"
        tar -czf /tmp/nlsw-mongo-data.tar.gz data/db
        echo "上传 MongoDB 数据到服务器..."
        eval "$SCP_CMD /tmp/nlsw-mongo-data.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/"
        rm -f /tmp/nlsw-mongo-data.tar.gz
    else
        echo -e "${YELLOW}警告: 本地 data/db 目录不存在，跳过数据迁移${NC}"
    fi

    eval "$SSH_CMD" << ENDSSH
set -e
export PATH="\$HOME/sw/node-v22.22/bin:\$PATH"

echo "安装 PM2 和 serve..."
npm install -g pm2 serve

echo "配置 PM2 开机启动..."
pm2 startup systemd -u $SERVER_USER --hp /home/$SERVER_USER || true

# 停止可能运行的 MongoDB
echo "停止已有 MongoDB 进程..."
pkill -f "mongod.*27028" 2>/dev/null || true
sleep 2

# 创建目录
echo "创建目录..."
mkdir -p $DEPLOY_PATH/data
mkdir -p $DEPLOY_PATH/log

# 解压 MongoDB 数据（如果存在）
if [ -f "/tmp/nlsw-mongo-data.tar.gz" ]; then
    echo "解压 MongoDB 数据..."
    cd $DEPLOY_PATH
    tar -xzf /tmp/nlsw-mongo-data.tar.gz
    rm -f /tmp/nlsw-mongo-data.tar.gz
    echo "MongoDB 数据迁移完成!"
else
    echo "创建空的 MongoDB 数据目录..."
    mkdir -p $DEPLOY_PATH/data/db
fi

# 创建 MongoDB 启动脚本（支持认证）
echo "创建 MongoDB 启动脚本..."
cat > $DEPLOY_PATH/startdb.sh << 'DBEOF'
#!/bin/bash
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
mongod --dbpath=\$SCRIPT_DIR/data/db --port=27028 --logpath=\$SCRIPT_DIR/log/mongod.log --auth --fork
DBEOF
chmod +x $DEPLOY_PATH/startdb.sh

# 创建 MongoDB 停止脚本
cat > $DEPLOY_PATH/stopdb.sh << 'DBEOF'
#!/bin/bash
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
mongod --shutdown --dbpath=\$SCRIPT_DIR/data/db 2>/dev/null || pkill -f "mongod.*27028" || true
DBEOF
chmod +x $DEPLOY_PATH/stopdb.sh

# 首次启动 MongoDB（无认证模式，用于创建用户）
echo "启动 MongoDB（初始化模式）..."
mongod --dbpath=$DEPLOY_PATH/data/db --port=27028 --logpath=$DEPLOY_PATH/log/mongod.log --fork
sleep 3

# 创建 MongoDB 用户
echo "创建 MongoDB 用户..."
mongosh --port 27028 << MONGOEOF
use $MONGO_DATABASE
db.createUser({
  user: "$MONGO_USER",
  pwd: "$MONGO_PASSWORD",
  roles: [{ role: "readWrite", db: "$MONGO_DATABASE" }]
})
MONGOEOF

# 停止并重启（认证模式）
echo "重启 MongoDB（认证模式）..."
mongod --shutdown --dbpath=$DEPLOY_PATH/data/db 2>/dev/null || pkill -f "mongod.*27028" || true
sleep 2
$DEPLOY_PATH/startdb.sh
sleep 3

# 验证 MongoDB 运行状态
if pgrep -f "mongod.*27028" > /dev/null; then
    echo "✓ MongoDB 已成功启动在端口 27028（认证模式）"
else
    echo "✗ MongoDB 启动失败，请检查日志: $DEPLOY_PATH/log/mongod.log"
fi

# 创建后端 .env 文件
echo "创建后端 .env 配置文件..."
cat > $DEPLOY_PATH/.env << ENVEOF
# Server Configuration
PORT=1080
NODE_ENV=production

# MongoDB Configuration
MONGO_HOST=localhost
MONGO_PORT=27028
MONGO_DATABASE=$MONGO_DATABASE
MONGO_USER=$MONGO_USER
MONGO_PASSWORD=$MONGO_PASSWORD
MONGO_AUTH_SOURCE=$MONGO_DATABASE

# Session
SESSION_SECRET=$SESSION_SECRET

# Company
COMPANY_NAME=$COMPANY_NAME
ENVEOF
chmod 600 $DEPLOY_PATH/.env

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
    tar -xzf nlsw-deploy.tar.gz
    mv nlsw-deploy/* \$DEPLOY_PATH/
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
    tar -xzf nlsw-deploy.tar.gz
    mv nlsw-deploy/* \$DEPLOY_PATH/
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
    tar -xzf nlsw-deploy.tar.gz

    if [ "\$DEPLOY_BACKEND" = "y" ]; then
        echo "更新后端文件..."
        cp -r nlsw-deploy/app.js \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/config \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/controllers \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/models \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/routes.js \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/routes_api.js \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/package.json \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/package-lock.json \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/public \$DEPLOY_PATH/ 2>/dev/null || true
        cp -r nlsw-deploy/views \$DEPLOY_PATH/ 2>/dev/null || true
        # 更新 keys 和 utils 目录（如果存在）
        if [ -d "nlsw-deploy/keys" ]; then
            cp -r nlsw-deploy/keys \$DEPLOY_PATH/ 2>/dev/null || true
        fi
        if [ -d "nlsw-deploy/utils" ]; then
            cp -r nlsw-deploy/utils \$DEPLOY_PATH/ 2>/dev/null || true
        fi
    fi

    if [ "\$DEPLOY_FRONTEND" = "y" ]; then
        echo "更新前端文件..."
        mkdir -p \$DEPLOY_PATH/front_end
        rm -rf \$DEPLOY_PATH/front_end/dist
        cp -r nlsw-deploy/front_end/dist \$DEPLOY_PATH/front_end/
    fi

    # 更新部署配置
    cp -r nlsw-deploy/deploy \$DEPLOY_PATH/ 2>/dev/null || true

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

# MongoDB Configuration
MONGO_HOST=localhost
MONGO_PORT=27028
MONGO_DATABASE=$MONGO_DATABASE
MONGO_USER=$MONGO_USER
MONGO_PASSWORD=$MONGO_PASSWORD
MONGO_AUTH_SOURCE=$MONGO_DATABASE

# Session
SESSION_SECRET=$SESSION_SECRET

# Company
COMPANY_NAME=$COMPANY_NAME
ENVEOF
    chmod 600 \$DEPLOY_PATH/.env
    echo "✓ .env 配置文件已创建"
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
if ! pgrep -f "mongod.*27028" > /dev/null; then
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
