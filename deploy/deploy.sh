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
    cat > .env.production << EOF
# 生产环境配置
VITE_SERVER_API_URL=http://${SERVER_IP}
VITE_SERVER_API_PREFIX=/api
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
pkill -f "mongod.*27027" 2>/dev/null || true
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

# 创建 MongoDB 启动脚本
echo "创建 MongoDB 启动脚本..."
cat > $DEPLOY_PATH/startdb.sh << 'DBEOF'
#!/bin/bash
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
mongod --dbpath=\$SCRIPT_DIR/data/db --port=27027 --logpath=\$SCRIPT_DIR/log/mongod.log --fork
DBEOF
chmod +x $DEPLOY_PATH/startdb.sh

# 创建 MongoDB 停止脚本
cat > $DEPLOY_PATH/stopdb.sh << 'DBEOF'
#!/bin/bash
SCRIPT_DIR="\$(cd "\$(dirname "\$0")" && pwd)"
mongod --shutdown --dbpath=\$SCRIPT_DIR/data/db 2>/dev/null || pkill -f "mongod.*27027" || true
DBEOF
chmod +x $DEPLOY_PATH/stopdb.sh

# 启动 MongoDB
echo "启动 MongoDB..."
$DEPLOY_PATH/startdb.sh
sleep 3

# 验证 MongoDB 运行状态
if pgrep -f "mongod.*27027" > /dev/null; then
    echo "✓ MongoDB 已成功启动在端口 27027"
else
    echo "✗ MongoDB 启动失败，请检查日志: $DEPLOY_PATH/log/mongod.log"
fi

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
    if [ -d "\$DEPLOY_PATH" ]; then
        echo "备份旧版本..."
        mv \$DEPLOY_PATH \${DEPLOY_PATH}_backup_\$(date +%Y%m%d_%H%M%S)
    fi
    # 解压新版本
    echo "解压新版本..."
    mkdir -p \$DEPLOY_PATH
    cd /tmp
    tar -xzf nlsw-deploy.tar.gz
    mv nlsw-deploy/* \$DEPLOY_PATH/
    rm -rf nlsw-deploy nlsw-deploy.tar.gz
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

# 安装后端依赖（如果部署后端或首次部署）
if [ "\$DEPLOY_BACKEND" = "y" ] || [ "\$FIRST_DEPLOY" = "y" ] || [ "\$BACKUP" = "y" ]; then
    echo "安装后端依赖..."
    cd \$DEPLOY_PATH
    npm install --production
fi

# 更新 PM2 配置中的路径
sed -i "s|/home/ubuntu/nlsw2|\$DEPLOY_PATH|g" \$DEPLOY_PATH/deploy/ecosystem.config.js 2>/dev/null || true

# 复制PM2配置
cp \$DEPLOY_PATH/deploy/ecosystem.config.js \$DEPLOY_PATH/ 2>/dev/null || true

# 确保 MongoDB 运行中
echo "检查 MongoDB..."
if ! pgrep -f "mongod.*27027" > /dev/null; then
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
