# nlsw-saas 项目长期笔记

只留「不看就会做错」的判据。背景、理由、叙事一律删。

## 环境 / 验证
- 后端 `npm run dev` = `node --watch app.js`；`--watch` **不监听** `.env`/`views`/`public`/`data`/`uploads`。
  **别 kill 用户正在跑的进程**（1080 后端 / 5173 vite）。`npm run lint` 跑不起来（ESLint 9 vs v8 配置）——既有问题。
- 验证：`npx vue-tsc -b`；`npx vite build --outDir .build-checkMMDD --emptyOutDir`（**每次换新目录名**）；全量 `node --test test/*.test.js`。
  分级 L0–L3 见 `AGENTS.md` §2。

## 免密码验证（复用在线会话）
- `connect.sid` = `s:<sid>.<HMAC-SHA256(sid, SESSION_SECRET)>`；**别写死 sid**，按目标用户 + 探 `/me` 动态挑（财务 `caiwu`）。
- playwright 用 `require('playwright-core')` + `NODE_PATH=<workbuddy workspace node_modules>:<项目>/node_modules`。
- **拦接口只按「端口 + pathname 谓词」**，别用 `**/xxx**`（会拦到 vite 的 `.vue` → 白屏）；SPA 路由与接口路径同名
  → 还要判 `resourceType !== 'document'`。工资表页面路由 = `/attendance/payroll/statements`（`/attendance/payroll` 是 404）。
- 等待条件用 `[data-slot="sidebar-wrapper"]`（移动端 Sidebar 在关闭的 Sheet 里、不进 DOM）。
- **断言侧栏入口别只看 DOM**：「我的申请」「待我审批」是折叠分组，子链接默认不在 DOM → 从组件 `setupState.navMain` 读。
- **Radix tooltip 要 hover 到徽标本身**；**列溢出断言**要量 `[data-slot="table-container"]` 内层（外层 `scrollWidth` 恒等 `clientWidth`）。
- **写接口回放要带 `origin`/`referer`**（GET 不需要），否则 403「请求来源无效」。
- `context.unroute(fn)` **按引用比** → 换桩就另开 context。脚本末尾别接 `| head -N`（SIGPIPE 会截掉汇总）。
- 完整脚本见技能 `live-session-api-replay`。

## 角色与权限
- **管理员 ≠ owner**：管理员 = `privilege` 含 `'admin'`；owner = `role === 'owner'`。守卫 `requireExactOwner`、`requirePeopleManager`。
- **总经理** = `attendanceRoles` 含 `general_manager`，租户内唯一（`User.attendanceGeneralManagerTenantId`，`select:false`，
  由「用户管理 → 职位」同步）；代理审批人 = `Tenant.settings.attendanceGeneralManagerDelegateId`。
  审批链**不加部门主管一级、不留「可配置审批层级」开关**（被否）。催办链「通知部门主管」= `user.managerId`（上报对象，非审批人）。
- **审批权不看角色**：`reviewRequest` 只认审批链 `approverId`，派单按申请人 `managerId` → 会出现「收得到单子没入口」。
- **三个考勤角色别删**：`attendance_admin`（日历、结账/重开、全公司范围）；`manager` 只管入口与范围。
- `requireEmployee` 需**有工号**（覆盖 `/attendance/requests*`、`GET /attendance/payroll/my`）；缺工号返回 `code:'EMPLOYEE_NO_MISSING'`
  （前端 `isEmployeeNoMissing()`，**别匹配文案**）。**存量账号普遍没工号**。
- `models/User.js` 的 `mustChangePassword` 是 `default: undefined` + 守卫 `!== true`（放行），注释与代码相反。

## 编号
- **本仓没有流水号发生器**（`models/OrderNumber.js` 是去重字典）。租户内自增号：独立集合 +
  `findOneAndUpdate({tenantId},{$inc:{n:1}},{upsert:true,new:true})` + 唯一索引；**别用 `countDocuments()+1`**。

## 工作日历（国务院安排）
- 三层：内置 `YEARLY_SCHEDULES`（离线兜底）→ `holiday_calendars`（全国数据**故意不挂 tenantId**）→ 线上 `china-holiday-source.js`。
- `getChinaAttendanceCalendar(year)` 必须**同步**；异步 `ensureChinaAttendanceCalendar(year)` **只在 `GET /attendance/calendar`**；
  `loadChinaAttendanceCalendar()` 在 app.js 预热。**别把抓取塞进同步链路。**
- **「某天算不算工作日」唯一入口 = `workIntervalMinutes(date, policy)`**；优先级：租户单日覆盖 > 国务院安排 > 周六上午 > 周一至周五。
- 星期一律 `new Date(date+'T00:00:00.000Z').getUTCDay()`。月度应出勤**与人员无关**；未结账月份不沿用快照。
- 测试 mock `HolidayCalendar.findOne()` 是 Query，**要还原 `.lean()`**。

## 考勤月台账
- **两层状态**：整月 `status: open|closed`（open 按当前日历实时重算应出勤；closed 读快照，改要「重新开启」+ 原因 + `AttendanceLedgerAudit`）；
  每人 `confirmationState: pending|confirmed|no_basis`（confirmed 必须有非负整数实到；no_basis 必须填原因且实到留空）。
- **结账前置（`closeMonth`，缺一即 409）**：有 pending / confirmed 无分钟 / no_basis 无原因或有实到 / `requiresLeaveReconciliation`。
  确认与结账仅 **主账号 + `attendance_admin`**（`isMonthAdmin`）。可见范围：主账号/考勤管理员/总经理=全公司，经理=团队，其余=本人。
- **「无依据」≠「没出勤」**；**拿不准填无依据，不许用 0 冒充**。
- **台账实到不参与算钱**：工资条「请假与旷工扣款」财务手填；工资表明细「当月考勤时长」来自**已通过的申请单**
  （`getMonthlyAttendanceSummary`），不依赖台账确认。
- **系统不登记「实际加班 / 实际出差」**：那两行文案 2026-09-30 已删，**别加回来**。
- **加班补偿**：`comp_time`/`overtime_pay`/`none`（必选、**默认无补偿**；`ALLOWED_COMPENSATION` 与模型 enum 同步），展示统一「**无补偿**」。
  **加班总时长与方式无关**，三种都进 `overtimeApprovedMinutes`；台账「已批加班」格第二行用 `overtimeMethodLabel()` 只列**真有时长的**方式。
- **待审批只作提示**：`buildRows` 一次 `$in:['approved','pending']` 后按状态切开，`pending*` 不并入「已批」、不参与实到。
  **改这个查询会连坐测试**（夹具必须带 `status`）。
- **导入考勤记录**（`POST /attendance/ledger/import`，`LedgerImportDialog.vue`）：`isMonthAdmin`、已结账 409、**只更新传入字段**、走月份锁。
  **只登记次数**；请假**不导入**；空格不动原值、`0` 有效；按**表头文字**识别列；注释行 `isNonEmployeeLabel` 跳过；
  报错用中文列名（`IMPORT_FIELD_LABELS`），**别漏出 `lateTotal` 这类 key**。
- **实到自动计算**：`应出勤 − 请假 − 迟到/早退/无打卡扣减`，下限 0。唯一来源 `utils/attendance-ledger-actual.js` 的 `DEFAULT_ACTUAL_RULE`；
  租户配置 `Tenant.settings.attendanceLedgerActualRule`（界面「考勤设置 → 工作日历设置」，**字段标签由后端 `ACTUAL_RULE_FIELDS` 下发**）。
  **建议值只算不写库**（读时附 `suggestedActualMinutes/suggestedActualNote/actualMinutesIsManual`），保存那行才落库
  （`actualMinutesSource='auto'|'manual'`；auto 由服务端核对，saveRow 多一次 `AttendanceRequest.find`，**测试要打桩**）。
  不覆盖判据 `isActualManual(row)`：无来源标记的旧行「有值即人工」。不给建议值：`requiresLeaveReconciliation`、本月无应出勤；
  扣成负数按 0；只导入「迟到合计」未分档 → 不扣。前端必须有 `effectiveActualMinutes(row)`（`makeDraft`/`isRowDirty` 都用它，
  否则一进页面就判成「未保存修改」，挡住切月与结账）。

## 考勤申请 / 审批 / 附件
- 三入口（我的申请 / 待我审批 / 审核记录）**共用 `RequestList.vue`**；详情是展开行（`RequestTimeline.vue`，状态 `等待中|已通过|已驳回|未进行`）。
- **审批人姓名由后端序列化注入**（`approverNameMap()` → `serializeRequest`）：`approvals` 是子文档，schema 没有的字段直接赋值
  会被 **strict 静默丢掉** → 展示字段一律走序列化注入。
- **时长口径**：请假 = **折算天数**（÷ `calendarMinutesPerWorkday(year)`，取不到按 480）、出差 = **日历天数**（含首尾）、加班 = **小时**；
  详情头部只显示部门。
- **附件**：`canPreviewAttachment` → 图片/PDF 内联预览，Word/Excel 只下载。**预览必须用本地 blob**（附件接口要登录态，跨端口拿不到 cookie）。
- **测试桩**：`test/attendance.test.js` 文件级 `User.find = () => queryResult([])`（不桩 1s → 81s）；**自定义桩要同时支持 `.lean()`**。
- **待办提示只有审批页那一行**：`components/approval/ApprovalPendingLinks.vue` ← `stores/approvals`（侧栏挂载 `start()`，立即 + 60s 轮询）。
  **侧栏菜单不加角标**（被否）。`GET /attendance/approvals/pending-counts`（**别挂 `requireEmployee`**）、
  `GET /seal/requests/pending-count`（**必须排在 `/seal/requests/:id` 之前**）。测试认 `data-slot="approval-pending-links"`。
- **考勤申述 = 第四种 `type: 'appeal'`**（界面名「考勤申述」）：表单只有 **发生日期 + 申述类型 + 事由 + 附件**；
  `startAt/endAt/durationMinutes` 是**条件 required**（`this.type !== 'appeal'`）；`occurredOn` 定台账归属，**审批加月锁也按 `occurredOn.slice(0,7)`**。
  类型与可核减字段唯一来源 `utils/attendance-ledger-actual.js` 的 `APPEAL_TYPES/APPEAL_TYPE_LABELS/APPEAL_OFFSET_FIELDS`；
  **`APPEAL_OFFSET_FIELDS` 不含 `absence`**。**按申请单聚合时长的地方都要 `if (type === 'appeal') continue`**（否则崩在 `endAt.getTime()`）。
  核减只在**读时**（`withAppealOffset` 改 `suggestedActualMinutes`，说明写成 `appealOffsetLabel`，**不写库**）；
  `buildRows` 与 `actualSuggestionFor` 必须同口径。重复提交（同人/同日期/同类型 pending|approved）409。入口：侧栏与移动端首页各一对。

## 薪资：五险一金方案
- **费率不由员工标准决定**：租户级 `Tenant.settings.payrollContributionScheme` 给费率，员工只填基数。
  `单位社保 = 公司基数 × 五险单位合计%`；`个人社保 = 个人基数 × 五险个人合计% + 医疗个人固定额`。
- 默认值唯一来源 `utils/payroll-calculations.js` 的 `DEFAULT_CONTRIBUTION_SCHEME`；前端 `utils/payroll.ts` 同一份兜底
  （**改口径要同时改两处**）；`models/Tenant.js` 不写默认值。
- `PayrollStandard` 的**四个费率字段已废弃**（`withContributionSchemeRates` 对齐成方案值）；前端两个 Input 只含基数。
- `GET/POST /attendance/payroll/contribution-scheme`：读＝薪资读者，写＝**仅财务**。入口 = 工具栏 → **左侧抽屉**（576px）；
  坑：宽度要用**同名修饰符**覆盖（`DrawerContent` 自带 `sm:max-w-sm`，tailwind-merge 不去重）、`direction` 是 `DrawerRoot` 属性、
  vaul `shouldScaleBackground` 要关。
- **`constants/payroll-fields.ts` 的 `showPayrollPayments = false`**：发放状态/已付/剩余/收退款登记整块隐藏（三处共用）；
  **接口与数据保留，别删代码**。

## 工资条发布 / 再发布
- **前置 = 当月考勤已结账**：`monthLedgerStatus(tenantId, month)` → `closed|open|missing`（**没建台账也算未结账**）；
  单条与批量共用，`listStatements` 也复用它下发 `ledgerStatus`。
- **强制发布**：`force === true` 才放行，**不要求填原因**，仍限财务；批量「抢锁后统一判一次」，未结账且没开 force → 整批 409。
- **未结账月份可直接改已发布工资条并再发布**（用户定的口径）：`canEditStatement(row)` = `canEdit && (status !== 'published' || !ledgerSettled)`；
  改完生成修订草稿 → 再发布即第 N+1 版，**不必先撤回**。**已结账反过来**：`saveDraft` 里
  `existing.currentPublishedRevision && 台账 closed` → 409「请先撤回再修改」；守卫放在**版本校验之前**且用 `currentPublishedRevision` 短路。
- **留痕**：`PayrollStatement.events` 写 `action:'forced_publish'` + `ledgerStatus`；`eventSchema.reason` **只在 `action === 'withdrawn'` 时必填**
  （加事件动作要同步改 enum）。`serializeStatement` 只导出**当前有效发布版**的 `forcedPublish`（撤回/再发布后旧标记自然消失，事后结账**不覆盖**）。
- **文案分两种口径**：`ledgerSettled` 决定「过渡版本（不必撤回）」还是「定稿（先撤回）」；未结账时标题/按钮改「强制发布」并给警示块。

## 薪资统计
- 时长唯一来源 `attendance-ledger.js` 的 **`getPayrollAttendanceSummary(tenantId, months, employeeId?)`**（复用 `aggregateApprovedRequests`）。
  **别在 payroll.js 里另写时长聚合** → 口径必漂移。
- 单位：**出差 = 日历天数**（自然日计数，不是分钟折算）、**加班 = 小时**、**请假与旷工 = 天**（用 `dayMinutes` 折）。
  金额取**已发布工资条**：请假 = 病假 + 事假、旷工 = 旷工扣款、加班 = 加班补贴；**无出差补贴字段 → 出差写「无金额项」**。
  金额为 0 写 ¥0.00（「—」在本仓语义是「取不到数」）。
- **旷工无独立登记**，按台账缺口推导 `应出勤 − 实到 − 请假 − 迟到/早退/无打卡扣减`（下限 0）。只算 `confirmed` 且有整数
  `actualMinutes` 的人，其余跳过并回报 `absenceSkippedCount`。**`requiresLeaveReconciliation` 必须跳过**。
  应出勤：闭月用快照 `row.expectedMinutes`，开月按当前日历重算；算不出**不抛错**，只跳过。
- 考勤块整块 `.catch()` 兜住（**`dayMinutes === null` = 整块不可用**），**它挂了不能让工资计提报错**。
- **页面形态（2026-10-03 用户定）**：考勤四项**并进按月那张表**（列 `月份|工资条|收入合计|工资总额|出差|加班|请假|旷工|实发金额`），
  **不再有独立的「考勤统计」区块**，也没有期间 4 张合计卡；每格两行（时长 + 金额）。**多个月份时才补一行「合计」**（月度模式不加）。
  旧的「请假与旷工」列被「请假 / 旷工」两列取代（`attendanceDeductionCents` = 病假 + 事假 + 旷工，信息不丢）。
  考勤口径没读到时时长写「—」、金额照旧。

## 站内通知
- `models/Notice.js` + `/notices`、`/unread-count`、`/:id/read`、`/read-all` + 顶栏 `notice-bell.vue`（60s 轮询）。
  **`Notice.link` 是前端可直接 `router.push` 的路径**；写通知一律 try/catch。登录弹窗挂 **`App.vue`**（watch 用 `(isLogin, wasLogin)`）。
- **两类审批的 decision 不一致**：考勤 `approve|reject`，用章 `approved|rejected`。**测试必须打桩 `Notice.create`**（否则 2s → 85s）。

## 移动端适配
- 模块首页 = `pages/mobile/{attendance,payroll,seal}.vue` + `hub-shell.vue` + `use-module-hub.ts` + `hub-group.vue`；入口在
  `dashboard-mobile.vue` 常用功能**上方**。hub 页**别另起 sticky 标题栏**（模块名会显示两遍）。
- **权限判据唯一来源 `utils/module-access.ts`**（`canApproveAttendance/canManagePayroll/canApproveSeal/canManageSeal/isSealCustodian`）。
- 适配一律 `useDevice()` + `v-if="isMobile"` 卡片分支、`v-else` 桌面表格；**不动接口/权限/数据结构**。

## 工资条小票
- `components/payslip-receipt.vue` 挂在 `payslip-table.vue` 第三档「工资小票」（默认「按行列」）；移动端 `payroll/my.vue` 一张月份一张。
- **纸头 = 姓名进标题**（「张三工资条」），纸头下**只留工号与部门**（`publishedAt` prop 已删，调用点要一起清）。
- **分组口径必须复用 `constants/payroll-fields.ts`** 的 keys，别再写一份字段表。
- **坑：scoped 里 `:global(.dark) .x` 会被编译丢掉** → 改用 Tailwind 任意属性变量；阴影必须挂**外层**（同元素 filter 会被 mask 裁掉）。

## 前端页面约定
- `fieldwork` 界面一律叫**「出差」**（key 不变）；展示名源头：`constants/attendance-labels.ts` + 后端 `ATTENDANCE_TYPE_LABELS` + `sidebar-data.ts`。
- **页内 h1 保留**（左 h1 + 紧跟说明 + 右操作按钮）；只有左边已有页签的页面（台账、待我审批/审核记录、用章）不放 h1。
  面包屑写 `layouts/default.vue` 的 `routeMap`。
- **考勤设置三个视图由左侧菜单驱动**（`?tab=people|payroll|calendar`）；可见性规则 `utils/attendance-settings.ts` **菜单与页面共用一份**。
- **「我的申请」「待我审批」在左侧菜单**按类型拆子项（`?type=leave|overtime|fieldwork|appeal`，读参数 `composables/use-request-type.ts`）；
  **「审核记录」不分类型**；「用章审批」**没有独立页面**（→ `/seal/requests?view=inbox`）。
- **错误状态不许渲染成空状态**：读取失败显示「读取失败 + 重试」。
- 金额用**系统字体栈** + `tabular-nums` + 右对齐。**内部/运维功能不要放进用户界面**。
- **UI 基调：收敛、克制、常规**——细则见 `AGENTS.md` §5。
