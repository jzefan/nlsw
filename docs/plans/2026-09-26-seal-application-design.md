# 用章（印）申请需求设计

日期：2026-09-26。状态：设计待确认，未开始实现。

目标：在「我的申请」下新增「用章申请」，字段与线下《用章（印）申请单》对齐，由**印章保管员**记录并监督每一枚章的使用，做到「章被占用时申请不到、提前归还时通知候补人、逾期未还时按规则处理、每次借出与归还都有台账可查」。

四项已确认决策（2026-09-26）：

| 决策点 | 结论 |
| --- | --- |
| 章的资源模型 | **每个用章类别仅一枚实体章**，占用按类别判定 |
| 时段冲突 | **硬禁止**：与任一占用中的申请时段重叠即不可选，只能换章或改时段 |
| 通知渠道 | **新建站内通知中心**（消息表 + 顶栏入口 + 未读徽标） |
| 逾期未还 | **自动释放占用**，章回到可申请状态；逾期申请仍需归还闭环 + 分级催办 |

## 1. 范围与现状对照

一期形成闭环：提交申请 → 部门主管意见 → 总经理意见 → **保管员发章** → 使用 → **保管员收章** → 全程记入章使用台账；同时跟踪章占用、候补通知与逾期催办。

复用与新增的边界：

| 现有设计 | 本次处理 |
| --- | --- |
| 考勤申请 `AttendanceRequest` + `controllers/api/attendance.js` 的两级审批（直属经理 → 总经理） | **只复用模式，不复用模型**：用章不是考勤，独立建模，避免被考勤开关、工作日历、考勤台账耦合 |
| `utils/attendance-permissions.js` 的 `requireAttendanceEnabled` / `requireEmployee` | 新增 `utils/seal-permissions.js`，独立开关 `sealEnabled`；登录 + 有租户的部分直接复用同一判据 |
| 租户 `settings.attendanceEnabled`、standalone 下 `ENABLE_ATTENDANCE` | 同构新增 `settings.sealEnabled` / `ENABLE_SEAL`，默认关闭 |
| `attendanceRoles` 表达「部门主管 / 总经理」 | 部门主管用 `user.managerId`；总经理用 `attendanceRoles` 含 `general_manager`（这两个角色本就是组织层级，不是考勤专属） |
| 项目无任何通知/消息基础设施 | 新建 `models/Notice.js` + 顶栏铃铛，按通用命名，后续其他模块可复用 |
| `components/ui/*`（shadcn-vue）、`RequestList.vue` 的列表+详情展开形态 | 用章列表沿用同一套交互形态与组件，字段独立 |

代码依据：`models/AttendanceRequest.js`、`controllers/api/attendance.js`、`utils/attendance-permissions.js`、`routes_api.js`、`models/Tenant.js`、`front_end/src/pages/attendance/requests.vue`、`front_end/src/pages/attendance/components/RequestList.vue`、`front_end/src/services/api/attendance.api.ts`、`front_end/src/components/app-sidebar/data/sidebar-data.ts`。

## 2. 字段对齐（图 → 模型）

| 申请单字段 | 模型字段 | 说明 |
| --- | --- | --- |
| 申请日期 | `createdAt` | 提交时间，自动 |
| No 000008 | `serialNo` | 租户内自增流水，6 位补零，不按年重置 |
| 申请人 | `applicantId` + `applicant{employeeNo,name,department,title}` | 取当前登录用户快照，与考勤申请同一写法 |
| 用章部门 | `useDepartment` | 默认带出 `applicant.department`，可改 |
| 用章时间 | `useAt` | 占用区间起点 |
| 预计归还时间 | `expectedReturnAt` | 占用区间终点；须晚于 `useAt` |
| 申请用章类别（勾选框） | `sealTypes: [String]` | 多选，至少 1 项；枚举见 §3.1 |
| 用章文件名称 | `documentName` | 必填 |
| 份数 | `copies` | 正整数 |
| 用章事由 | `reason` | 必填 |
| 备注 | `remark` | 选填 |
| 经办人 | `operatorId` / `operatorName` | **由保管员在发章时写入，申请人不用填**（见 §4.1） |
| 部门主管意见 | `approvals[]` role=`manager` | 状态 + 意见 + 时间 |
| 总经理意见 | `approvals[]` role=`general_manager` | 同上 |
| — | `actualReturnAt` | **图上没有但必需**：问题 2、3 的判据来源 |
| — | `checkedOutAt` | 实际发章时间，由保管员确认 |
| — | `forcedReturn{by,at,reason}` | 保管员强制归还留痕 |

## 3. 章状态与占用判定

### 3.1 用章类别

`official` 公章 / `finance` 财务专用章 / `contract` 合同专用章 / `invoice` 发票专用章 / `legal` 法人章。每类仅一枚实体章（已确认），因此「占用」是类别级概念，不需要逐枚登记。

### 3.2 两个正交的概念

逾期自动释放占用会带来一个物理矛盾：章还在别人手上，系统却显示可选。因此把「时段占用」与「实体在借」拆开：

- **时段占用（reservation）**：占用中的申请 = `status ∈ {pending, approved, checked_out}`，占用区间 = `[useAt, expectedReturnAt)`。决定「能不能申请」。
- **实体在借（physicalOut）**：存在 `status ∈ {checked_out, overdue}` 且未归还的申请。决定「发章时要不要先追回」。

逾期后时段占用释放，但 `physicalOut` 仍为真 —— 新申请可以提交，但保管员发章时会看到「上一枚尚未归还」的提示。

### 3.3 冲突判定

```
hasSealConflict(tenantId, sealTypes, useAt, expectedReturnAt, excludeId?)
  → SealRequest.find({
      tenantId,
      status: { $in: ['pending','approved','checked_out'] },   // overdue 不占用
      sealTypes: { $in: sealTypes },
      useAt: { $lt: expectedReturnAt },
      expectedReturnAt: { $gt: useAt }
    })
  → 返回 [{ sealType, applicantName, occupiedUntil }]
```

三道校验，缺一不可：

1. **前端预校验**：选完时间后调 `/seal/availability`，被占用的类别禁选并显示「已被 张三 占用至 09-27 18:00」。
2. **提交时服务端校验**：`createRequest` 内再查一次，冲突返回 `409` + 具体占用人和占用截止时间。
3. **审批通过时复检**：`review` 通过动作内复检一次。这是「预留变实」的关键点，也是并发窗口最小的位置。

> 取舍说明：区间互斥无法用唯一索引表达，第 2 步与第 3 步之间存在理论上的 TOCTOU 窗口。单公司内部并发提交同一时段同一枚章的概率极低，且审批环节有人复核，因此**一期不引入租户级互斥锁**，用「提交校验 + 审批复检」两道查询覆盖。若实际出现撞车再补锁。

### 3.4 状态流转

```
pending ──通过──> approved ──保管员发章──> checked_out ──保管员收章──> returned
   │                                          │
   └─驳回/撤回─> rejected / withdrawn           └─超过预计归还─> overdue ──归还/强制归还──> returned
```

`overdue` 是 `checked_out` 的惰性派生状态：读取列表或可用性时，把 `expectedReturnAt < now` 且仍为 `checked_out` 的记录就地转成 `overdue` 并触发催办。另加一个轻量定时扫描（默认 5 分钟一次）保证保管员不在系统里时通知也能发出。

## 4. 保管员与章使用台账

### 4.1 印章保管员

**角色定位**：章的日常保管与使用监督人。发章、收章、催还都由他确认，申请人自己不能把申请改成「已借出」。

**指派方式**：租户设置 `sealCustodians`，**支持按章类别分别指定**（财务专用章 / 发票专用章通常在财务手上，公章在行政手上），也支持只用一名统一保管员：

```
sealCustodians: {
  default: ObjectId | null,                 // 统一保管员，未单独指定的类别回落到这里
  byType: { official?, finance?, contract?, invoice?, legal? }
}
```

**兜底**：至少要有一名保管员才能启用用章模块（`POST /seal/settings` 时校验），否则会出现「章没人管」的状态；owner 始终可代行保管员操作。

**与「经办人」的关系**：纸质单上的「经办人」就是实际发章 / 收章的保管员，系统在发章动作时写入 `operatorId` + `operatorName` 快照，申请人不用填这一栏。

**与审批链的关系**：保管员**不参与审批**（审批仍是部门主管 → 总经理），只在审批通过后介入。职责分开，避免「自己批自己发」。

### 4.2 章使用台账 `SealUsageLog`

不可变流水：一次动作一条记录，**只追加不修改**（纠正只能追加一条冲正记录）。

| 字段 | 说明 |
| --- | --- |
| `tenantId` / `sealType` | 哪一枚章 |
| `requestId` | 关联的用章申请 |
| `action` | `submit` 提交 / `approve` 审批通过 / `reject` 驳回 / `withdraw` 撤回 / `checkout` 发章 / `return` 归还 / `force_return` 强制归还 / `overdue` 逾期标记 / `remind` 催还 / `watch_notified` 候补通知 |
| `operatorId` / `operatorName` | 动作执行人（保管员 / 审批人 / 系统） |
| `at` | 动作时间 |
| `snapshot` | 当时的 申请人 + 用章部门 + 文件名称 + 份数 + 用章时间 + 预计归还时间（防申请后续改动影响追溯） |
| `note` | 备注；强制归还时必填原因 |

**监督用途**：

- 按章看历史：「这枚章被谁借走、用了多久、有没有逾期」——`GET /seal/ledger?sealType=&from=&to=&action=`
- 按申请看轨迹：详情展开里直接渲染该申请的全部台账记录
- 出统计：每枚章的使用次数、累计借出时长、逾期次数与累计逾期时长——`GET /seal/statistics?period=&value=`

### 4.3 监督闭环

```
审批通过 ──> 待发章（进保管员工作台待办）
              │ 保管员发章 → 记 checkedOutAt + operatorId + ledger(checkout)
              ▼
           使用中 ──> 到预计归还时间 → overdue（ledger(overdue)）
              │                            │ 保管员催还 → ledger(remind)
              │ 借用人送回                  │
              ▼                            ▼
           归还（保管员确认）→ 记 actualReturnAt + operatorId + ledger(return)
```

三条硬约束：

- **发章与归还只有保管员（或 owner 代行）能操作**，接口层校验操作人是否为该章类别的保管员；申请人不能绕过保管员把状态往前推。
- **还没发章的申请不会进入「使用中」**，从根上杜绝「没记录就算用了」。
- 归还时如果该章后续时段已被他人预约，提示保管员「下一笔 15:00 有人要用」——提示但不阻断。

## 5. 三个业务问题的落地

### 5.1 章被他人占用 → 时段硬禁止

- 申请单里「用章时间 / 预计归还时间」任一变化就重算可用性，被占用的类别复选框禁用并写明占用人与截止时刻。
- 提交时后端复检，冲突 409。
- 「审批中」也计入占用 —— 否则会出现「批完才发现撞车」。

### 5.2 章提前归还 → 通知候补人

新增 `SealWatch`（候补 / 关注）：

- 申请人被占用挡下时，可对「章 + 期望时段」登记候补。
- 保管员确认归还后，取该章**接下来最早的空闲窗口**，与所有 `waiting` 状态的候补记录 `[desiredFrom, desiredTo]` 求交集。
- 命中的写一条 `Notice`（kind `seal_returned`），文案带具体时刻：「公章已于 09-27 14:20 归还，你关注的 15:00–17:00 可用」，并直达新建申请。
- 候补记录转 `notified`，不重复通知；期望时段已过期的转 `expired`。
- 顺手给申请人也发一条 `seal_returned` 回执（「你的申请已归还销账」），保管员端同步看到台账更新。

### 5.3 章迟迟未还 → 释放占用 + 分级催办

- **释放**：转入 `overdue` 即释放时段占用，章回到可申请状态（已确认）；`physicalOut` 保留，保管员工作台把它排在最上面并给非阻断提示「上一枚尚未归还」。
- **催办分级**（阈值放租户设置，默认值）：
  - 刚逾期：通知借用人（催还）+ **通知该章保管员**（日常监督人第一时间知晓）。
  - 逾期超过 `sealOverdueRemindMinutes`（默认 120 分钟）：通知部门主管。
  - 逾期超过 `sealOverdueEscalateMinutes`（默认 1440 分钟）：通知总经理。
  - 去重靠申请上的 `reminders[]`（记录已发的 level），避免每次读取重复发；每条催办同时写台账 `remind`。
- **保管员兜底**：可「强制归还」（必填原因），写 `forcedReturn{by,at,reason}` + 台账 `force_return`，状态转 `returned`，并通知借用人。逾期时长与次数进统计。

## 6. 站内通知中心

- 模型 `Notice`：`{ tenantId, userId, kind, title, body, link, readAt, createdAt, meta }`。
- kinds：`seal_approved`（审批通过可取章，通知申请人 + 保管员）、`seal_returned`（归还 + 候补可用）、`seal_overdue`（逾期催办）、`seal_overdue_escalate`（升级）。
- 顶栏铃铛 + 未读数徽标；打开后列表可标记已读 / 全部已读。
- 拉取策略：进入页面时取一次 + 60 秒轮询未读数（与项目现有做法一致，不引入 WebSocket）。

## 7. 权限

| 能力 | 判据 |
| --- | --- |
| 提交申请 / 我的用章申请 / 登记候补 | 已登录、非 platform、有租户、`settings.sealEnabled` 开启 |
| 待我审批 / 审核记录 | 当前审批人是自己（`currentApproverId`）或自己已审过 |
| 审批链 | 部门主管 = `user.managerId`；总经理 = `attendanceRoles` 含 `general_manager`；无有效审批人时**禁止提交并提示去哪配**，不自动通过（与考勤同一约定） |
| **发章 / 收章 / 催还 / 强制归还** | **该章类别的印章保管员**（`sealCustodians.byType[sealType]`，未设则回落 `default`）；owner 始终可代行 |
| 看章使用台账 / 统计 | 保管员（限定自己保管的章）+ owner + admin |
| 开关、保管员指派、逾期阈值 | owner（`requireExactOwner`） |

## 8. 接口清单

```
GET    /seal/requests?view=mine|inbox|history|custody|all&status&sealType&page&limit
POST   /seal/requests                                    # 提交，冲突返回 409
GET    /seal/requests/:id
POST   /seal/requests/:id/withdraw
POST   /seal/requests/:id/review        { decision, comment }
POST   /seal/requests/:id/checkout      { }              # 保管员发章，写 operatorId
POST   /seal/requests/:id/return        { actualReturnAt? }   # 保管员收章
POST   /seal/requests/:id/force-return  { reason }       # 保管员强制归还，原因必填
GET    /seal/availability?from=&to=                      # 5 类章占用一览 + physicalOut
GET    /seal/ledger?sealType&from&to&action&page&limit   # 章使用台账
GET    /seal/statistics?period=month|year&value=          # 每枚章使用次数 / 借出时长 / 逾期
GET    /seal/watches   POST /seal/watches   DELETE /seal/watches/:id
GET    /seal/settings  POST /seal/settings                # owner：开关、保管员、逾期阈值
GET    /notices?unreadOnly&page&limit
GET    /notices/unread-count
POST   /notices/:id/read
POST   /notices/read-all
```

全部走 `requireTenant`；写操作加 `requireSameOrigin`。`view=custody` 返回保管员关心的三组：待发章（`approved` 且未发章）、在借（`checked_out`）、逾期（`overdue`）。

## 9. 前端

| 文件 | 用途 |
| --- | --- |
| `pages/seal/requests.vue` | 「我的用章申请」入口壳，从 `route.query.view` 分发 |
| `pages/seal/components/SealRequestList.vue` | 列表 + 详情展开（详情里带该申请的台账轨迹），形态对齐 `RequestList.vue` |
| `pages/seal/components/SealRequestDialog.vue` | 新建弹窗，含可用性实时校验与候补登记入口 |
| `pages/seal/components/SealAvailabilityPanel.vue` | 5 类章当前占用一览（谁占用到什么时候） |
| `pages/seal/workbench.vue` | **保管员工作台**：待发章 / 在借 / 逾期三组，含发章、收章、催还、强制归还 |
| `pages/seal/ledger.vue` | **章使用台账**：按章类别 + 时间范围 + 动作筛选，展示每枚章的借出与归还轨迹 |
| `pages/seal/settings.vue` | owner：开关、保管员指派（按类别）、逾期阈值 |
| `components/app-topbar/NoticeBell.vue` | 通知铃铛 + 未读徽标 + 消息列表 |
| `services/api/seal.api.ts`、`services/api/notice.api.ts` | 接口封装 |
| `components/app-sidebar/data/sidebar-data.ts` | 「我的申请」下新增「用章申请」；按权限新增「印章管理」（工作台 / 台账）与「用章设置」 |

侧栏位置：「我的申请」在该分组下已有 请假 / 加班 / 外勤 三个子项，用章申请作为第 4 个子项并列（保持现有分组不变，不额外拆新分组）。

## 10. 索引

```
SealRequest:  { tenantId, applicantId, createdAt: -1 }
              { tenantId, currentApproverId, status, createdAt: -1 }
              { tenantId, sealTypes: 1, status: 1, useAt: 1, expectedReturnAt: 1 }   # 冲突查询
              { tenantId, status: 1, expectedReturnAt: 1 }                            # 逾期扫描
SealWatch:    { tenantId, sealType: 1, status: 1 }
SealUsageLog: { tenantId, sealType: 1, at: -1 }
              { tenantId, requestId: 1, at: 1 }
Notice:       { tenantId, userId: 1, readAt: 1, createdAt: -1 }
```

## 11. 实现顺序（每步可独立验证）

1. 模型四件套：`SealRequest`、`SealWatch`、`SealUsageLog`、`Notice` + 租户设置字段。
2. `utils/seal-permissions.js`（含保管员判定）+ 权限守卫。
3. 接口：提交 / 列表 / 撤回 / 审批（含冲突判定与两次复检），每个动作写台账。
4. 接口：可用性查询 + 候补 CRUD + 保管员发章 / 收章 / 强制归还 + 归还时命中候补并发通知。
5. 逾期惰性判定 + 分级催办（含通知保管员）+ 定时扫描。
6. 接口：章使用台账查询 + 统计。
7. 通知中心（接口 + 顶栏铃铛）。
8. 前端：列表 / 新建弹窗 / 可用性面板。
9. 前端：保管员工作台 + 章使用台账页 + 用章设置页 + 侧栏接入。
10. 验证（见下）。

## 12. 验证档位

**L2/L3**：新增数据模型、新接口、权限与状态机，属于跨模块改动。

- 后端单测（新增 `test/seal-request.test.js`）：时段重叠判定四种边界（相邻不算冲突 / 部分重叠 / 完全包含 / 跨多章）、逾期释放占用、候补命中与去重、审批链缺审批人时拒绝提交、**非保管员发章 / 收章被 403 拒绝**、台账只追加不修改。
- 真实走一遍主流程：提交 → 部门主管通过 → 总经理通过 → 保管员发章 → 他人申请同章被拦 → 保管员收章 → 候补人收到通知 → 逾期分支 → 强制归还。
- 前端：`npx vue-tsc -b --force` + 目标页面真实渲染。
- 回滚：无数据迁移（全部新表），回滚 = 关闭 `sealEnabled` 并在 `routes_api.js` 注释路由段。

## 13. 待确认（不影响开工，可在实现中定）

1. 保管员是否按章类别分别指定？（当前设计：**支持**，且未单独指定时回落到统一保管员）
2. `serialNo` 是否按年重置？（当前设计：租户内不自重置，6 位补零）
3. 「份数」是否必填？（当前设计：必填正整数）
4. 逾期阈值默认值是否合适？（当前设计：2 小时通知主管、24 小时升级总经理）
5. 是否需要「发章后不可撤回申请」？（当前设计：已发章的申请不可撤回，只能走归还）
