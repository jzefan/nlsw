---
title: "feat: Juntie 客户独立部署 + 回执图片 MinIO 存储支持"
type: feat
status: active
date: 2026-03-25
---

# Juntie 客户独立部署 + 回执图片 MinIO 存储支持

## Overview

为 juntie 客户独立部署一套系统，包括：导入旧数据（已有本地备份）做本地测试、启用 `ENABLE_SELF_VEHICLE=true`、将数据库中大量回执图片迁移到 MinIO，同时支持 MinIO 和固定目录两种存储方式（租户级别配置 + 环境变量提供 MinIO 连接信息）。

## Problem Statement

1. **新客户部署**：juntie 需要独立服务器部署，配置与现有客户不同（自有车管理）
2. **数据隔离**：本地已有另一客户数据，导入 juntie 数据时不能混淆
3. **回执图片迁移**：juntie 的旧数据中回执图片存储在 MongoDB 二进制字段中，需要迁移到外部存储
4. **存储方式扩展**：当前仅支持本地目录存储，需要增加 MinIO 支持

## Proposed Solution

### Phase 1: 本地数据导入与测试

**目标**：将 juntie 备份数据导入本地 MongoDB，作为独立租户运行测试。

**步骤**：

1. **创建 juntie 租户**
   - 使用 `scripts/create-test-tenant.js` 为参考，创建 juntie 租户（code: `JUNTIE`）
   - 或直接使用 `scripts/import-local-db.sh` 导入时自动创建

2. **导入备份数据**
   ```bash
   # 使用现有脚本，指定 juntie 备份文件
   bash scripts/import-local-db.sh -f /path/to/juntie-backup.tar.gz -m fresh
   ```
   - `fresh` 模式会创建新租户，不影响现有 DEFAULT 租户数据
   - 所有 business collections 会自动注入 `tenantId`

3. **配置本地环境测试**
   ```env
   DEPLOY_MODE=saas
   ENABLE_SELF_VEHICLE=true   # juntie 需要自有车管理
   ```

4. **验证数据隔离**
   - 平台用户切换到 juntie 租户，确认数据独立
   - 确认 DEFAULT 租户数据未被影响

**关键文件**：
- `scripts/import-local-db.sh` — 已有导入脚本
- `scripts/import-and-inject-tenant.js` — 已有 tenant 注入逻辑
- `scripts/migrate-to-tenant.js` — 租户迁移逻辑

### Phase 2: 回执图片存储抽象层（优先实施）

**目标**：支持两种存储后端（本地目录 / MinIO），**租户级别配置**决定使用哪种方式，环境变量提供 MinIO 连接信息。

#### 2.1 配置设计

**租户级别**（`Tenant.settings`）— 决定存储方式：
```javascript
// models/Tenant.js settings 增加
receiptStorage: { type: String, enum: ['local', 'minio'], default: 'local' }
```

**环境变量**（`.env`）— 提供 MinIO 连接信息：
```env
# MinIO 连接配置（有租户选择 minio 存储时必须配置）
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=receipts
```

**前端**：在租户设置页（`/settings/tenant`）增加存储方式选择。

#### 2.2 存储抽象层

新建 `utils/receipt-storage.js`：

```javascript
// 统一接口，根据租户配置自动选择后端
module.exports = {
  async saveFile(tenantId, filename, buffer, mimetype) → { path }
  async getFile(path) → { buffer, mimetype }
  async deleteFile(path) → void
  getStorageType(tenant) → 'local' | 'minio'
}
```

- **local 模式**：复用现有 `uploads/receipts/{tenantId}/...` 逻辑
- **minio 模式**：上传到 `{bucket}/{tenantId}/...`，返回对象路径

#### 2.3 修改上传处理

**文件**：`controllers/api/vessel_settle.js`

当前流程：multer → 本地文件 → ReceiptImage 记录
改造后：multer → 临时文件 → 查询租户配置 → 存储抽象层（local/minio）→ ReceiptImage 记录

`ReceiptImage.file_path` 字段：
- local 模式：`uploads/receipts/{tenantId}/2026/03/25/filename.jpg`
- minio 模式：`minio://{tenantId}/2026/03/25/filename.jpg`（前缀区分）

#### 2.4 修改下载处理

根据 `file_path` 前缀判断存储类型（**读取时不依赖租户配置**，保证历史数据兼容）：
- `minio://` 开头 → MinIO 读取
- 其他 → 本地文件读取

### Phase 3: 回执图片迁移（MongoDB → MinIO/本地）

**目标**：将 juntie 旧数据中 MongoDB 二进制格式的回执图片迁移到 MinIO 或本地目录。

**基础**：已有 `scripts/migrate-receipt-imgs-to-fs.js` 脚本（MongoDB binary → 本地文件）

**改造**：
- 增加 `--storage` 参数支持：`local`（默认，保持原有行为）或 `minio`
- MinIO 模式下上传到 MinIO bucket，`ReceiptImage.file_path` 记录为 `minio://...`

```bash
# 迁移到本地目录（保持原有行为）
node scripts/migrate-receipt-imgs-to-fs.js --tenant JUNTIE

# 迁移到 MinIO
node scripts/migrate-receipt-imgs-to-fs.js --tenant JUNTIE --storage minio
```

### Phase 4: 新服务器部署

**目标**：在新服务器上独立部署 juntie 实例。

1. **服务器初始化**
   ```bash
   bash deploy/server-init.sh
   bash deploy/setup-database.sh
   ```

2. **配置 .env**
   ```env
   DEPLOY_MODE=standalone       # juntie 独立部署
   STANDALONE_COMPANY=骏铁物流
   ENABLE_SELF_VEHICLE=true
   # MinIO 连接信息（租户设置中选择 minio 时需要）
   MINIO_ENDPOINT=...
   MINIO_PORT=9000
   MINIO_ACCESS_KEY=...
   MINIO_SECRET_KEY=...
   MINIO_BUCKET=receipts
   ```

3. **部署应用**
   ```bash
   # 在 deploy/deploy.sh 中添加 juntie 服务器配置
   bash deploy/deploy.sh
   ```

4. **导入生产数据并迁移回执图片**
   ```bash
   node scripts/migrate-to-tenant.js
   node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT --storage minio
   ```

## Acceptance Criteria

### Phase 1: 数据导入
- [ ] juntie 备份数据导入本地成功，作为独立租户存在
- [ ] 现有 DEFAULT 租户数据完整无损
- [ ] ENABLE_SELF_VEHICLE=true 功能正常
- [ ] 两个租户可以在平台用户下切换查看

### Phase 2: 存储抽象层
- [ ] Tenant.settings 增加 receiptStorage 字段（local/minio）
- [ ] 租户设置页可配置存储方式
- [ ] `utils/receipt-storage.js` 实现 local/minio 两种后端
- [ ] 租户配置为 local 时行为与当前完全一致
- [ ] 租户配置为 minio 时上传到 MinIO、下载从 MinIO 读取
- [ ] 下载时按 file_path 前缀判断（不依赖租户配置，兼容历史数据）
- [ ] 上传/下载/删除三个操作均支持两种后端

### Phase 3: 回执图片迁移
- [ ] `migrate-receipt-imgs-to-fs.js` 支持 `--storage minio` 参数
- [ ] 迁移后图片在系统中正常显示和下载
- [ ] 迁移脚本幂等（重复运行不重复迁移）

### Phase 4: 部署
- [ ] deploy.sh 增加 juntie 服务器配置
- [ ] 新服务器部署成功，数据完整
- [ ] 回执图片迁移到目标存储并可正常访问

## Dependencies & Risks

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| juntie 旧数据格式与当前 schema 不兼容 | 导入失败 | 导入前用 `--dry-run` 检查 |
| 回执图片数量大，迁移耗时 | 服务中断 | 支持断点续传（幂等设计） |
| MinIO 配置错误 | 上传失败 | `RECEIPT_STORAGE=local` 作为安全回退 |
| ENABLE_SELF_VEHICLE 影响现有客户 | 数据展示异常 | 此为部署级别配置，互不影响 |

## Implementation Order

1. **Phase 2（存储抽象层 + MinIO 支持）** → 先实现代码，无数据风险
   - 2.1 Tenant Model + 租户设置页增加 receiptStorage 配置
   - 2.2 新建 `utils/receipt-storage.js` 抽象层
   - 2.3-2.4 改造上传/下载处理
2. **Phase 3（迁移脚本改造）** → 依赖 Phase 2 的存储抽象层
3. **Phase 1（数据导入测试）** → 验证整体流程
4. **Phase 4（部署）** → 最后上线

## File Changes Summary

| 文件 | 操作 | 说明 |
|------|------|------|
| `utils/receipt-storage.js` | 新建 | 存储抽象层 |
| `config/multer.js` | 修改 | 集成存储抽象层 |
| `models/Tenant.js` | 修改 | settings 增加 receiptStorage 字段 |
| `front_end/src/pages/settings/tenant.vue` | 修改 | 增加存储方式配置 |
| `config/secrets.js` | 修改 | 增加 MinIO 配置读取 |
| `.env.example` | 修改 | 增加 MINIO_* 变量 |
| `controllers/api/vessel_settle.js` | 修改 | 上传/下载使用存储抽象层 |
| `scripts/migrate-receipt-imgs-to-fs.js` | 修改 | 增加 --storage minio 支持 |
| `deploy/deploy.sh` | 修改 | 增加 juntie 服务器配置 |
| `package.json` | 修改 | 增加 `minio` 依赖 |
