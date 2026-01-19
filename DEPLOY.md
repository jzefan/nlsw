# 旧系统部署指南 (Legacy System Deployment Guide)

本指南介绍如何部署基于 Node.js, Express, MongoDB 和 Jade 模板的旧版物流管理系统。

## 1. 环境准备 (Prerequisites)

服务器需要安装以下软件：

*   **Node.js**: 建议版本 v14.x 或 v16.x (由于项目较老，可能不兼容最新的 Node v18+，需测试)。
*   **MongoDB**: 数据库服务 (如 v4.x 或 v5.x)。
*   **PM2**: 用于生产环境的 Node.js 进程管理工具。
*   **Nginx** (可选但推荐): 作为反向代理服务器。

## 2. 部署步骤 (Steps)

### 步骤 1: 获取代码
将代码上传至服务器目录，例如 `/var/www/nlsw`。

### 步骤 2: 安装依赖
在项目根目录下运行：
```bash
npm install --production
```
*注意：如果遇到 node-gyp 编译错误，可能需要安装 build-essential (Linux) 或 windows-build-tools (Windows)。*

### 3. 配置环境 (Configuration)

配置位于 `config/secrets.js`。建议通过环境变量来覆盖默认值，而不要直接修改文件。

创建一个启动脚本或 `.env` 文件 (如果使用了 dotenv，但本项目直接读取 process.env)，或者在 PM2 配置中设置环境变量。

关键环境变量：
*   `MONGODB`: MongoDB 连接字符串 (例如 `mongodb://localhost:27017/nlsw_prod`)
*   `PORT`: 服务端口 (默认为 1080)
*   `SESSION_SECRET`: Session 密钥 (生产环境务必修改)
*   `COMPANY_NAME`: 公司名称 (例如 "军铁物流")

### 4. 使用 PM2 启动 (Process Management)

建议使用 PM2 来管理应用，以实现后台运行和自动重启。

**安装 PM2:**
```bash
npm install -g pm2
```

**启动应用:**
```bash
# 基本启动
PORT=3000 NODE_ENV=production pm2 start app.js --name "nlsw-backend"

# 或者，如果项目有 cluster_app.js 支持多核集群:
PORT=3000 NODE_ENV=production pm2 start cluster_app.js --name "nlsw-backend" -i max
```

**保存 PM2 列表 (开机自启):**
```bash
pm2 save
pm2 startup
```

### 5. Nginx 反向代理 (Reverse Proxy)

配置 Nginx 将 80/443 端口流量转发到本地 Node.js 端口 (如 3000)。

编辑 Nginx 配置 (例如 `/etc/nginx/sites-available/nlsw`):

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 6. 数据备份与恢复

项目包含 MongoDB 相关的脚本：
*   `startdb.sh`: 启动 DB (开发环境)
*   `run.sh`: 启动应用

生产环境建议使用 `mongodump` 定期备份数据。

## 常见问题

*   **图片上传失败**: 检查 `public/upload` 或配置的上传目录是否有写入权限。
*   **Session 失效**: 检查 MongoDB 连接是否稳定，Session 存储在 MongoStore 中。
*   **前端样式丢失**: 确保 `public` 目录下的静态资源可被访问，或者 Nginx 配置了正确的静态文件服务。
