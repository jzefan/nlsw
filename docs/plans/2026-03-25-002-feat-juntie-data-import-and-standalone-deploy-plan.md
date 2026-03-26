---
title: "feat: Juntie 数据导入与独立部署"
type: feat
status: active
date: 2026-03-25
origin: docs/plans/2026-03-25-001-feat-juntie-deployment-and-receipt-storage-plan.md
---

# Juntie 数据导入与独立部署

## Overview

将 juntie 客户的备份数据导入本地作为独立租户测试，同时在 deploy.sh 中增加 juntie 服务器配置，支持 standalone 模式独立部署。

## Proposed Solution

### Step 1: 本地导入 juntie 数据（作为新租户测试）

使用已有的 `scripts/import-local-db.sh` 脚本：

```bash
# 导入 juntie 备份，创建新租户（不影响现有 DEFAULT 租户）
bash scripts/import-local-db.sh -f <JUNTIE_BACKUP_FILE> -m fresh
```

`fresh` 模式的行为（已有脚本逻辑）：
1. 解压备份到临时目录
2. 创建新租户（tenantCode 从备份目录名推导）
3. 用 `mongorestore` 导入各 collection
4. 调用 `import-and-inject-tenant.js` 为所有记录注入 `tenantId`
5. 创建 owner 用户

**注意**：当前 `ENABLE_SELF_VEHICLE` 是部署级别的环境变量。juntie 需要 `ENABLE_SELF_VEHICLE=true`，而现有客户是 `false`。本地测试时需要改 `.env` 中此值为 `true`，会影响所有租户的展示。

> 如果需要两个租户同时使用不同的 ENABLE_SELF_VEHICLE 配置，后续需要将此配置迁移到租户级别（`Tenant.settings`）。当前阶段不做此改动。

### Step 2: 本地测试验证

- [ ] 以平台用户登录，切换到 juntie 租户
- [ ] 验证运单、提单、车辆、结算等核心数据完整
- [ ] 验证 ENABLE_SELF_VEHICLE=true 下的自有车管理功能
- [ ] 验证回执图片（如有）是否需要迁移

### Step 3: deploy.sh 增加 juntie 服务器配置

**文件**：`deploy/deploy.sh`

在现有服务器列表中增加 juntie：

```bash
# 服务器列表
servers=(
  "lianren:1.13.249.95:联润"
  "xht:218.244.152.142:新华通"
  "juntie:<IP>:骏铁"
)
```

juntie 部署配置：
```env
DEPLOY_MODE=standalone
STANDALONE_COMPANY=骏铁物流
ENABLE_SELF_VEHICLE=true
ENABLE_PUBLIC_BASKET=true
```

### Step 4: 首次部署流程

```bash
# 1. 选择 juntie 服务器
bash deploy/deploy.sh
# → 选择 juntie
# → 选择 full（首次全量部署）

# 2. 服务器初始化（首次）
# deploy.sh 会自动调用 server-init.sh + setup-database.sh

# 3. 导入生产数据
# SSH 到服务器后执行：
node scripts/migrate-to-tenant.js       # 创建 DEFAULT 租户
# 然后导入备份数据

# 4. 迁移回执图片（如需要 MinIO）
node scripts/migrate-receipt-imgs-to-fs.js --tenant DEFAULT
```

## Acceptance Criteria

- [ ] juntie 备份数据导入本地成功，作为独立租户
- [ ] 现有 DEFAULT 租户数据不受影响
- [ ] ENABLE_SELF_VEHICLE=true 功能正常
- [ ] deploy.sh 包含 juntie 服务器配置
- [ ] standalone 模式部署成功（新服务器）
- [ ] 回执图片可正常查看

## Dependencies

- juntie 备份文件（待提供路径）
- juntie 服务器 IP 和 SSH 凭据（待提供）
- (see origin: `docs/plans/2026-03-25-001-feat-juntie-deployment-and-receipt-storage-plan.md`)

## Sources

- **Origin document:** [Phase 1 & 4 of juntie deployment plan](docs/plans/2026-03-25-001-feat-juntie-deployment-and-receipt-storage-plan.md)
- Import script: `scripts/import-local-db.sh`
- Tenant injection: `scripts/import-and-inject-tenant.js`
- Deploy script: `deploy/deploy.sh`
- Server init: `deploy/server-init.sh`, `deploy/setup-database.sh`
