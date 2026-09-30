# 用章（印）申请需求设计

日期：2026-09-26（2026-09-28 按部署架构与功能开关指导第四轮修订并定稿）。状态：**设计已定稿**，待开工，未写代码。

目标：在「我的申请」下新增「用章申请」，字段与线下《用章（印）申请单》对齐，由**印章保管员**（及总经理/董事长等代行人员）集中记录并监督实体章的使用，做到「章被占用时申请不到、提前归还或时段释放时通知候补人、逾期未还时持续占用并分级催办、每枚章的借出与归还都有台账可查」。

已确认决策（2026-09-28 修订）：

| 决策点 | 结论 | 说明 |
| --- | --- | --- |
| 部署与模块开关 | **双轨开关（与考勤同构）** | **独立部署（standalone）**：由 `.env` 中的 `ENABLE_SEAL` 控制；<br>**SaaS 多租户**：由租户设置 `settings.sealEnabled` 控制。未开启公司完全不展示、不响应接口 |
| 章的资源模型 | **每个类别可登记多枚实体章** | 保管员维护，启用时预置每类 1 枚（`公章-1` 等） |
| 保管方式与发章权限 | **集中保管，设专职保管员** | 一般每公司 1 名专职保管员；总经理/董事长/owner/admin 亦有发章与收章权限 |
| 逾期未还规则 | **持续占用，不自动释放** | 逾期未还时名额不释放，直至收章归还；彻底避免“名额已释放但无章可发”的体验断层 |
| 强制归还 | **一期不引入强制归还** | 移除 `force-return` 接口；异常情况由保管员按正常收章并在备注中留痕 |
| 时段冲突判定 | **硬禁止** | 区间并发占用达到在用枚数上限时禁止申请，提供候补入口 |
| 候补触发时机 | **全时段释放事件广播通知** | 收章归还、申请人撤回、审批驳回、新增/启用实体章时均触发候补广播通知；先到先得 |
| 侧栏解耦逻辑 | **普通员工「我的申请」灵活承载** | 若未开考勤但开用章，「我的申请」仅展示用章申请；若均开启，并列 4 项；管理端独立展示「印章管理」 |
| 审批权限与兜底 | **总经理一级审批（单级）** | 审批人取 `attendanceRoles` 含 `general_manager`（及代理人）；**若未开考勤或未配总经理，自动由 owner 兜底审批** |
| 通知渠道 | **站内通知中心** | 消息表 + 顶栏铃铛（挂载于全局 default layout）+ 60 秒轮询 |

其他已确认细节：

| 项 | 结论 |
| --- | --- |
| 预置实体章命名 | 用 `类别名-1`（`公章-1` / `财务专用章-1` / …），不做公司习惯改名 |
| 逾期阈值 | **2 小时**通知部门主管、**24 小时**升级总经理 |
| 报废章约束 | **台账保留可查**（`status='scrapped'`，不参与容量计算、不可再发）；**在借中的章严禁报废或停用** |
| 流水号口径 | **跨年连续、不重置**（租户内一路 `000001` → `000012`…），不带年份前缀，原子自增 |
| 份数定义 | **文件份数**（必填正整数），单次申请对应所选类别的 1 枚实体章 |
| 发章后撤回 | **已发章不可撤回**（只能走保管员归还）；**审批通过但未发章前允许申请人撤回** |

---

## 1. 范围与现状对照

一期形成闭环：提交申请 → **总经理审批（单级，owner 可兜底）** → **保管员发章（指定具体某一枚）** → 使用 → **保管员收章** → 全程记入章使用台账；同时跟踪章占用、候补通知与逾期催办。

> 「审批通过」和「发章」是**两个动作**：审批只表示准予用章，章仍在保管员处；必须由保管员（或总经理/董事长/owner/admin）在系统确认发章，系统才记「已借出」。详见 §3.4。

复用与新增的边界：

| 现有设计 | 本次处理 |
| --- | --- |
| 考勤申请 `AttendanceRequest` + `controllers/api/attendance.js` 的审批动作与代理审批人 | **只复用模式，不复用模型**：用章独立建模；审批链为单级 |
| 租户 `settings.attendanceEnabled`、standalone 下 `ENABLE_ATTENDANCE` | **同构新增**：租户 `settings.sealEnabled`、standalone 下 `ENABLE_SEAL`，默认关闭 |
| `utils/attendance-permissions.js` 中的 `requireAttendanceEnabled` | **同构新增** `utils/seal-permissions.js` 中的 `requireSealEnabled` |
| 审批人与角色依赖 | 优先匹配 `attendanceRoles` 含 `general_manager`（及代理人 `attendanceGeneralManagerDelegateId`）；若租户未开启考勤或无总经理角色，**自动回退为 owner 审批**，避免提单报 409 |
| 发章权限判据 | 集中保管模式：专职保管员（`settings.sealCustodianId`）、owner、admin、以及总经理/董事长（`titleCode` 为 `gm` 或 `ceo`） |
| `models/OrderNumber.js` | **不复用**：流水号另建独立计数器 `SealCounter`（§2.1），带 `$setOnInsert` 租户安全隔离 |
| 站内通知基础设施 | 新建通用 `models/Notice.js`，在全局 `layouts/default.vue` 顶栏增加铃铛入口，未来其他模块可复用 |
| 侧栏菜单与「我的申请」 | 解耦：根据 `features.attendance` 和 `features.seal` 动态组合（见 §9.1） |

---

### 1.1 本次新增的租户设置与环境变量

#### 1. 租户设置字段（`models/Tenant.js:settings`）

| 字段 | 类型 / 默认 | 用途 |
| --- | --- | --- |
| `sealEnabled` | Boolean / `false` | SaaS 模式下租户用章开关。关闭时拒绝 `/seal/*` 业务接口 |
| `sealCustodianId` | ObjectId / `null` | 专职印章保管员用户 ID（集中保管） |
| `sealOverdueRemindMinutes` | Number / `120` | 逾期多久后通知部门主管（默认 2 小时） |
| `sealOverdueEscalateMinutes` | Number / `1440` | 逾期多久后升级通知总经理（默认 24 小时） |

#### 2. Standalone 环境变量与配置（`config/secrets.js`）
* 新增配置项：`enableSeal: process.env.ENABLE_SEAL === 'true'`
* standalone 模式下，直接由 `.env` 的 `ENABLE_SEAL` 判定是否启用用章模块。

前端通过 `GET/POST /seal/settings` 读写专职保管员与逾期阈值，权限为 owner 或 admin。SaaS 下 `sealEnabled` 开关由平台管理在租户详情中统一开通（与 `attendanceEnabled` 一致）。

---

## 2. 字段对齐（单据 → 模型）

| 申请单字段 | 模型字段 | 说明 |
| --- | --- | --- |
| 申请日期 | `createdAt` | 提交时间，系统自动生成 |
| 编号 | `serialNo` | 租户内自增、6 位补零字符串（如 `000008`），跨年连续不重置 |
| 申请人 | `applicantId` + `applicant{employeeNo,name,department,title}` | 提交人快照 |
| 用章部门 | `useDepartment` | 默认带出申请人部门，允许手填修改 |
| 用章时间 | `useAt` | 预约占用区间起点 |
| 预计归还时间 | `expectedReturnAt` | 预约占用区间终点；必须晚于 `useAt` |
| 申请用章类别 | `sealTypes: [String]` | 多选（`official` / `finance` / `contract` / `invoice` / `legal`） |
| 用章文件名称 | `documentName` | 必填 |
| 份数 | `copies` | **文件份数**（必填正整数，单次申请对应所选类别的 1 枚实体章） |
| 用章事由 | `reason` | 必填 |
| 备注 | `remark` | 选填 |
| 经办人 | `operatorId` / `operatorName` | 发章时由实际发章人写入，申请人无需填写 |
| 审批意见 | `approvals[]` | 单级：总经理审批（或 owner 兜底） |
| 实体章分配 | `sealItems: [{ sealItemId, code, sealType }]` | 发章时由保管员指定具体实体章并写入 |
| 发章时间 | `checkedOutAt` | 实际发章出库时间 |
| 归还时间 | `actualReturnAt` | 实际收章入库时间 |

---

### 2.1 流水号获取机制（`SealCounter`）

租户内自增，必须保证原子性与租户隔离：

```javascript
// models/SealCounter.js
// 唯一复合索引: { tenantId: 1 }

const c = await SealCounter.findOneAndUpdate(
  { tenantId },
  { 
    $inc: { next: 1 },
    $setOnInsert: { tenantId } // 配合全局租户插件，确保首次插入时租户字段准确落库
  },
  { upsert: true, new: true, setDefaultsOnInsert: true }
);
const serialNo = String(c.next).padStart(6, '0'); // '000008'
```

重号兜底：`SealRequest` 增加 `{ tenantId: 1, serialNo: 1 }` 唯一复合索引。

---

## 3. 章状态与占用判定

### 3.1 用章类别与实体章（`SealItem`）

类别枚举：
* `official`: 公章
* `finance`: 财务专用章
* `contract`: 合同专用章
* `invoice`: 发票专用章
* `legal`: 法人章

模型字段：
* `tenantId`: 租户 ID
* `sealType`: 所属类别
* `code`: 编号（如 `公章-1`），租户内唯一
* `status`: `active`（在用）/ `disabled`（停用）/ `scrapped`（已报废，台账保留可查）
* `physicalOut`: Boolean，当前实体章是否在借
* `note`: 存放位置或备注

**安全约束**：当 `physicalOut === true`（实体章在借）时，**禁止将该章变更为 `disabled` 或 `scrapped`**，后端强制拦截。

**初始化预置**：
* 当租户首次启用用章功能并首次查询/访问用章数据时，若检测到该租户的 `SealItem` 为 0 条，系统**幂等预置 5 类各 1 枚 `active` 实体章**（编号为 `类别名-1`）。已存在实体章时该步骤直接跳过。

---

### 3.2 占用与库存规则

1. **时段占用（Reservation）**：
   * 状态属于 `['pending', 'approved', 'checked_out', 'overdue']` 的单据均计入占用。
   * **逾期未还持续占用**：当单据状态变为 `overdue` 时，其占用区间终点自动延展为当前时刻（`Math.max(expectedReturnAt, now)`），直至保管员确认收章归还。
   * **彻底消除断层**：避免“系统自动释放占用导致他人能申请，但保管员手上无章可发”的矛盾。

2. **实体在借（Physical Out）**：
   * 发章时设置对应 `SealItem.physicalOut = true`，归还时置 `false`。
   * 工作台直观显示在借状态与借用人信息。

---

### 3.3 容量判定算法（扫描线）

设某类别有 $M$ 枚在用实体章（`status === 'active'`）。
查询区间 $[from, to)$ 是否可用：

```javascript
async function evaluateAvailability(tenantId, sealType, from, to, excludeId = null) {
  const M = await SealItem.countDocuments({ tenantId, sealType, status: 'active' });
  if (M === 0) return { available: false, reason: 'no_active_seal', active: 0, freeNow: 0 };

  const now = new Date();
  // 查找所有与 [from, to) 发生重叠的占用记录
  // 注意：overdue 单据的实际占用截止时间视为 now
  const requests = await SealRequest.find({
    tenantId,
    status: { $in: ['pending', 'approved', 'checked_out', 'overdue'] },
    sealTypes: sealType,
    useAt: { $lt: to },
    _id: { $ne: excludeId }
  }).select('useAt expectedReturnAt status applicant.name');

  const events = [];
  let initialOverlap = 0; // 在 from 刻已处于生效中的存量并发基数

  for (const req of requests) {
    const effectiveEnd = (req.status === 'overdue' && req.expectedReturnAt < now) ? now : req.expectedReturnAt;
    if (effectiveEnd <= from) continue; // 虽在以前开始但在 from 前已结束

    if (req.useAt <= from) {
      initialOverlap += 1;
    } else {
      events.push({ time: req.useAt.getTime(), delta: +1, name: req.applicant.name });
    }

    if (effectiveEnd < to) {
      events.push({ time: effectiveEnd.getTime(), delta: -1, name: req.applicant.name });
    }
  }

  // 排序：时间早的在前；同一时刻先 -1（归还）后 +1（借出），保证半开区间 [from, to) 正确
  events.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.delta - b.delta));

  let current = initialOverlap;
  let maxConcurrent = current;

  for (const ev of events) {
    current += ev.delta;
    if (current > maxConcurrent) maxConcurrent = current;
  }

  const available = maxConcurrent < M;
  return {
    available,
    active: M,
    freeNow: Math.max(0, M - maxConcurrent)
  };
}
```

* 三道校验：前端选择时间后防抖查询预检、提交申请时后端校验、总经理审批通过时最终复检。
* 若一笔申请包含多个类别，每个类别均需满足 `available === true`。

---

### 3.4 状态流转机

```
pending ──总经理审批通过──> approved ──保管员发章──> checked_out ──保管员收章──> returned
   │                            │                        │
   ├─驳回─> rejected             └─申请人撤回─> withdrawn   └─超期未还─> overdue ──收章──> returned
   └─申请人撤回─> withdrawn
```

* **`pending`**: 已提交，待审批。占用时段。
* **`approved`**: 总经理审批通过。章仍在保管员处，申请人未领走前**允许申请人主动撤回**。
* **`checked_out`**: 保管员已发章，指定具体实体章，`SealItem.physicalOut = true`。**此状态后不可撤回，只能归还**。
* **`overdue`**: 惰性派生 + 定时扫描标记。超过 `expectedReturnAt` 且未收章，继续占用时段与实体章，触发分级催办。
* **`returned`**: 保管员确认收章，记录 `actualReturnAt`，`SealItem.physicalOut = false`，释放占用。
* **`rejected` / `withdrawn`**: 释放占用，触发候补通知。

---

## 4. 保管员、发章权限与台账

### 4.1 集中保管与发章权限

* **核心定位**：公司印章集中保管于印章室或专人处，由专人监督。
* **发章与收章操作权限**（满足其一即可）：
  1. 专职保管员（`tenant.settings.sealCustodianId`）；
  2. 公司总经理 / 董事长（`titleCode` 为 `gm` 或 `ceo`，或 `attendanceRoles` 含 `general_manager`）；
  3. 公司主账号（`role === 'owner'`）或系统管理员（`privilege` 含 `admin`）。
* **经办人记录**：发章与收章接口自动记录当前操作人 ID 与姓名到快照，清晰可溯。

---

### 4.2 印章台账（`SealItem` 清单维护）

保管员维护实体章：
* 支持查看每枚章的类别、编号、状态、当前是否在借、累计借出次数。
* 状态切换：启用 / 停用 / 报废。
* 报废章（`scrapped`）永久保留可查，不参与容量计算，不可再次借出。
* 在借章（`physicalOut === true`）禁止停用或报废。

---

### 4.3 印章使用台账（`SealUsageLog`）

不可变流水台账，只追加不修改：

| 字段 | 说明 |
| --- | --- |
| `tenantId` / `sealType` | 类别 |
| `sealItemId` / `sealItemCode` | 对应的具体实体章编号 |
| `requestId` | 关联的用章申请单 ID |
| `action` | `submit` / `approve` / `reject` / `withdraw` / `checkout` / `return` / `overdue` / `remind` / `watch_notified` |
| `operatorId` / `operatorName` | 动作执行人快照 |
| `at` | 动作时间 |
| `snapshot` | 申请人、用章部门、文件名称、份数、用章时段快照 |
| `note` | 备注说明 |

支持按实体章、申请单、时间范围进行多维查询与借出次数、逾期时长统计。

---

## 5. 核心业务场景落地

### 5.1 时段占用与硬禁止

* 前端在修改用章时段后防抖调用可用性检测。
* 若时段已被占满，复选框置灰禁用，并展示占用人与占用截止时间。
* 提交与审批时双重校验，冲突返回 `409`。

### 5.2 候补通知机制（`SealWatch`）

* **候补登记**：申请人时段被占满时，可对「章类别 + 期望时段 $[desiredFrom, desiredTo]$」登记候补。
* **全触发源**：在以下时段名额释放事件中**触发候补匹配**：
  1. 保管员确认收章归还（`return`）；
  2. 申请人主动撤回申请（`withdraw`）；
  3. 总经理审批驳回申请（`reject`）；
  4. 保管员新增或启用实体章（`status` 变为 `active`）。
* **广播通知**：向所有期望时段与释放窗口有交集的候补人发送站内通知（`seal_returned`），文案明确“公章时段已释放，可前往申请”。
* **规则明示**：候补通知为**广播通知，不锁定名额，先申先得**。候补记录在通知后状态变更为 `notified`，过期自动转 `expired`。

### 5.3 逾期持续占用与分级催办

* **占用持续**：逾期未还继续占用时段，防止不知情的后来人提交冲突申请。
* **分级催办**：
  * 刚进入逾期：发送站内通知给借用人（催还）与保管员；
  * 逾期超过 `sealOverdueRemindMinutes`（默认 2 小时）：通知借用人直属主管；
  * 逾期超过 `sealOverdueEscalateMinutes`（默认 24 小时）：升级通知总经理。
* **去重与并发控制**：在 `SealRequest` 上记录 `reminders: [String]`。后台定时扫描时通过 CAS 更新，防止多实例并发重复发消息。
* **异常收章处理**：若发生特殊情况归还，保管员直接在工作台点击收章，并在收章备注栏录入情况说明，台账完整留痕。

---

## 6. 站内通知中心（`Notice`）

* **通用模型**：`Notice: { tenantId, userId, kind, title, body, link, readAt, createdAt, meta }`。
* **通知种类**：
  * `seal_approved`: 审批通过，通知申请人领章；
  * `seal_returned`: 归还销账通知申请人 / 候补时段释放通知候补人；
  * `seal_overdue`: 逾期催还（借用人/主管/总经理）。
* **前端呈现**：
  * 在全局布局 `front_end/src/layouts/default.vue` 的 Header 右侧工具区挂载通知铃铛组件 `NoticeBell.vue`；
  * 页面加载获取一次未读数 + 60 秒轮询；
  * 覆盖索引支撑轻量查询：`{ tenantId: 1, userId: 1, readAt: 1 }`。

---

## 7. 权限矩阵

| 功能 | 允许角色 | 守卫与兜底说明 |
| --- | --- | --- |
| 访问任何用章接口 | 登录员工、非 platform | 必须通过 `requireSealEnabled`（standalone 读 env，SaaS 读 tenant.settings） |
| 提交申请 / 我的用章申请 / 登记候补 | 登录员工、非 platform | 普通员工可用 |
| 审批（单级） | 租户总经理（`attendanceRoles: 'general_manager'`）或代理人 | **若未配总经理角色或未开考勤，自动由公司主账号（owner）审批** |
| 发章 / 收章 / 催还 | 专职保管员、总经理/董事长、owner、admin | 集中保管，支持高管与主账号代行 |
| 印章台账维护（增删改停用报废） | 专职保管员、owner、admin | 在借中严禁停用或报废 |
| 查看台账与统计分析 | 保管员、总经理/董事长、owner、admin | 全公司印章明细与报表 |
| 用章模块设置（指派保管员、催办阈值） | owner、admin | 集中管理设置项 |

---

## 8. 接口清单

```
GET    /seal/requests?view=mine|inbox|history|custody|all&status&sealType&page&limit
POST   /seal/requests                                    # 提交申请，冲突返回 409
GET    /seal/requests/:id
POST   /seal/requests/:id/withdraw                       # 撤回（发章前允许，释放名额并触发候补）
POST   /seal/requests/:id/review        { decision, comment } # 审批（总经理或 owner，驳回触发候补）
POST   /seal/requests/:id/checkout      { sealItemIds }  # 发章（指定实体章，置 physicalOut=true）
POST   /seal/requests/:id/return        { actualReturnAt, note? } # 收章归还（置 physicalOut=false，触发候补）
GET    /seal/availability?from=&to=                      # 动态容量与剩余可用查询
GET    /seal/items?status=active|disabled|scrapped       # 实体章列表
POST   /seal/items                      { sealType, code?, note? } # 新增实体章（触发候补）
PATCH  /seal/items/:id                  { code?, note?, status? }  # 修改/启用（触发候补）/停用/报废
GET    /seal/ledger?sealItemId&sealType&from&to&action&page&limit # 使用台账
GET    /seal/statistics?period=month|year&value=&sealItemId=      # 印章使用统计
GET    /seal/watches   POST /seal/watches   DELETE /seal/watches/:id # 候补管理
GET    /seal/settings  POST /seal/settings                # 租户用章设置（owner/admin：保管员与阈值）
GET    /notices?unreadOnly&page&limit
GET    /notices/unread-count
POST   /notices/:id/read
POST   /notices/read-all
```

全部 `/seal/*` 接口统一挂载 `requireSealEnabled` 守卫，未启用公司统一返回 404。

---

## 9. 前端页面与侧栏规划

### 9.1 侧栏解耦与组合逻辑（`front_end/src/components/app-sidebar/data/sidebar-data.ts`）

根据 `features.attendance` 与 `features.seal` 动态组合：

1. **场景 1：考勤与用章均启用（`features.attendance && features.seal`）**
   * 「考勤与工资」分组中的「我的申请」常驻包含 4 个并列子项：
     - `请假申请`（`/attendance/requests?type=leave`）
     - `加班申请`（`/attendance/requests?type=overtime`）
     - `外勤申请`（`/attendance/requests?type=fieldwork`）
     - `用章申请`（`/seal/requests`）
   * 考勤审批与工资菜单保持原状；
   * 管理端新增独立「印章管理」菜单（工作台 / 印章台账 / 使用台账）。

2. **场景 2：仅启用用章、未启用考勤（`!features.attendance && features.seal`）**
   * 不展示考勤与工资相关的任何菜单；
   * **独立展示「我的申请」分组**，仅包含单个子项：
     - `用章申请`（`/seal/requests`）
   * 管理端根据权限展示「印章管理」与「用章设置」；
   * 审批流自动回退至 `owner`，保证提单不受未开考勤阻碍。

3. **场景 3：仅启用考勤、未启用用章（`features.attendance && !features.seal`）**
   * 维持现有纯考勤结构，不出现任何用章入口。

### 9.2 页面与组件清单

* `pages/seal/requests.vue`: 申请列表外壳（根据 query 参数区分视图）；
* `pages/seal/components/SealRequestList.vue`: 列表与详情抽屉（展开显示流水日志）；
* `pages/seal/components/SealRequestDialog.vue`: 新建弹窗（含时间段实时容量校验与候补引导）；
* `pages/seal/workbench.vue`: **印章工作台**（待发章、在借、逾期三标签，支持一键发章与收章）；
* `pages/seal/items.vue`: **印章台账**（实体章增删改、停用、报废）；
* `pages/seal/ledger.vue`: **使用台账**（只读流水日志与多维筛选）；
* `pages/seal/settings.vue`: 专职保管员指派、逾期阈值配置；
* `components/notice/NoticeBell.vue`: 顶栏通知铃铛与通知抽屉（挂载至 `layouts/default.vue`）；
* `services/api/seal.api.ts` 与 `notice.api.ts`: API 封装。

---

## 10. 数据库索引设计

```javascript
// models/SealItem.js
{ tenantId: 1, sealType: 1, status: 1 }
{ tenantId: 1, sealType: 1, code: 1 } (unique)

// models/SealCounter.js
{ tenantId: 1 } (unique)

// models/SealRequest.js
{ tenantId: 1, applicantId: 1, createdAt: -1 }
{ tenantId: 1, serialNo: 1 } (unique)
{ tenantId: 1, currentApproverId: 1, status: 1, createdAt: -1 }
{ tenantId: 1, sealTypes: 1, status: 1, useAt: 1, expectedReturnAt: 1 }
{ tenantId: 1, status: 1, expectedReturnAt: 1 }

// models/SealWatch.js
{ tenantId: 1, sealType: 1, status: 1 }

// models/SealUsageLog.js
{ tenantId: 1, sealItemId: 1, at: -1 }
{ tenantId: 1, sealType: 1, at: -1 }
{ tenantId: 1, requestId: 1, at: 1 }

// models/Notice.js
{ tenantId: 1, userId: 1, readAt: 1, createdAt: -1 }
```

---

## 11. 实施计划与步骤

1. **环境与租户设置字段**：
   - `config/secrets.js` 增加 `enableSeal: process.env.ENABLE_SEAL === 'true'`；
   - `models/Tenant.js` 增加 `sealEnabled`、`sealCustodianId`、`sealOverdueRemindMinutes`、`sealOverdueEscalateMinutes`；
   - `controllers/user.js` 与 `controllers/api/user.js` 注入 `features.seal`；
2. **六大模型构建**：建立 `SealItem`、`SealCounter`、`SealRequest`、`SealWatch`、`SealUsageLog`、`Notice` 模型；
3. **权限守卫与基础工具**：
   - 编写 `utils/seal-permissions.js`，实现 `requireSealEnabled`（standalone 与 SaaS 统一守卫）；
   - 实现集中发章权限判定、总经理/owner 兜底判定；
4. **实体章管理与幂等预置**：实现 `/seal/items` 接口，在首次启用与访问时为租户幂等预置 5×1 枚实体章；
5. **申请核心业务流程**：实现原子流水号提交、时段冲突校验（扫描线算法）、撤回、单级审批复检；
6. **集中发章与归还**：实现保管员/高管发章、正常归还，联动 `physicalOut` 与台账流水；
7. **时段释放与候补通知**：抽象统一的 `triggerSealWatchCheck`，在归还、撤回、驳回、启用新章时触发站内通知；
8. **逾期扫描与定时催办**：实现安全的租户迭代扫描与 CAS 催办去重；
9. **台账查询与统计**：实现流水日志导出/查询与使用频次统计接口；
10. **通知中心全栈落地**：通知接口开发，并在 `layouts/default.vue` 集成 `NoticeBell.vue`；
11. **前端页面开发**：申请列表、新建弹窗、工作台、印章台账、设置页开发；
12. **侧栏解耦接入**：更新 `sidebar-data.ts`，覆盖仅用章、仅考勤、考勤用章均开启等各种场景；
13. **验证与交付**。

---

## 12. 分级验证要求

本改动包含新模型、核心状态机与通知中心，定级为 **L2 跨模块验证**：

* **单测覆盖（`test/seal-request.test.js`）**：
  * 功能开关守卫验证（关闭时 404，开启时正常访问）；
  * 流水号并发取号原子性与补零格式；
  * 扫描线容量判定（单枚满员拦截、多枚并发峰值、存量跨区间基数）；
  * 逾期未还持续占用时段验证；
  * 发章指定实体章与在借章防报废/防停用拦截；
  * 候补触发全场景（归还、撤回、驳回、启用新章）；
  * 未配置总经理时由 owner 兜底审批通过；
  * 台账不可变性。
* **主流程实走**：
  * 开启模块 → 自动预置实体章 → 普通员工提单 → 审批 → 工作台发章 → 归还销账 → 候补提醒。
* **前端类型检查**：`npx vue-tsc -b --force`。
