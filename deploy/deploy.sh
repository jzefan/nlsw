#!/bin/bash
# 部署脚本
# 在本地执行，用于打包并上传到服务器

set -e

# 配置
SERVER_IP="47.113.231.131"
SERVER_USER="root"
DEPLOY_PATH="/home/app/nlsw"

echo "======================================"
echo "  NLSW 项目部署脚本"
echo "======================================"

# 1. 构建前端
echo ""
echo "[1/5] 构建前端项目..."
cd "$(dirname "$0")/../front_end"
pnpm install
pnpm build
echo "前端构建完成!"

# 2. 打包项目
echo ""
echo "[2/5] 打包项目文件..."
cd "$(dirname "$0")/.."

# 创建临时目录
rm -rf /tmp/nlsw-deploy
mkdir -p /tmp/nlsw-deploy

# 复制后端文件
cp -r app.js config controllers models routes.js routes_api.js package.json package-lock.json /tmp/nlsw-deploy/

# 复制前端构建产物
mkdir -p /tmp/nlsw-deploy/front_end
cp -r front_end/dist /tmp/nlsw-deploy/front_end/

# 复制部署配置
cp -r deploy /tmp/nlsw-deploy/

# 打包
cd /tmp
tar -czf nlsw-deploy.tar.gz nlsw-deploy
echo "打包完成: /tmp/nlsw-deploy.tar.gz"

# 3. 上传到服务器
echo ""
echo "[3/5] 上传到服务器..."
scp /tmp/nlsw-deploy.tar.gz ${SERVER_USER}@${SERVER_IP}:/tmp/
echo "上传完成!"

# 4. 在服务器上执行部署
echo ""
echo "[4/5] 在服务器上执行部署..."
ssh ${SERVER_USER}@${SERVER_IP} << 'ENDSSH'
set -e

DEPLOY_PATH="/home/app/nlsw"

# 备份旧版本
if [ -d "$DEPLOY_PATH" ]; then
    echo "备份旧版本..."
    mv $DEPLOY_PATH ${DEPLOY_PATH}_backup_$(date +%Y%m%d_%H%M%S)
fi

# 解压新版本
echo "解压新版本..."
mkdir -p $DEPLOY_PATH
cd /tmp
tar -xzf nlsw-deploy.tar.gz
mv nlsw-deploy/* $DEPLOY_PATH/
rm -rf nlsw-deploy nlsw-deploy.tar.gz

# 创建日志目录
mkdir -p $DEPLOY_PATH/logs

# 安装后端依赖
echo "安装后端依赖..."
cd $DEPLOY_PATH
npm install --production

# 复制PM2配置
cp $DEPLOY_PATH/deploy/ecosystem.config.js $DEPLOY_PATH/

# 重启后端服务
echo "重启后端服务..."
pm2 delete nlsw-backend 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

# 启动前端服务（使用serve）
echo "重启前端服务..."
pm2 delete nlsw-frontend 2>/dev/null || true
pm2 start "serve -s front_end/dist -l 3000" --name nlsw-frontend
pm2 save

# 复制并重载Nginx配置
echo "配置Nginx..."
cp $DEPLOY_PATH/deploy/nginx.conf /etc/nginx/conf.d/nlsw.conf
nginx -t && nginx -s reload

echo "部署完成!"
ENDSSH

# 5. 清理本地临时文件
echo ""
echo "[5/5] 清理临时文件..."
rm -rf /tmp/nlsw-deploy /tmp/nlsw-deploy.tar.gz

echo ""
echo "======================================"
echo "  部署成功!"
echo "  访问地址: http://${SERVER_IP}"
echo "======================================"
