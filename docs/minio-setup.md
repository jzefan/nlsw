# MinIO 回执图片存储配置指南

## 概述

系统支持两种回执图片存储方式，在**租户设置**中切换：

- **本地目录**（默认）：图片保存在服务器 `uploads/receipts/` 目录
- **MinIO 对象存储**：图片上传到 MinIO 服务，适合大量图片、分布式部署、备份容灾

切换存储方式后，历史图片仍可正常访问（系统根据文件路径前缀自动判断读取方式）。

## 1. 安装 MinIO

### Docker 方式（推荐）

```bash
docker run -d \
  --name minio \
  --restart always \
  -p 9000:9000 \
  -p 9001:9001 \
  -v /data/minio:/data \
  -e MINIO_ROOT_USER=minioadmin \
  -e MINIO_ROOT_PASSWORD=minioadmin123 \
  minio/minio server /data --console-address ":9001"
```

- 9000：API 端口（应用连接用）
- 9001：Web 管理控制台
- `/data/minio`：数据持久化目录，按需修改

### 二进制方式

```bash
# Linux amd64
wget https://dl.min.io/server/minio/release/linux-amd64/minio
chmod +x minio
./minio server /data/minio --console-address ":9001"
```

### 验证安装

浏览器打开 `http://服务器IP:9001`，用上面设置的 `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` 登录。

## 2. 配置应用

在服务器 `.env` 文件中添加：

```env
MINIO_ENDPOINT=localhost       # MinIO 服务地址（不含 http://）
MINIO_PORT=9000                # API 端口
MINIO_USE_SSL=false            # 是否使用 HTTPS
MINIO_ACCESS_KEY=minioadmin    # 访问密钥（即 MINIO_ROOT_USER）
MINIO_SECRET_KEY=minioadmin123 # 秘密密钥（即 MINIO_ROOT_PASSWORD）
MINIO_BUCKET=receipts          # 存储桶名称（自动创建）
```

> 如果 MinIO 部署在其他服务器上，将 `MINIO_ENDPOINT` 改为对应 IP 或域名。

## 3. 启用 MinIO 存储

1. 以 **owner** 或 **平台管理员** 身份登录系统
2. 进入 **设置 → 租户设置**
3. 将"回执图片存储方式"从"本地目录存储"切换为"MinIO 对象存储"
4. 点击"保存设置"

之后上传的回执图片将保存到 MinIO。已有的本地图片不受影响，仍可正常查看。

## 4. 迁移历史图片到 MinIO

### 从本地目录迁移

如果之前的图片存储在本地目录，可以使用迁移脚本：

```bash
# 预览（不执行）
node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT --storage minio --dry-run

# 执行迁移
node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT --storage minio
```

### 从 MongoDB 二进制数据迁移

旧版本系统将图片存储在 MongoDB `receiptimgs` 集合中：

```bash
# 迁移到 MinIO
node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT --storage minio

# 迁移到本地目录（默认行为）
node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT
```

## 5. 生产环境建议

### 安全配置

```bash
# 创建专用访问密钥（不使用 root 账号）
# 在 MinIO 控制台 → Access Keys → Create Access Key
# 将生成的 key 填入 .env
```

### 数据备份

```bash
# 安装 mc 客户端
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc

# 配置连接
./mc alias set nlsw http://localhost:9000 minioadmin minioadmin123

# 备份整个 bucket
./mc mirror nlsw/receipts /backup/minio-receipts/

# 定时备份（crontab）
# 0 2 * * * /usr/local/bin/mc mirror nlsw/receipts /backup/minio-receipts/ >> /var/log/minio-backup.log 2>&1
```

### 磁盘空间监控

```bash
# 查看 bucket 使用量
./mc du nlsw/receipts

# 查看服务器磁盘信息
./mc admin info nlsw
```

### HTTPS 配置

如果 MinIO 配了 HTTPS（通过 nginx 反向代理或 MinIO 自带 TLS）：

```env
MINIO_USE_SSL=true
```

## 6. 故障排除

| 问题 | 排查 |
|------|------|
| 上传失败：MinIO 未配置 | 检查 `.env` 中 `MINIO_ACCESS_KEY` 和 `MINIO_SECRET_KEY` 是否填写 |
| 连接超时 | 检查 `MINIO_ENDPOINT` 和 `MINIO_PORT` 是否正确，防火墙是否开放端口 |
| 图片显示正常但上传到本地 | 检查租户设置中"回执图片存储方式"是否已切换为 MinIO |
| 历史图片无法显示 | 本地图片文件是否仍在 `uploads/receipts/` 目录中 |
| bucket 不存在 | 系统会自动创建，检查 MinIO 访问密钥是否有创建 bucket 权限 |

## 7. 存储路径格式

| 存储方式 | file_path 格式 | 示例 |
|---------|---------------|------|
| 本地 | 绝对路径 | `/app/uploads/receipts/abc123/2026/03/25/inv_001.jpg` |
| MinIO | `minio://` 前缀 | `minio://abc123/2026/03/25/inv_001.jpg` |

系统读取图片时根据路径前缀自动选择读取方式，无需额外配置。
