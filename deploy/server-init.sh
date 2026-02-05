#!/bin/bash
# 服务器初始化脚本 - Ubuntu 22.04
# 已预装: Node.js v22.22, MongoDB 8.2.4

set -e

# 设置 Node.js 路径
export PATH="$HOME/sw/node-v22.22/bin:$PATH"

echo "======================================"
echo "  服务器环境初始化脚本"
echo "  Ubuntu 22.04"
echo "  Node.js v22.22 (已安装)"
echo "  MongoDB 8.2.4 (已安装)"
echo "======================================"

# 检查Node.js
echo ""
echo "[1/4] 检查Node.js..."
if command -v node &> /dev/null; then
    echo "✓ Node.js: $(node -v)"
else
    echo "✗ 错误: Node.js 未安装或路径不正确"
    echo "  请确认 Node.js 安装在 ~/sw/node-v22.22/"
    exit 1
fi

# 检查MongoDB
echo ""
echo "[2/4] 检查MongoDB..."
if command -v mongod &> /dev/null; then
    echo "✓ MongoDB 已安装"
    # 检查MongoDB是否运行
    if systemctl is-active --quiet mongod; then
        echo "✓ MongoDB 服务运行中"
        # 获取端口
        MONGO_PORT=$(grep -E "^\s*port:" /etc/mongod.conf | awk '{print $2}' || echo "27027")
        echo "  端口: $MONGO_PORT"
    else
        echo "! MongoDB 服务未运行，正在启动..."
        sudo systemctl start mongod
        echo "✓ MongoDB 已启动"
    fi
else
    echo "✗ 错误: MongoDB 未安装"
    exit 1
fi

# 安装PM2和serve
echo ""
echo "[3/4] 安装PM2和serve..."
if command -v pm2 &> /dev/null; then
    echo "✓ PM2 已安装: $(pm2 -v)"
else
    npm install -g pm2
    pm2 startup systemd -u $USER --hp $HOME
    echo "✓ PM2 安装完成"
fi

if command -v serve &> /dev/null; then
    echo "✓ serve 已安装"
else
    npm install -g serve
    echo "✓ serve 安装完成"
fi

# 安装Nginx
echo ""
echo "[4/4] 安装Nginx..."
if command -v nginx &> /dev/null; then
    echo "✓ Nginx 已安装: $(nginx -v 2>&1)"
else
    sudo apt-get update -y
    sudo apt-get install -y nginx
    sudo systemctl enable nginx
    sudo systemctl start nginx
    echo "✓ Nginx 安装完成"
fi

# 创建应用目录
echo ""
echo "创建应用目录..."
mkdir -p /home/ubuntu/nlsw2/logs
sudo mkdir -p /var/log/nginx
echo "✓ 目录已创建"

# 配置防火墙
echo ""
echo "配置防火墙..."
if command -v ufw &> /dev/null; then
    sudo ufw allow 80/tcp 2>/dev/null || true
    sudo ufw allow 22/tcp 2>/dev/null || true
    echo "✓ 防火墙已配置 (80, 22 端口)"
fi

# 环境检查总结
echo ""
echo "======================================"
echo "  环境检查完成"
echo "======================================"
echo "Node.js:  $(node -v)"
echo "npm:      $(npm -v)"
echo "PM2:      $(pm2 -v 2>/dev/null || echo '未安装')"
echo "serve:    $(serve -v 2>/dev/null || echo '未安装')"
echo "Nginx:    $(nginx -v 2>&1 | cut -d'/' -f2)"
echo "MongoDB:  $(mongod --version | head -1 | awk '{print $3}')"
echo ""
echo "======================================"
echo "  初始化完成!"
echo ""
echo "  下一步: 在本地执行"
echo "  ./deploy/deploy.sh"
echo "======================================"
