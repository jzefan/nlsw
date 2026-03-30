# NLSW 项目部署说明

## 部署流程

### 1. 主部署脚本 (deploy.sh)

主部署脚本负责：
- 打包和部署应用代码
- 导出和恢复 MongoDB 数据库
- 配置前端和后端服务
- 配置 Nginx

**运行方式:**
```bash
cd deploy
./deploy.sh
```

**首次部署时:**
1. 脚本会询问本地和服务器的 MongoDB 认证信息
2. 自动导出本地数据库 `nldb_saas`（支持认证）
3. 上传到服务器并自动恢复（支持认证）
4. 如果服务器上已存在 `nldb_saas` 数据库，会先备份再恢复
5. 创建基础的 `.env` 配置文件（不包含 MongoDB 认证信息）

**MongoDB 认证配置:**
- **本地 MongoDB**: 需提供端口、用户名、密码、认证数据库（用于导出数据）
- **服务器 MongoDB**: 需提供端口、用户名、密码、认证数据库（用于恢复数据）
- 如果 MongoDB 未启用认证，可选择跳过

**注意事项:**
- 首次部署后，MongoDB 配置为注释状态
- 需要单独配置数据库认证（见下一节）
- 确保本地和服务器的 MongoDB 都已启动并可连接

### 2. 数据库配置脚本 (setup-database.sh)

数据库配置脚本负责：
- 创建 MongoDB 用户
- 配置数据库认证
- 生成数据库配置信息

**在服务器上运行:**
```bash
cd /home/ubuntu/nlsw2/deploy  # 或你的部署路径
./setup-database.sh
```

**脚本会询问:**
- MongoDB 端口（默认：27027）
- MongoDB 用户名（默认：nlsw_user）
- MongoDB 密码（可自动生成）
- MongoDB 数据库名（默认：nldb）

**脚本会:**
1. 检查 MongoDB 是否运行
2. 创建或更新数据库用户
3. 输出需要添加到 `.env` 文件的配置

**运行后:**
将脚本输出的 MongoDB 配置添加到 `/home/ubuntu/nlsw2/.env` 文件中：
```bash
MONGO_HOST=localhost
MONGO_PORT=27027
MONGO_DATABASE=nldb
MONGO_USER=nlsw_user
MONGO_PASSWORD=your_generated_password
MONGO_AUTH_SOURCE=nldb
```

然后重启后端服务：
```bash
pm2 restart nlsw-backend
```

## 部署模式

### Standalone 模式（独立部署）
- 单公司，无平台概念
- 需要指定公司名称（STANDALONE_COMPANY）

### SaaS 模式（多租户）
- 平台管理多个公司
- 支持租户隔离

## 部署类型

1. **全量部署** - 部署前端和后端
2. **仅部署前端** - 只更新前端代码
3. **仅部署后端** - 只更新后端代码

## 文件结构

```
deploy/
├── deploy.sh           # 主部署脚本
├── daily-backup.sh     # 每日备份脚本
├── install-backup-cron.sh # 安装每日备份 cron
├── setup-database.sh   # 数据库配置脚本
├── ecosystem.config.js # PM2 配置文件
├── nginx.conf          # Nginx 配置文件
└── README.md           # 本文档
```

## 每日备份

适用于独立部署服务器，默认备份以下内容：
- MongoDB 数据库（`mongodump --archive --gzip`）
- `uploads/`
- `keys/`
- `.env`

### 1. 手动执行一次

```bash
cd /home/ubuntu/nlsw2
bash deploy/daily-backup.sh /data/backups
```

可选环境变量：

```bash
RETENTION_DAYS=14 \
BACKUP_EXTRA_PATHS=/data/minio:/data/custom \
bash deploy/daily-backup.sh /data/backups
```

- `RETENTION_DAYS`: 保留天数，默认 `14`
- `BACKUP_EXTRA_PATHS`: 额外备份目录，多个路径用 `:` 分隔

### 2. 安装每天 02:00 的定时任务

```bash
cd /home/ubuntu/nlsw2
bash deploy/install-backup-cron.sh /data/backups
```

安装后会写入当前用户的 `crontab`：

```cron
0 2 * * * BACKUP_ROOT=/data/backups RETENTION_DAYS=14 /home/ubuntu/nlsw2/deploy/daily-backup.sh >> /home/ubuntu/nlsw2/logs/daily-backup.log 2>&1
```

## 常见问题

### Q: 首次部署后后端无法启动？
A: 检查 `.env` 文件中的 MongoDB 配置是否正确。运行 `setup-database.sh` 配置数据库认证。

### Q: 如何查看后端日志？
A: 使用 `pm2 logs nlsw-backend`

### Q: 如何更新数据库密码？
A: 运行 `setup-database.sh` 脚本，选择更新密码选项。

### Q: 数据库导出失败，提示认证错误？
A: 检查：
1. MongoDB 是否已启动
2. 用户名、密码是否正确
3. 认证数据库（authenticationDatabase）是否正确，通常是 `admin` 或具体数据库名
4. 用户是否有对应数据库的读取权限

### Q: 数据库恢复失败？
A: 检查：
1. MongoDB 是否正在运行
2. mongorestore 命令是否可用
3. 认证信息是否正确
4. 用户是否有写入权限
5. 查看 `/tmp` 目录下的备份文件

### Q: 如何备份数据库？
A: 使用 mongodump 命令：
```bash
# 无认证
mongodump --db=nldb_saas --out=/path/to/backup

# 有认证
mongodump --db=nldb_saas --out=/path/to/backup \
  --username=your_user --password=your_password \
  --authenticationDatabase=admin
```

## 依赖要求

### 本地环境
- Node.js (v22+)
- MongoDB (带 mongodump/mongorestore 工具)
- pnpm
- sshpass

### 服务器环境
- Node.js (v22+)
- MongoDB (带 mongosh/mongorestore 工具)
- PM2
- Nginx
- serve (用于前端静态文件服务)

## 安全建议

1. 妥善保管 MongoDB 密码
2. 定期备份数据库
3. 使用强密码
4. 限制 MongoDB 访问权限
5. 定期更新依赖包

## 更新说明

### 2026-02-13
- 将数据库配置从主部署脚本分离
- 改用 mongodump/mongorestore 方式迁移数据
- 添加数据库备份功能
- 优化 PM2 和 serve 安装检查
- 添加 systemctl 管理的 MongoDB 检测
