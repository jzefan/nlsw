# Migration Scripts

## 脚本列表

### 1. migrate-to-tenant.js
**用途：** MongoDB 3.6 → 8.2 迁移脚本，为所有集合注入 tenantId

**使用场景：** 初次从旧系统迁移到新系统时使用（仅运行一次）

**前置条件：**
- 已完成 `mongodump` 和 `mongorestore`
- 已删除 sessions 集合
- **必须**在启动应用之前运行

**用法：**
```bash
# 预览（不修改数据）
node scripts/migrate-to-tenant.js --dry-run

# 执行迁移
node scripts/migrate-to-tenant.js
```

**功能：**
1. 创建/查找 DEFAULT 租户
2. 迁移用户（设置 tenantId、tenantCode、role）
3. 迁移 14 个业务集合（注入 tenantId）
4. 验证所有文档都有 tenantId

**特性：**
- ✓ 幂等性（可安全重复运行）
- ✓ 使用原生 MongoDB 驱动（避免触发 Mongoose hooks）
- ✓ 自动提升 admin 用户为 owner
- ✓ 详细的验证和报告

---

### 2. import-and-inject-tenant.js
**用途：** 从备份导入指定集合并自动注入 DEFAULT 租户的 tenantId

**使用场景：**
- 需要从旧系统备份导入单个或多个集合
- 导入测试数据
- 恢复特定集合

**前置条件：**
- 备份目录存在（默认：`data/backup/test-db_20260228/test/`）
- DEFAULT 租户已存在（已运行过 migrate-to-tenant.js 或应用已启动）
- `mongorestore` 命令在 PATH 中

**🔒 重要：数据保护模式**

脚本默认使用 **MERGE 模式**（安全），保留现有数据：
- ✅ 根据 `_id` 进行 upsert（更新已存在的文档，插入新文档）
- ✅ **不会删除**现有数据
- ✅ 适合大多数场景

只有明确使用 `--drop` 标志时才会删除数据（危险）：
- ⚠️ 先删除整个集合，再导入
- ⚠️ **所有现有数据会丢失**
- ⚠️ 有 10 秒确认倒计时

**用法：**
```bash
# 查看可用集合列表
node scripts/import-and-inject-tenant.js

# 推荐：先预览
node scripts/import-and-inject-tenant.js --dry-run bills

# 安全导入（MERGE 模式，保留现有数据）- 推荐
node scripts/import-and-inject-tenant.js bills
node scripts/import-and-inject-tenant.js bills invoices vehicles

# 危险：删除后导入（DROP 模式）- 慎用！
node scripts/import-and-inject-tenant.js --drop bills

# 指定自定义备份目录
node scripts/import-and-inject-tenant.js --dir=/backup/nldb_20260301/test bills

# 导入所有业务集合（MERGE 模式）
node scripts/import-and-inject-tenant.js bills brands companies destinations \
  drayageforklifts invoices orderplans receiptimgs saledeps settles \
  vehicles vesselcosts warehouses
```

**参数：**
- `--dry-run` - 预览模式，不修改数据（推荐先运行）
- `--dir=<path>` - 指定自定义备份目录
- `--drop` - ⚠️ 删除现有数据后导入（危险！慎用！）

**功能（对每个集合）：**
1. 验证备份文件存在
2. 使用 `mongorestore --drop` 导入集合（会删除现有数据）
3. 自动注入 DEFAULT 租户的 tenantId 到所有导入的文档
4. 验证所有文档都有 tenantId
5. 输出详细报告

**特性：**
- ✅ **默认 MERGE 模式** - 保留现有数据（安全）
- ✅ 支持批量导入多个集合
- ✅ 自动获取 DEFAULT 租户 ID
- ✅ 导入前验证备份文件
- ✅ 导入后自动验证数据完整性
- ✅ 支持 `--dry-run` 预览模式
- ✅ 支持自定义备份目录（`--dir`）
- ✅ 防命令注入（参数转义）
- ✅ 密码脱敏（错误日志中不显示密码）
- ✅ 集合名验证（防路径遍历）
- ✅ DROP 模式有 10 秒确认倒计时

**两种导入模式：**

| 模式 | 标志 | 行为 | 安全性 | 适用场景 |
|------|------|------|--------|----------|
| **MERGE** | 默认 | 根据 _id upsert，保留现有数据 | ✅ 安全 | 大多数场景 |
| **DROP** | `--drop` | 先删除整个集合，再导入 | ⚠️ 危险 | 完全替换数据 |

**注意事项：**
- ✅ **推荐**：默认使用 MERGE 模式（不加 `--drop` 标志）
- ⚠️ DROP 模式会**永久删除**所有现有数据（有 10 秒确认）
- ⚠️ 不要导入 `sessions` 集合（会话数据应重新生成）
- ⚠️ 导入 `users` 集合时小心（可能覆盖现有用户账号）

---

### 3. create-test-tenant.js
**用途：** 创建 12 小时过期的测试租户

**用法：**
```bash
node scripts/create-test-tenant.js
```

**输出：**
- 租户代码：TEST12H
- 用户名：test12h
- 密码：123456
- 12 小时后自动过期

---

### 4. sync-phone-field.js
**用途：** 同步用户的 phone 字段（从 profile.phone 到顶层 phone）

**用法：**
```bash
node scripts/sync-phone-field.js
```

---

### 5. create-bill-indexes.js
**用途：** 为 bills 集合创建优化的索引（基于旧系统索引，包含 tenantId）

**使用场景：**
- 初次从旧系统迁移后，创建性能优化索引
- 数据库查询性能优化
- 支持多租户查询性能

**前置条件：**
- 已完成数据迁移（migrate-to-tenant.js）
- bills 集合已存在

**用法：**
```bash
# 直接运行（会自动跳过已存在的索引）
node scripts/create-bill-indexes.js
```

**功能：**
1. 检查当前索引
2. 创建以下优化索引（所有索引都以 tenantId 为第一字段）：
   - 租户内唯一索引（tenantId + order + bill_no）
   - 开单名称查询索引
   - 订单号、提单号查询索引
   - 创建日期排序索引
   - 状态筛选索引
   - 多个复合索引（开单名称+日期+剩余块数+状态等）
3. 验证索引创建结果
4. 输出最终索引列表

**特性：**
- ✓ 幂等性（可安全重复运行）
- ✓ 后台创建（background: true），不阻塞数据库
- ✓ 自动跳过已存在的索引
- ✓ 详细的创建报告

**为什么需要这些索引：**
- **租户隔离性能**：所有索引以 tenantId 开头，确保多租户查询高效
- **开单名称搜索**：支持快速搜索开单名称（getBillingNames）
- **配发货查询**：billing_name + left_num 索引优化配发货列表
- **状态筛选**：支持按状态快速筛选提单

---

### 6. create-invoice-indexes.js
**用途：** 为 invoices 集合创建优化的索引（基于旧系统索引，包含 tenantId）

**使用场景：**
- 初次从旧系统迁移后，创建性能优化索引
- 运单查询性能优化
- 车船结算查询优化

**前置条件：**
- 已完成数据迁移（migrate-to-tenant.js）
- invoices 集合已存在

**用法：**
```bash
# 直接运行（会自动跳过已存在的索引）
node scripts/create-invoice-indexes.js
```

**功能：**
1. 检查当前索引
2. 创建以下优化索引（所有索引都以 tenantId 为第一字段）：
   - 租户内运单号唯一索引（tenantId + waybill_no）**UNIQUE**
   - 状态、发货名称、发货日期查询索引
   - 车船结算相关复合索引
   - 自有车标志索引
   - 发货单位筛选索引
3. 验证索引创建结果
4. 输出最终索引列表

**特性：**
- ✓ 幂等性（可安全重复运行）
- ✓ 后台创建（background: true），不阻塞数据库
- ✓ 自动跳过已存在的索引
- ✓ 支持嵌套字段索引（bills.vehicles.veh_name）

**重要索引说明：**
- **运单号唯一性**：`{tenantId: 1, waybill_no: 1}` 确保租户内运单号不重复
- **车船结算查询**：优化车船结算页面的复杂筛选条件
- **嵌套数组索引**：`bills.vehicles.veh_name` 支持按车辆名称查询

---

### 7. create-basic-indexes.js
**用途：** 为基础数据集合创建索引（vehicles, destinations, brands, companies, saledeps, warehouses）

**使用场景：**
- 初次从旧系统迁移后，创建基础数据集合的索引
- 优化车船、目的地、开单名称等下拉列表查询性能

**前置条件：**
- 已完成数据迁移

**用法：**
```bash
node scripts/create-basic-indexes.js
```

**功能：**
为以下集合创建优化索引：
1. **vehicles** (车船)
   - `{tenantId, name}` - 唯一索引
   - `{tenantId, veh_type}` - 车/船类型筛选
   - `{tenantId, veh_category}` - 自有/外挂筛选

2. **destinations** (目的地)
   - `{tenantId, name}` - 唯一索引

3. **brands** (牌号)
   - `{tenantId, name}` - 唯一索引

4. **companies** (公司/开单名称)
   - `{tenantId, name}` - 唯一索引

5. **saledeps** (销售部门)
   - `{tenantId, name}` - 唯一索引

6. **warehouses** (仓库)
   - `{tenantId, name}` - 唯一索引

**特性：**
- ✓ 幂等性（可安全重复运行）
- ✓ 后台创建
- ✓ 自动跳过已存在的索引
- ✓ 支持租户内名称唯一约束

---

### 8. create-all-indexes.js
**用途：** 一次性为所有集合创建索引（批量执行）

**使用场景：**
- 初次从旧系统迁移后，快速创建所有索引
- 重建索引

**用法：**
```bash
# 一次性创建所有索引
node scripts/create-all-indexes.js
```

**功能：**
- 依次执行 `create-bill-indexes.js` 和 `create-invoice-indexes.js`
- 显示每个脚本的执行结果
- 输出总体执行摘要

**特性：**
- ✓ 自动按顺序执行所有索引脚本
- ✓ 详细的执行日志
- ✓ 错误时自动退出

---

## 常见使用场景

### 场景 1：初次迁移旧系统数据
```bash
# 1. 在旧服务器上备份
mongodump --host <旧主机> --port <旧端口> --db nldb --out /backup/nldb_$(date +%Y%m%d)

# 2. 在新服务器上导入
mongorestore --host localhost --port 27027 --db nldb_saas \
  --username nlsw2026 --password HiNlsw2026. \
  --authenticationDatabase nldb_saas \
  --noIndexRestore --drop /backup/nldb_20260228/nldb/

# 3. 删除旧会话
mongo nldb_saas --eval "db.sessions.drop()"

# 4. 运行迁移脚本（注入 tenantId）
node scripts/migrate-to-tenant.js --dry-run  # 预览
node scripts/migrate-to-tenant.js             # 执行

# 5. 启动应用
node app.js
```

### 场景 2：导入部分集合（测试数据）
```bash
# 导入几个测试集合
node scripts/import-and-inject-tenant.js bills invoices vehicles
```

### 场景 3：恢复单个集合
```bash
# 只恢复 brands 集合
node scripts/import-and-inject-tenant.js brands
```

### 场景 4：创建索引（迁移后必须执行）
```bash
# 推荐：一次性创建所有索引
node scripts/create-all-indexes.js

# 或者分别创建
node scripts/create-bill-indexes.js
node scripts/create-invoice-indexes.js
```

**为什么必须创建索引？**
- ✅ 大幅提升查询性能（10-100倍）
- ✅ 解决查询超时问题
- ✅ 支持多租户高效隔离
- ✅ 优化开单名称、车船结算等关键查询

---

## 故障排查

### 问题：mongorestore 命令未找到
**解决：** 安装 MongoDB Database Tools
```bash
# macOS
brew install mongodb/brew/mongodb-database-tools

# Linux
# 从官网下载：https://www.mongodb.com/try/download/database-tools
```

### 问题：DEFAULT 租户不存在
**解决：** 先运行迁移脚本或启动一次应用
```bash
node scripts/migrate-to-tenant.js
# 或
node app.js  # 会自动创建 DEFAULT 租户
```

### 问题：备份目录找不到
**解决：** 检查路径是否正确
```bash
ls -la data/backup/test-db_20260228/test/
```

---

## 安全提示

1. ⚠️  生产环境操作前务必备份
2. ⚠️  先用 `--dry-run` 预览变更
3. ⚠️  导入脚本使用 `--drop`，会删除现有数据
4. ⚠️  不要在生产环境导入测试数据
