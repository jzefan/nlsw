# NLSW SaaS 物流管理系统 — 功能清单

> 自动生成于 2026-03-05，基于源码分析

---

## 目录

- [1. 系统概述](#1-系统概述)
- [2. 技术架构](#2-技术架构)
- [3. 多租户与权限体系](#3-多租户与权限体系)
- [4. 功能模块详解](#4-功能模块详解)
  - [4.1 仪表盘 (Dashboard)](#41-仪表盘-dashboard)
  - [4.2 订单计划管理](#42-订单计划管理)
  - [4.3 提单管理](#43-提单管理)
  - [4.4 运单管理（配发货）](#44-运单管理配发货)
  - [4.5 结算管理](#45-结算管理)
  - [4.6 开票管理](#46-开票管理)
  - [4.7 回款管理](#47-回款管理)
  - [4.8 车船结算](#48-车船结算)
  - [4.9 报表与统计](#49-报表与统计)
  - [4.10 数据处理](#410-数据处理)
  - [4.11 基础数据管理（数据字典）](#411-基础数据管理数据字典)
  - [4.12 系统设置](#412-系统设置)
  - [4.13 平台管理（SaaS 运营）](#413-平台管理saas-运营)
- [5. 数据模型总览](#5-数据模型总览)
- [6. API 路由总览](#6-api-路由总览)
- [7. 定时任务](#7-定时任务)

---

## 1. 系统概述

NLSW SaaS 是一套面向钢材物流行业的全流程管理系统，覆盖从客户订单→提单→配发货→运输→结算→开票→回款的完整业务链。

### 核心业务流程

```
订单计划 → 提单(开单) → 运单(配发货) → 客户结算 → 开票 → 回款
                              ↓
                         车船结算 → 车船付款
```

### 部署模式

| 模式 | 说明 |
|------|------|
| `saas` | 多租户模式，平台管理员管理多个公司账户 |
| `standalone` | 单机模式，一个公司独立部署 |

---

## 2. 技术架构

### 后端

| 组件 | 技术 |
|------|------|
| 运行时 | Node.js >= 18 |
| 框架 | Express 4.x |
| 数据库 | MongoDB（Mongoose 8.x） |
| 认证 | Passport.js（本地策略）+ express-session + MongoStore |
| 文件上传 | multer（磁盘存储） |
| 定时任务 | node-schedule |
| 密码加密 | bcryptjs + RSA（前端加密传输） |

### 前端

| 组件 | 技术 |
|------|------|
| 框架 | Vue 3 + TypeScript |
| 构建 | Vite 7 |
| 状态管理 | Pinia 3 + pinia-plugin-persistedstate |
| 路由 | Vue Router 4 + unplugin-vue-router（文件路由） |
| UI 组件 | Shadcn-vue + Reka UI + Tailwind CSS 4 |
| 图标 | lucide-vue-next |
| 表格 | TanStack Vue Table |
| Excel | exceljs + xlsx |
| 表单验证 | VeeValidate + Zod |
| HTTP | Axios |

### 部署

| 组件 | 配置 |
|------|------|
| 进程管理 | PM2（ecosystem.config.js） |
| 反向代理 | Nginx（前端 :3000，后端 :1080） |
| 部署方式 | 裸金属 + deploy.sh 脚本（scp + ssh） |

---

## 3. 多租户与权限体系

### 3.1 用户角色

| 角色 | 说明 | tenantId |
|------|------|----------|
| `platform` | 平台管理员，管理所有租户 | 无（跨租户） |
| `owner` | 租户管理员（公司负责人） | 有 |
| `member` | 普通成员 | 有 |

### 3.2 权限列表

用户权限以数组形式存储在 `User.privilege` 字段。

| 权限标识 | 说明 | 控制范围 |
|----------|------|----------|
| `admin` | 管理员 | 拥有所有权限，可管理用户和基础数据 |
| `operator` | 业务操作 | 订单计划、提单、运单的创建和管理 |
| `account` | 会计 | 结算、开票、回款、车船结算 |
| `statistics` | 统计 | 财务报表（运输价格、短驳叉车、车船固定费用） |
| `custRevenue` | 客户营业额 | 查看客户营业额报表 |
| `vesselRevenue` | 车船营业额 | 查看车船营业额报表 |
| `selfVehicle` | 自有车管理 | 自有车运单和结算功能 |
| `seePrice` | 查看价格 | 在综合查询和车船结算中看到价格信息 |

### 3.3 租户隔离机制（三层防御）

1. **中间件层** — `tenantContext` 中间件在每个请求上设置 `req.tenantId`，验证租户状态和有效期
2. **AsyncLocalStorage** — 通过 `tenantStore` 在异步调用链中传播租户上下文
3. **Mongoose 全局插件** — 自动为所有带 `tenantId` 的 Schema 注入租户过滤条件（查询/聚合/更新/删除）

### 3.4 路由守卫

| 中间件 | 作用 |
|--------|------|
| `requireTenant` | 要求请求必须有租户上下文（平台用户放行） |
| `requirePlatformUser` | 仅允许平台管理员 |
| `requireOwnerOrPlatform` | 仅允许租户管理员或平台管理员 |

---

## 4. 功能模块详解

### 4.1 仪表盘 (Dashboard)

**路径**: `/dashboard`
**权限**: 所有登录用户
**页面**: `pages/dashboard/index.vue`

| 功能 | 说明 |
|------|------|
| KPI 概览卡片 | 总吨数、未结算吨数（客户/车船）、已开票/已回款金额、开单单位数 |
| 月度趋势图 | 按月统计发运吨数折线图 |
| Top 8 开单名称 | 按发运量排名的前8个客户（柱状图） |
| Top 5 车船号 | 按发运量排名的前5个运输工具（饼图） |
| 车船明细表 | 全部车船按自有/外挂、车/船分类的发运量统计 |

---

### 4.2 订单计划管理

**路径**: `/plans`
**权限**: `operator`
**后端控制器**: `controllers/api/order_plan.js`
**数据模型**: `OrderPlan`

| 功能 | 说明 | API |
|------|------|-----|
| 创建计划 | 批量导入 Excel 或手动输入，含订单号/重量/目的地/收货人/运输方式 | `POST /plans` |
| 计划列表 | 筛选（订单号/客户/运输方式/状态/日期），显示总重/已发/未发统计 | `GET /plans` |
| 编辑计划 | 修改重量、目的地、合同号等（校验：新重量 ≥ 已发重量） | `POST /plans/update` |
| 删除计划 | 仅可删除未发运的计划 | `POST /plans/delete` |
| 结案/反结案 | 关闭已完成的计划，或重新打开 | `POST /plans/close`, `/plans/unclose` |
| 存在性检查 | 配发货时检查订单计划是否存在 | `GET /plans/check` |

---

### 4.3 提单管理

**路径**: `/bills`
**权限**: `operator`
**后端控制器**: `controllers/api/bill.js`
**数据模型**: `Bill`

| 功能 | 说明 | API |
|------|------|-----|
| 批量创建 | 录入/导入提单：单号、订单号、开单名称、牌号、规格、仓库、合同号等 | `POST /bills` |
| 提单列表 | 多条件筛选（单号/订单号/客户/牌号/合同/状态/日期），分页 | `GET /bills` |
| 高级搜索 | 可视化查询树构建（AND/OR 逻辑，支持等于/包含/大于/小于等运算） | `POST /bills/search` |
| 单条编辑 | 修改开单名称、牌号、仓库等字段 | `POST /bills/update` |
| 批量编辑 | 批量修改单号、客户、牌号、合同号、销售部门、仓库、规格类型 | `POST /bills/update` |
| 删除提单 | 批量删除 | `POST /bills/delete` |
| 导出 | 按搜索条件导出为 CSV | `POST /bills/export` |
| 按订单查看 | 按订单号分组查看有剩余数量的提单 | `GET /bills/orders` |

**提单状态流转**: `新建` → `待配发` → `部分配发` → `已配发` → `已结算` → `已开票` → `已回款`

**结算标记位（settle_flag）**: 3-bit 位掩码
- bit 0 (0x1): 客户已结算
- bit 1 (0x2): 代收代付已结算
- bit 2 (0x4): 车船已结算

---

### 4.4 运单管理（配发货）

**路径**: `/invoices`
**权限**: `operator`
**后端控制器**: `controllers/api/invoice.js`
**数据模型**: `Invoice`, `Bill`, `OrderPlan`, `Vehicle`

#### 4.4.1 车运配发（create-truck）

| 功能 | 说明 |
|------|------|
| 选择客户 | 按开单名称搜索，加载该客户下有剩余数量的提单 |
| 分配数量 | 为每条提单分配发运数量/重量到指定车辆 |
| 生成运单 | 创建运单号（自动递增），扣减提单剩余数量，更新订单计划已发重量 |
| 自有车模式 | 通过 `?selfOwned=true` 路由参数切换自有车模式 |

#### 4.4.2 船运配发（create-ship）

| 功能 | 说明 |
|------|------|
| 多车装船 | 一条船运运单下可包含多辆车（内部运单号 = 主运单号 + 后缀） |
| 车辆分配 | 每辆车分别分配提单数量/重量 |
| 内部结算 | 通过 `inner_settle` 数组分别追踪每辆内部车辆的结算状态 |

#### 4.4.3 运单删除

| 功能 | 说明 | API |
|------|------|-----|
| 删除运单 | 删除运单并回滚：恢复提单剩余数量、恢复订单计划已发重量 | `POST /delete_invoice` |

---

### 4.5 结算管理

**路径**: `/settle/bill`
**权限**: `account`
**后端控制器**: `controllers/api/settle.js`
**数据模型**: `Bill`, `Invoice`, `Settle`

| 功能 | 说明 | API |
|------|------|-----|
| 待结算列表 | 查看已配发但未结算的提单-运单对，筛选条件丰富 | `GET /settle/bills` |
| 价格输入 | 单条或批量输入客户价格（单价/包价模式） | `POST /settle/price_input` |
| 结算篮 | 购物车式 UX，暂存选中的结算项，确认后批量结算 | — |
| 执行结算 | 生成结算流水号（JS+日期+序号），创建 Settle 记录，更新提单结算标记 | `POST /settle/settle_bill` |
| 标记不需要结算 | 将价格设为 -1，标记提单为不需要结算 | `POST /settle/not_require_settle` |
| 导出 | 导出为 Excel | — |

**结算类型**: `客户结算`（自提/送货）、`代收代付结算`

---

### 4.6 开票管理

**路径**: `/settle/ticket`
**权限**: `account`
**后端控制器**: `controllers/api/ticket.js`
**数据模型**: `Settle`, `Bill`, `Invoice`

| 功能 | 说明 | API |
|------|------|-----|
| 已结算列表 | 查看可开票的结算记录 | `GET /ticket/settles` |
| 开票 | 录入票号/开票日期/开票人，更新状态为「已开票」 | `POST /ticket/update` |
| 取消开票 | 撤回开票状态 | `POST /ticket/update` |
| 删除结算 | 删除「已结算」状态的记录，回滚提单和运单的结算标记 | `POST /ticket/delete` |
| 查看明细 | 按结算流水号查看结算明细（关联的提单信息） | `GET /ticket/detail` |

---

### 4.7 回款管理

**路径**: `/settle/money`
**权限**: `account`
**后端控制器**: `controllers/api/money.js`
**数据模型**: `Settle`

| 功能 | 说明 | API |
|------|------|-----|
| 已开票列表 | 查看可回款的记录 | `GET /money/list` |
| 标记回款 | 设置回款日期/回款人，状态更新为「已回款」 | `POST /money/update` |
| 取消回款 | 撤回回款状态 | `POST /money/update` |
| 更新实际到款 | 修改实际收到的金额（real_price） | `POST /money/real-price` |

---

### 4.8 车船结算

**路径**: `/settle/vessel`
**权限**: `account`
**后端控制器**: `controllers/api/vessel_settle.js`
**数据模型**: `Invoice`, `Vehicle`, `ReceiptImage`

| 功能 | 说明 | API |
|------|------|-----|
| 运单列表 | 聚合查询（Invoice + Bill），支持按车船号/客户/目的地/日期/状态/回执/金额筛选，上限 5000 条 | `GET /get_invoice_settle_vellel` |
| 单条价格输入 | 设置单条运单或内部车辆的运费单价 | `POST /settle_vessel_price` |
| 批量价格输入 | 批量设置价格（相同车船号 + 目的地） | `POST /settle_vessel_price` |
| 结算/取消结算 | 批量结算或取消结算，更新 `vessel_settle_state` 和 `vessel_settle_date` | `POST /settle_vessel` |
| 付款/取消付款 | 标记已付款，录入票号 | `POST /settle_vessel_pay` |
| 标记不需要结算 | 设置价格为 -1 | `POST /settle_vessel_not_needed` |
| 卸船/滞留信息 | 录入卸船日期、滞留天数（自动计算：卸船日期 - 发货日期 - 7 天）、预付现金/油卡 | `POST /settle_vessel_delay_info` |
| 批量预付设置 | 批量设置预付信息 | `POST /settle_vessel_delay_info` |
| 回执状态切换 | 独立切换回执状态（与图片解耦） | `POST /toggle-vessel-receipt` |
| 上传回执图片 | 支持多图上传（最多 9 张，每张 ≤ 5MB），自动设置回执状态 | `POST /upload-receipt-img` |
| 查看回执图片 | 网格预览、放大、缩放（滚轮）、下载、打印（单张/全部） | `GET /get-receipt-images-list`, `/get-receipt-image-by-id` |
| 上传更多（查看中） | 在查看对话框中可追加上传图片 | `POST /upload-receipt-img` |
| 删除回执图片 | 删除单张图片（不影响回执状态） | `DELETE /delete-receipt-image` |
| 承运单位选择 | 对于有多个承运人的车辆，可选择实际承运人 | `POST /post-carrier-department` |
| 列配置 | 可自定义显示/隐藏列（状态/车船号/承运单位/开单名称/目的地/价格/块数/重量/日期/运单号/票号） | — |
| 打印结算单 | 打印功能 | — |
| 导出 Excel | 导出当前查询结果 | — |

---

### 4.9 报表与统计

#### 4.9.1 综合查询

**路径**: `/reports/integrated`
**权限**: 所有登录用户
**后端**: `controllers/api/report.js` → `getIntegratedQuery`

两种查询模式：
- **运单优先模式**（invoice-first）：从运单出发，关联提单
- **提单优先模式**（bill-first，默认）：从运单聚合，$lookup 提单

筛选：日期/目的地/始发地/车船号/运输方式（自有/外挂）/开单名称/单号/订单号。无 `seePrice` 权限时隐藏价格字段。支持分页和全量导出。

#### 4.9.2 运单报表

**路径**: `/reports/invoice`
**权限**: 所有登录用户
**后端**: `controllers/api/report.js` → `getInvoiceReport`

按运单维度展示，每条运单显示：客户价格、车船价格、净收入。支持明细钻取和打印。

#### 4.9.3 运输价格报表

**路径**: `/reports/shipping-charge`
**权限**: `statistics` 或 `account`

按客户/车船/目的地/日期筛选，显示运单价格明细。

#### 4.9.4 客户营业额

**路径**: `/reports/customer-revenue`
**权限**: `custRevenue`
**后端**: `controllers/api/statistics.js`

| 功能 | 说明 | API |
|------|------|-----|
| 月度柱状图 | 代收 vs 自提 金额月度对比 | `GET /statistics/customer/chart` |
| 客户统计表 | 按客户分组的已结算/未结算重量和金额 | `GET /statistics/customer/data` |
| 明细钻取 | 点击客户展开到提单-运单级别 | `GET /statistics/customer/detail` |

#### 4.9.5 车船营业额

**路径**: `/reports/vessel-revenue`
**权限**: `vesselRevenue`
**后端**: `controllers/api/vessel-statistics.js`

| 功能 | 说明 | API |
|------|------|-----|
| 月度统计 | 车运/船运 × 自有/外挂的发运量/收入/预付/利润 | `GET /statistics/vessel/revenue` |
| 固定费用整合 | 自动扣减车船固定费用和短驳叉车费 | — |
| 柱状图 | 月度利润可视化 | — |
| 明细钻取 | 按车辆查看配发明细（重量/运费/预付） | `GET /statistics/vessel/detail` |

#### 4.9.6 短驳叉车应收款

**路径**: `/reports/drayage-forklift`
**权限**: `statistics` 或 `account`
**后端**: `controllers/api/drayage_forklift.js`
**数据模型**: `DrayageForklift`

按月录入短驳费和叉车费，CRUD + 导出。

#### 4.9.7 车船固定费用

**路径**: `/reports/vessel-fixed-cost`
**权限**: `statistics` 或 `account`
**后端**: `controllers/api/vessel_fixed_cost.js`
**数据模型**: `VesselCost`

按车/船 × 月份录入固定费用：保险(ic)、房租(hc)、包干费(pcc)、辅料(aux)、配件(fittings)、维修(repair)、年检(annual_survey)、工资(salary)、油费(oil)、路桥费(toll)、罚款(fine)、其他(other)、合计(total)。

---

### 4.10 数据处理

**路径**: `/data-process`
**权限**: 所有登录用户
**后端**: `controllers/api/data_process.js`
**数据模型**: `ShipmentDetail`

| 功能 | 产品类型 | 说明 |
|------|----------|------|
| 圆钢数据处理 | `round-steel` | 上传 Excel → 解析 → 编辑（捆号/订单号/规格/重量/牌号/客户/车号/合同号）→ 按装车单分组 → 保存 |
| 板材数据处理 | `plate` | 上传 Excel → 解析 → 编辑 → 保存（同上） |
| 批次管理 | — | 查看已保存批次列表（批次ID/日期/行数/总重/装车单号/车号） |

---

### 4.11 基础数据管理（数据字典）

**路径**: `/data/*`
**权限**: `admin`
**后端**: 各对应 controller

| 字典 | 路径 | 模型 | 字段 |
|------|------|------|------|
| 车船号 | `/data/vehicles` | `Vehicle` | 名称、类型(车/船)、类别(自有/外挂)、联系人、电话、承运单位(boss) |
| 发货单位 | `/data/companies` | `Company` | 名称、关联客户、联系人、电话、地址 |
| 仓库 | `/data/warehouses` | `Warehouse` | 名称、联系人、电话、地址 |
| 目的地 | `/data/destinations` | `Destination` | 名称、联系人、电话、地址 |
| 牌号 | `/data/brands` | `Brand` | 名称 |
| 销售部门 | `/data/sale-deps` | `SaleDep` | 名称 |

所有字典均支持：拼音首字母搜索（5 分钟缓存）、分页、CRUD。

---

### 4.12 系统设置

| 路径 | 功能 | 权限 |
|------|------|------|
| `/settings/account` | 修改密码 | 所有用户 |
| `/settings/appearance` | 主题设置（深色/浅色/跟随系统、颜色方案、圆角大小） | 所有用户 |
| `/admin/users` | 用户管理（新增/修改/删除用户、重置密码、分配权限） | `admin` 或 `owner` 或 `platform` |

---

### 4.13 平台管理（SaaS 运营）

**路径**: `/platform/*`
**权限**: `platform` 角色
**后端**: `controllers/api/platform.js`, `controllers/api/order.js`, `controllers/api/payment-qr.js`

#### 4.13.1 租户管理

| 功能 | 说明 | API |
|------|------|-----|
| 租户列表 | 查看所有租户，含用户数和最后活跃时间 | `GET /platform/tenants` |
| 创建租户 | 创建公司账户 + 管理员账号（默认密码 123456） | `POST /platform/tenants` |
| 编辑租户 | 修改公司名称/联系人/套餐/用户上限 | `POST /platform/tenants/update` |
| 删除租户 | 软删除（status=deleted），禁用所有关联用户 | `POST /platform/tenants/delete` |
| 启用/停用 | 切换租户 active/suspended 状态 | `POST /platform/tenants/status` |
| 查看用户 | 查看指定租户下所有用户 | `GET /platform/tenants/:tenantId/users` |
| 重置密码 | 将任意用户密码重置为 123456 | `POST /platform/users/reset-password` |

#### 4.13.2 订单管理

| 功能 | 说明 | API |
|------|------|-----|
| 订单列表 | 查看所有订阅订单 | `GET /platform/orders` |
| 创建订单 | 为租户创建订阅（套餐/金额/起止日期/付款方式） | `POST /platform/orders` |
| 编辑/删除订单 | 修改或删除订单，自动同步租户到期日 | `POST /platform/orders/update`, `/delete` |
| 收款二维码 | 上传/查看付款二维码图片 | `POST /platform/payment-qr`, `GET /payment-qr` |

#### 4.13.3 业务查看

| 功能 | 说明 |
|------|------|
| 提单浏览 | 选择租户后查看其提单数据（只读） |
| 运单浏览 | 选择租户后查看其运单数据（只读） |

#### 4.13.4 平台统计

| 指标 | 说明 |
|------|------|
| 租户数 | 活跃/停用数量 |
| 用户总数 | 全平台用户数 |
| 提单/运单总数 | 全平台数据量 |
| 租户分布 | 每个租户的提单/运单/用户数明细 |

---

## 5. 数据模型总览

| 模型 | 集合名 | 核心用途 | 租户隔离 |
|------|--------|----------|----------|
| `Tenant` | tenants | 租户（公司）信息 | 无（自身就是租户） |
| `User` | users | 用户账号 | tenantId |
| `Bill` | bills | 提单/开单信息 | tenantId |
| `Invoice` | invoices | 运单/配发信息 | tenantId |
| `OrderPlan` | orderplans | 订单计划 | tenantId |
| `Settle` | settles | 结算记录 | tenantId |
| `Vehicle` | vehicles | 车船基础数据 | tenantId |
| `Company` | companies | 发货单位字典 | tenantId |
| `Warehouse` | warehouses | 仓库字典 | tenantId |
| `Destination` | destinations | 目的地字典 | tenantId |
| `Brand` | brands | 牌号字典 | tenantId |
| `SaleDep` | saledeps | 销售部门字典 | tenantId |
| `VesselCost` | vesselcosts | 车船固定费用 | tenantId |
| `DrayageForklift` | drayageforklifts | 短驳叉车费用 | tenantId |
| `ShipmentDetail` | shipmentdetails | 发运明细（数据处理） | tenantId |
| `ReceiptImage` | receiptimages | 回执图片 | tenantId |
| `Order` | orders | SaaS 订阅订单 | tenantId |

---

## 6. API 路由总览

### 公开路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/deploy-info` | 部署模式信息 |
| GET | `/public-key` | RSA 公钥（密码加密传输） |
| GET | `/payment-qr` | 收款二维码 |

### 认证路由

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/login` | 登录 |
| GET | `/logout` | 退出 |
| GET | `/me` | 当前用户信息 |

### 业务路由（requireTenant）

| 模块 | 路由前缀 | 端点数 |
|------|----------|--------|
| 提单管理 | `/bills` | 8 |
| 运单管理 | `/invoices`, `/build_*_invoice`, `/delete_invoice` | 6 |
| 订单计划 | `/plans` | 8 |
| 客户结算 | `/settle/*` | 5 |
| 车船结算 | `/settle_vessel*`, `/get_invoice_settle*`, `/toggle-vessel-receipt`, `/upload-receipt-img`, 等 | 15 |
| 开票管理 | `/ticket/*` | 4 |
| 回款管理 | `/money/*` | 3 |
| 综合查询/报表 | `/report/*` | 2 |
| 统计 | `/statistics/*` | 7 |
| 车船固定费用 | `/vessel_fixed_costs` | 4 |
| 短驳叉车 | `/drayage_forklifts` | 4 |
| 数据处理 | `/data-process/*` | 3 |
| 基础数据 | `/companies`, `/destinations`, `/brands`, `/sale_deps`, `/warehouses`, `/vehicles` | 7 |
| 用户管理 | `/users`, `/user_mgr`, `/resetPwd` | 4 |

### 平台管理路由（requirePlatformUser）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/platform/tenants` | 租户 CRUD |
| POST | `/platform/tenants/update` | 更新租户 |
| POST | `/platform/tenants/delete` | 删除租户 |
| POST | `/platform/tenants/status` | 启停租户 |
| GET | `/platform/tenants/:id/users` | 租户用户列表 |
| GET | `/platform/tenants/:id/bills` | 租户提单 |
| GET | `/platform/tenants/:id/invoices` | 租户运单 |
| POST | `/platform/users/reset-password` | 重置密码 |
| GET | `/platform/statistics` | 平台统计 |
| GET/POST | `/platform/orders` | 订单 CRUD |
| POST | `/platform/payment-qr` | 上传二维码 |

---

## 7. 定时任务

| 时间 | 任务 | 说明 |
|------|------|------|
| 每日 16:28 | 归档回执图片 | 将 6 个月前的 `Receipt` 记录移至 `ArchivedReceiptImg` |
| 每日 03:00 | 自动停用过期租户 | 仅 SaaS 模式：检查 `expireDate`，过期的自动设为 `suspended` |
