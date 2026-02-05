# NLSW 项目部署指南

## 服务器信息

- **公网IP**: 1.13.249.95
- **操作系统**: Ubuntu 22.04
- **Node.js**: v22.22 (已预装)
- **MongoDB**: 8.2.4 (已预装，端口 27027)

## 服务架构

```
                    ┌─────────────────┐
                    │    Internet     │
                    └────────┬────────┘
                             │
                             ▼ :80
                    ┌─────────────────┐
                    │     Nginx       │
                    │  (反向代理)      │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
           ▼ /               ▼ /api            │
   ┌───────────────┐  ┌───────────────┐        │
   │   Frontend    │  │   Backend     │        │
   │  (serve:3000) │  │ (node:1080)   │        │
   │   静态文件     │  │   Express     │        │
   └───────────────┘  └───────┬───────┘        │
                              │                │
                              ▼ :27027         │
                      ┌───────────────┐        │
                      │   MongoDB     │        │
                      └───────────────┘        │
```

## 端口使用

| 服务 | 端口 | 说明 |
|------|------|------|
| Nginx | 80 | 公网入口，反向代理 |
| Frontend | 3000 | 前端静态资源服务 |
| Backend | 1080 | 后端API服务 |
| MongoDB | 27027 | 数据库 |

## 首次部署步骤

### 步骤1: 配置SSH免密登录（可选）

在本地机器执行：

```bash
# 生成SSH密钥（如果没有）
ssh-keygen -t rsa -b 4096

# 复制公钥到服务器
ssh-copy-id ubuntu@1.13.249.95
```

### 步骤2: 服务器环境初始化

首次部署需要在服务器上安装必要的软件：

```bash
# 登录服务器
ssh ubuntu@1.13.249.95

# 下载初始化脚本（或手动复制）
# 执行初始化
chmod +x server-init.sh
./server-init.sh
```

MongoDB 已预装（8.2.4），确保配置正确：

```bash
# 检查MongoDB端口配置
grep -E "port:" /etc/mongod.conf

# 如需修改端口为27027
sed -i 's/port: 27017/port: 27027/' /etc/mongod.conf

# 重启MongoDB
systemctl restart mongod

# 验证连接
mongosh --port 27027
```

### 步骤3: 本地执行部署

在本地项目根目录执行：

```bash
# 添加执行权限
chmod +x deploy/deploy.sh

# 执行部署
./deploy/deploy.sh
```

部署脚本会自动：
1. 构建前端项目
2. 打包项目文件
3. 上传到服务器
4. 安装依赖
5. 启动服务
6. 配置Nginx

## 日常更新部署

代码更新后，直接执行部署脚本：

```bash
./deploy/deploy.sh
```

## 手动部署步骤

如果自动部署脚本出现问题，可以手动执行：

### 1. 本地构建前端

```bash
cd front_end
pnpm install
pnpm build
```

### 2. 上传文件到服务器

```bash
# 打包
tar -czf nlsw.tar.gz app.js config controllers models routes.js routes_api.js package.json front_end/dist deploy

# 上传
scp nlsw.tar.gz ubuntu@1.13.249.95:/tmp/
```

### 3. 服务器上解压和配置

```bash
ssh ubuntu@1.13.249.95

# 解压
cd /home/app
tar -xzf /tmp/nlsw.tar.gz -C nlsw

# 安装依赖
cd nlsw
npm install --production

# 启动后端
pm2 start ecosystem.config.js

# 启动前端
pm2 start "serve -s front_end/dist -l 3000" --name nlsw-frontend
pm2 save

# 配置Nginx
cp deploy/nginx.conf /etc/nginx/conf.d/nlsw.conf
nginx -t && nginx -s reload
```

## 运维命令

### PM2 进程管理

```bash
# 查看所有进程
pm2 list

# 查看日志
pm2 logs nlsw-backend
pm2 logs nlsw-frontend

# 重启服务
pm2 restart nlsw-backend
pm2 restart nlsw-frontend

# 停止服务
pm2 stop nlsw-backend

# 监控
pm2 monit
```

### Nginx 管理

```bash
# 测试配置
nginx -t

# 重载配置
nginx -s reload

# 查看访问日志
tail -f /var/log/nginx/nlsw_access.log

# 查看错误日志
tail -f /var/log/nginx/nlsw_error.log
```

### MongoDB 管理

```bash
# 连接数据库
mongosh --port 27027

# 查看数据库
show dbs

# 使用数据库
use test

# 查看集合
show collections
```

## 故障排查

### 1. 前端无法访问

```bash
# 检查前端服务是否运行
pm2 list

# 检查3000端口
netstat -tlnp | grep 3000

# 查看前端日志
pm2 logs nlsw-frontend
```

### 2. API请求失败

```bash
# 检查后端服务
pm2 list

# 检查1080端口
netstat -tlnp | grep 1080

# 查看后端日志
pm2 logs nlsw-backend

# 测试API
curl http://localhost:1080/api/health
```

### 3. 数据库连接失败

```bash
# 检查MongoDB状态
systemctl status mongod

# 检查27027端口
netstat -tlnp | grep 27027

# 查看MongoDB日志
tail -f /var/log/mongodb/mongod.log
```

### 4. Nginx配置问题

```bash
# 测试配置语法
nginx -t

# 查看Nginx状态
systemctl status nginx

# 查看错误日志
tail -f /var/log/nginx/nlsw_error.log
```

## 备份与恢复

### 数据库备份

```bash
# 备份
mongodump --port 27027 --out /backup/mongo_$(date +%Y%m%d)

# 恢复
mongorestore --port 27027 /backup/mongo_20240101
```

### 应用备份

每次部署时，旧版本会自动备份到 `/home/ubuntu/nlsw2_backup_*` 目录。

## 环境变量说明

### 后端环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| NODE_ENV | production | 运行环境 |
| PORT | 1080 | 监听端口 |
| MONGODB | mongodb://localhost:27027/test | 数据库连接 |

### 前端环境变量

| 变量 | 值 | 说明 |
|------|-----|------|
| VITE_SERVER_API_URL | http://1.13.249.95 | API服务器地址 |
| VITE_SERVER_API_PREFIX | /api | API路径前缀 |
| VITE_SERVER_API_TIMEOUT | 30000 | 请求超时时间(ms) |

## 安全建议

1. **更改默认端口**: 考虑更改MongoDB和后端服务的默认端口
2. **配置防火墙**: 只开放80端口，内部服务端口不对外
3. **设置MongoDB认证**: 在生产环境启用数据库认证
4. **定期备份**: 配置定时任务自动备份数据库
5. **监控告警**: 配置服务监控和告警通知
