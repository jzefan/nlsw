# nlsw-saas 项目长期笔记

只留「不看就会做错」的判据与易踩的坑，叙事性背景一律删。

## 环境 / 验证
- 后端 `npm run dev`（`node --watch app.js`）；`npm start` / `dev:saas` 是裸 `node app.js` —— **改后端必须重启**。
  `--watch` 不监听 `.env` / `views` / `public` / `data` / `uploads`。**别 kill 用户正在跑的进程**。
- 端口：后端 1080、前端 vite 5173。`deploy/ecosystem.config.js` 是服务器 pm2 配置，本机没装 pm2。
- `npm run lint` **跑不起来**（v8 的 `.eslintrc.json` vs ESLint 9）——既有问题。
- 类型检查 `npx vue-tsc -b`；构建校验 `npx vite build --outDir .build-checkMMDD --emptyOutDir`（**每次换新目录名**，
  复用会撞沙箱批量删除保护）；全量测试 `node --test test/*.test.js`。
- 验证分级 L0–L3 见 `AGENTS.md` §2 与用户级 MEMORY.md。

## 免密码验证（复用在线会话）
- Mongo `sessions`（`session` 是 **JSON 字符串**），按 `s:<sid>.<HMAC-SHA256(sid,SESSION_SECRET)>` 拼 `connect.sid`，
  直打 1080 接口 / 注入 playwright。**别写死 sid**，按目标用户 + 探 `/me` 动态挑。
- playwright 用 `require('playwright-core')` + `NODE_PATH=<workbuddy workspace node_modules>:<项目>/node_modules`；
  拦截接口用**端口 + pathname 谓词**，**别用 `**/xxx**`**（会连 vite 的 `/src/pages/xxx/index.vue` 一起拦 → 白屏）。
  **移动端下 `Sidebar` 在关闭的 Sheet 里、不进 DOM**（`data-slot="sidebar"` 查不到）→ 等待条件用 `[data-slot="sidebar-wrapper"]`。
  **断言侧栏入口别只看 DOM**：「我的申请」「待我审批」是**折叠分组**，子链接默认不在 DOM 里 → 会误判「入口没加」。
  从组件 `setupState.navMain` 读菜单树（全 DOM 扫 `__vueParentComponent` 找持有 `navMain` 的实例），或先点开分组再查 DOM。
  完整脚本见技能 `live-session-api-replay`。

## 角色与权限
- **管理员 ≠ owner**：管理员 = `privilege` 含 `'admin'`（`utils/permissions.js`）；owner = `role === 'owner'`。
- 守卫：`requireExactOwner`（仅主账号）、`requirePeopleManager`（owner 或 admin）。
- **总经理** = `attendanceRoles` 含 `general_manager`，租户内唯一（`User.attendanceGeneralManagerTenantId`，`select:false`，
  由「用户管理 → 职位」同步）；代理审批人 = `Tenant.settings.attendanceGeneralManagerDelegateId`。
  审批链**不加部门主管一级、不留「可配置审批层级」开关**（实测被否）。催办链的「通知部门主管」是 `user.managerId`（上报对象，非审批人）。
- **审批权不看角色**：`reviewRequest` 只认审批链里的 `approverId`，派单按申请人 `managerId` ——「勾了 manager」≠「被设为直属经理」
  → 会出现「收得到单子没入口」「空入口」。要收敛就按 `User.exists({managerId: 自己})` 推导。
- **三个考勤角色别删**：`attendance_admin`（工作日历、月台账结账/重开、全公司范围、读任意附件）；
  `manager` 只管入口与范围（自己申请跳过直属经理、团队申请/台账、侧栏「待我审批」）。
- `requireEmployee` 需**有工号**，覆盖 `/attendance/requests*` 与 `GET /attendance/payroll/my`，
  缺工号返回 `code:'EMPLOYEE_NO_MISSING'`（前端 `isEmployeeNoMissing()`，**别匹配文案**）。
  **存量账号普遍没工号**（12 个里 7 个，含 admin）→ 给可操作引导，别只抛报错。
- `models/User.js` 的 `mustChangePassword` 是 `default: undefined` + 守卫 `!== true`（放行），注释与代码相反。

## 编号 / 流水号
- **本仓没有流水号发生器**（`models/OrderNumber.js` 是去重字典）。租户内自增号：独立集合 +
  `findOneAndUpdate({tenantId},{$inc:{n:1}},{upsert:true,new:true})` + 业务表唯一索引；**别用 `countDocuments()+1`**。

## 工作日历（国务院安排）
- 三层来源：内置 `YEARLY_SCHEDULES`（离线兜底）→ `holiday_calendars`（全国数据**故意不挂 tenantId**）→ 线上 `china-holiday-source.js`。
- `getChinaAttendanceCalendar(year)` 必须**同步**；异步的 `ensureChinaAttendanceCalendar(year)` **只在 `GET /attendance/calendar`**；
  `loadChinaAttendanceCalendar()` 在 app.js 预热。**别把抓取塞进同步链路。**
- **「某天算不算工作日」唯一入口 = `workIntervalMinutes(date, policy)`**（有效分钟数或 `null`）。
  优先级：租户单日覆盖 > 国务院安排 > 周六上午 > 周一至周五。新增规则只改这里。
- 星期一律 `new Date(date+'T00:00:00.000Z').getUTCDay()`。月度应出勤**与人员无关**，整月只算一次；未结账月份不沿用快照。
- 日历角标：`休` / `班`（**只画周末**）/ `半`（中性底）。年度下拉 `2026 .. 当前年份+10`。
- 测试不走真实网络（注入 fetch；mock `HolidayCalendar.findOne()` 那层是 Query，要还原 `.lean()`）。

## 考勤月台账
- **两层状态**：整月 `status: open|closed`（`open` 时应出勤按当前日历实时重算；`closed` 读结账快照，改要「重新开启」+ 填原因，
  写 `AttendanceLedgerAudit`）；每人一行 `confirmationState: pending|confirmed|no_basis`（`confirmed` 必须有非负整数实到，
  `no_basis` 必须填原因且实到留空）。
- **结账前置（`closeMonth` 硬校验，缺一即 409）**：有 pending / confirmed 无分钟 / no_basis 无原因或有实到 /
  `requiresLeaveReconciliation`。确认与结账仅 **主账号 + `attendance_admin`**（`isMonthAdmin`）。
  可见范围：主账号/考勤管理员/总经理=全公司，经理=团队，其余=本人。
- **「无依据」≠「没出勤」**（＝手上有依据地算不出实到），与「已确认 + 实到 0」是硬口径差异；**拿不准填无依据，不许用 0 冒充**。
- **台账的实到不参与算钱**：工资条「请假与旷工扣款」财务手填；工资表明细「当月考勤时长」来自**已通过的申请单**
  （`getMonthlyAttendanceSummary`），不依赖台账是否确认。
- **系统不登记「实际加班 / 实际出差」**：那两行写死文案 2026-09-30 已删，**别加回来**。
- **加班补偿方式三种**：调休 `comp_time` / 加班费 `overtime_pay` / 无补偿 `none`（申请必选、**默认无补偿**；
  `ALLOWED_COMPENSATION` 与模型 enum 同步）。展示名统一「**无补偿**」（别写「不补偿」）。
  **加班总时长与方式无关**，三种都进 `overtimeApprovedMinutes`；台账「已批加班」格第二行用 `overtimeMethodLabel()` 列
  **真有时长的**方式（`调休 1 小时 · 无补偿 1 小时`），**不写零**。该格要 `whitespace-normal`。
- **待审批只作提示**：`buildRows` 一次 `status:{$in:['approved','pending']}` 查询后按状态切开，`pending*` 不并入「已批」口径、
  不参与实到；界面非零时多一行「待审批 X 小时」。**改这个查询会连坐测试**（夹具必须带 `status`，否则被当成 pending）。
- **导入考勤记录**（迟到/早退/无打卡/备注）：`POST /attendance/ledger/import`（`isMonthAdmin`、已结账 409、**只更新传入字段**、
  逐条返结果、走月份并发锁）；前端 `components/LedgerImportDialog.vue`。
  **只登记次数**（不改实到与确认状态）；请假**不导入**；空单元格不动原值、`0` 有效。
  解析按**表头文字**识别列（两级表头也认），表尾注释行用 `isNonEmployeeLabel` 跳过。
  报错文案用中文列名（`IMPORT_FIELD_LABELS`），**别漏出 `lateTotal` 这类 key**。
- **实到分钟自动计算**：`实到 = 应出勤 − 请假合计 − 迟到/早退/无打卡扣减`，下限 0。
  默认值唯一来源 `utils/attendance-ledger-actual.js` 的 `DEFAULT_ACTUAL_RULE`；租户配置
  `Tenant.settings.attendanceLedgerActualRule`，界面在「考勤设置 → 工作日历设置」，**字段标签由后端 `ACTUAL_RULE_FIELDS` 下发**。
  **建议值只算不写库**（读时附 `suggestedActualMinutes/suggestedActualNote/actualMinutesIsManual`），保存那行才落库
  （`actualMinutesSource='auto'|'manual'`）；`auto` 由服务端核对（saveRow 多一次 `AttendanceRequest.find`，**测试要打桩**）。
  不覆盖判据 `isActualManual(row)`：无来源标记的旧行「有值即人工」。
  不给建议值：`requiresLeaveReconciliation`、本月无应出勤；扣成负数按 0；只导入「迟到合计」未分档 → 不扣。
  前端必须有 `effectiveActualMinutes(row)`，`makeDraft`/`isRowDirty` 都用它（否则一进页面就判成「未保存修改」，挡住切月与结账）。

## 表格页列可见性断言（踩过）
shadcn `Table` 自带 `[data-slot="table-container"]`（`overflow-auto`），单元格溢出时**外层容器 `scrollWidth` 仍等于 clientWidth**
→ 只看外层必误判；判据与脚本见技能 `live-session-api-replay`。`TableCell` 自带 `whitespace-nowrap`，改文案后重量一次。

## 考勤申请 / 审批 / 附件
- 三个入口（我的申请 / 待我审批 / 审核记录）**共用 `RequestList.vue`**；详情是展开行（时间线 `components/RequestTimeline.vue`：
  提交 → 逐级审批 →（撤回），状态 `等待中|已通过|已驳回|未进行`）；审批角色标签在 `constants/attendance-labels.ts` 的 `approvalRoleLabels`。
- **审批人姓名由后端序列化注入**：审批链只存 `approverId`，`controllers/api/attendance.js` 的 `approverNameMap()` →
  `serializeRequest(request, approverNames)` 写 `approvals[].approverName`。**坑（前端一直显示「等待 审批」）**：`approvals` 是
  mongoose 子文档，schema 里没有的字段直接赋值会被 **strict 静默丢掉** → 展示字段一律走序列化注入。
- **时长口径**：请假 = **折算天数**（÷ 每日工作分钟，取 `calendarMinutesPerWorkday(year)`，取不到按 480）、出差 = **日历天数**
  （含首尾）、加班 = **小时**；详情头部只显示部门，**不显示工号与职务**；轮到自己写「等待您的审批」。
- **附件按类型分流**：`canPreviewAttachment` → 图片/PDF 内联预览（`AttachmentPreviewDialog.vue`），Word/Excel 只下载
  （`title="下载后查看"`）。**预览必须用本地 blob**（附件接口要登录态，跨端口拿不到 cookie）。
- **测试桩**：`test/attendance.test.js` 顶部有文件级 `User.find = () => queryResult([])`（不桩就白等缓冲超时，1s → 81s）；
  **自定义 `User.find` 桩要同时支持 `.lean()`**。改查询链时 grep 测试里的自定义桩。
- **待办提示只有审批页那一行**（跨考勤与用章）：`components/approval/ApprovalPendingLinks.vue`，数据来自 `stores/approvals`
  （侧栏挂载 `start()`：立即 + 60s 轮询）。**侧栏菜单不加角标**（用户否过）。
  计数接口 `GET /attendance/approvals/pending-counts`（**别挂 `requireEmployee`**）、`GET /seal/requests/pending-count`
  （**必须排在 `/seal/requests/:id` 之前**）；口径 = 列表 inbox。坑：待办链接与页签链接 href 相同，测试认 `data-slot="approval-pending-links"`。
- **考勤申述 = 第四种 `type: 'appeal'`**（界面名「考勤申述」，用户定的），复用同一条链路与审批链。
  表单只有 **发生日期 + 申述类型 + 事由 + 附件**；`startAt/endAt/durationMinutes` 改成**条件 required**
  （`this.type !== 'appeal'`）——**不给申述造假的整点时段**；`occurredOn` 按发生日期归属台账月份，
  **审批加月锁也按 `occurredOn.slice(0,7)`**。
  类型与可核减字段的唯一来源 `utils/attendance-ledger-actual.js` 的 `APPEAL_TYPES / APPEAL_TYPE_LABELS / APPEAL_OFFSET_FIELDS`，
  **`APPEAL_OFFSET_FIELDS` 不含 `absence`**（旷工在台账没有计数列，只留痕不核减）。**任何按申请单聚合时长的地方都要
  `if (type === 'appeal') continue`**（`aggregateApprovedRequests` 少这一句会直接崩在 `endAt.getTime()`）。
  核减只在**读时**生效：`withAppealOffset` 改 `suggestedActualMinutes`，说明写成派生的 `appealOffsetLabel`
  （台账备注列 + 建议值 note 两处都显示），**不写库**；`buildRows` 与 `actualSuggestionFor` 必须同口径，否则
  「采用系统建议值」会被记成人工值。重复提交（同人/同日期/同类型，pending|approved）一律 409。
  前端入口：侧栏与移动端首页各一对（我的申请→考勤申述、待我审批→申述审批）；页内标题**不拼「申请」后缀**。

## 薪资：五险一金方案
- **费率不由员工标准决定**：租户级 `Tenant.settings.payrollContributionScheme` 给费率，员工只填基数（公司/个人各一个）。
  `单位社保 = 公司基数 × 五险单位合计%`；`个人社保 = 个人基数 × 五险个人合计% + 医疗个人固定额`。
- 默认值唯一来源 `utils/payroll-calculations.js` 的 `DEFAULT_CONTRIBUTION_SCHEME`；前端 `utils/payroll.ts` 同一份兜底
  （**改口径要同时改两处**）；`models/Tenant.js` 不写默认值。
- `PayrollStandard` 的**四个费率字段已废弃**（由 `withContributionSchemeRates` 对齐成方案值）；前端两个 Input 只含基数。
- `GET/POST /attendance/payroll/contribution-scheme`：读＝薪资读者，写＝**仅财务**。已发布工资条是快照不受影响。
  边界：基数为 0 时个人社保仍有 ¥3.00。
- 工资条 `components/payslip-table.vue` 两端共用：**只暴露「发布日期」，不暴露版本号**。
- **`constants/payroll-fields.ts` 的 `showPayrollPayments = false`**：发放状态/已付/剩余/收退款登记整块隐藏（三处共用）；
  **接口与数据保留，别删代码**。
- 五险一金方案入口 = 工具栏 → **左侧抽屉**（576px）。坑：宽度用**同名修饰符**覆盖（`DrawerContent` 自带
  `data-[vaul-drawer-direction=left]:sm:max-w-sm` 与 `sm:max-w-lg` 不同名，tailwind-merge 不去重）；**`direction` 是 `DrawerRoot` 的属性**；
  vaul 的 `shouldScaleBackground` 要关。

## 站内通知
- `models/Notice.js` + `/notices`、`/unread-count`、`/:id/read`、`/read-all` + 顶栏 `notice-bell.vue`（60s 轮询）。
  **`Notice.link` 是「前端可直接 `router.push` 的路径」**（可带 query）；写通知一律 try/catch，失败只 warn。
- 登录弹窗挂 **`App.vue`**（不放 default 布局）；**watch 用 `(isLogin, wasLogin)`** 区分「刚挂载」与「真的登出」。
- **两类审批的 decision 取值不一致**：考勤 `approve|reject`，用章 `approved|rejected`。
- **测试必须打桩 `Notice.create`**（否则每条提交/审批用例白等超时，2s → 85s）。

## 移动端适配
- 模块首页 = `pages/mobile/{attendance,payroll,seal}.vue` + `components/hub-shell.vue`（**页内标题行**：← 返回首页 + h1 + 模块胶囊）
  + `composables/use-module-hub.ts`（入口分组）+ `components/hub-group.vue`；首页入口在 `dashboard-mobile.vue` 常用功能**上方**。
  hub 页**别另起 sticky 标题栏**——会和 `layouts/default.vue` 顶栏把模块名显示两遍。
- **权限判据唯一来源 `utils/module-access.ts`**（`canApproveAttendance / canManagePayroll / canApproveSeal / canManageSeal / isSealCustodian`），
  `sidebar-data.ts` 与模块首页共用——**改可见性只改这里，别两边各写一份**。
- 页面适配一律 `const { isMobile } = useDevice()` + 模板 `v-if="isMobile"` 卡片分支、`v-else` 保留原桌面表格；
  **不动接口 / 权限 / 数据结构**。考勤申请详情两端共用 `pages/attendance/components/RequestDetailPanel.vue`。
  移动端逐页验收的判据与坑见技能 `live-session-api-replay`。

## 工资条小票样式
- 组件 `components/payslip-receipt.vue`（纸色底 + 虚线分隔 + 点线引导 + 左右/下沿撕边）；
  挂在 `payslip-table.vue` 的查看方式第三档「小票」（另有 `按行列 / 一行展示`，默认仍是 `按行列`）。
  移动端两页直接用：`payroll/my.vue` 一条月份一张小票；`statements.vue` 展开区是小票。
- **分组口径必须复用 `constants/payroll-fields.ts`** 的 `payrollIncomeKeys / payrollAttendanceDeductionKeys /
  payrollEmployeeDeductionKeys / payrollEmployerContributionKeys / payrollTotalsLabels`，别再写一份字段表。
- 撕边用 `mask-image` 四层 + `mask-composite: intersect`（不支持时退化成矩形，不影响可读性）；
  阴影必须挂在**外层**（同元素的 filter 会被 mask 裁掉）。期间文案用 `formatPayrollMonthLabel()`。
- **坑：scoped 样式里的 `:global(.dark) .x` 会被编译丢掉**（实测产物里没有这条规则，深色覆盖静默失效）。
  组件级深色改用 Tailwind 任意属性变量：`[--receipt-paper:#f8f4ea] dark:[--receipt-paper:#221f1c]`。

## 前端页面约定
- `fieldwork` 界面一律叫**「出差」**（key 不变）。展示名源头：`constants/attendance-labels.ts` + 后端 `ATTENDANCE_TYPE_LABELS` +
  `sidebar-data.ts`（别漏台账/工资表列头）。考勤页在 `pages/attendance/`，局部组件放 `pages/attendance/components/`。
- **页头形态**：左 `h1.text-lg font-semibold` + 紧跟 `mt-1 text-xs text-muted-foreground` 说明（**只差 4px**）+ 右操作按钮。
  **页内 h1 保留**；只有左边已有页签的页面（台账、待我审批/审核记录、用章）不放 h1。
- 面包屑写 `layouts/default.vue` 的 `routeMap`；**同路径按 query 给不同标题时值写成函数**（`useRoute()` 是 reactive）。
- **考勤设置三个视图由左侧菜单驱动**（`?tab=people|payroll|calendar`）；可见性规则 `utils/attendance-settings.ts`
  **菜单与页面共用一份**；缺参数要 `router.replace` 补上。
- **「我的申请」「待我审批」在左侧菜单**，按类型拆子项（`?type=leave|overtime|fieldwork`，读参数在
  `composables/use-request-type.ts`）；**「审核记录」不分类型**；「用章审批」**没有独立页面**（→ `/seal/requests?view=inbox`）。
  页签用**胶囊按钮**，不用下划线 tab。
- **列表页「页签 + 操作」合并成一行工具栏**（胶囊在左、筛选与操作在右，`border-b pb-2`）；台账右侧控件组 `v-show="activeView === 'detail'"`。
- **错误状态不许渲染成空状态**：读取失败显示「读取失败 + 重试」，不能显示「暂无申请 / 暂无已发布工资条」。已踩过两次。
- 金额用**系统字体栈** + `tabular-nums` + 右对齐。
- **UI 基调：收敛、克制、常规**——细则见 `AGENTS.md` §5，交付前与同屏元素对比。
- **内部/运维功能不要放进用户界面**（如孤儿并发锁恢复只留后端接口）。
