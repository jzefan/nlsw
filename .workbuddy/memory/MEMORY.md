# nlsw-saas 项目长期笔记

## 环境 / 验证
- 后端 `npm run dev`（`node --watch app.js`，改 .js 自动重启）；`npm start` / `dev:saas` 是裸 `node app.js` —— **改后端必须重启**
  （症状：新字段/新文案拿不到）。`--watch` 不监听 `.env` / `views` / `public` / `data` / `uploads`。**别 kill 用户正在跑的进程**。
- 端口：后端 1080、前端 vite 5173。`deploy/ecosystem.config.js` 是服务器 pm2 配置，本机没装 pm2。
- `npm run lint` **跑不起来**（仓里 v8 的 `.eslintrc.json`，npx 解析到 ESLint 9）——既有问题，别当自己改坏了。
- 类型检查 `npx vue-tsc -b`（增量 ~40s）；构建校验 `npx vite build --outDir .build-checkMMDD --emptyOutDir`（**每次换新目录名**，
  复用会撞沙箱批量删除保护；看 `✓ N modules transformed`）。全量测试 `node --test test/*.test.js`（`test/` 目录在 Node 22 报 MODULE_NOT_FOUND）。
- 验证分级 L0–L3 见用户级 MEMORY.md 与 `AGENTS.md`。

## 免密码验证（复用在线会话）
- 会话在 Mongo `sessions`（`session` 是 **JSON 字符串**），按 `s:<sid>.<HMAC-SHA256(sid,SESSION_SECRET) 去=>` 拼 `connect.sid`，
  即可直打 1080 接口 / 注入 playwright 免密码开受保护页面。**别写死 sid**（重登即失效），按目标用户 + 探 `/me` 动态挑。
- playwright 用 `require('playwright-core')` + `NODE_PATH=<workbuddy workspace node_modules>:<项目>/node_modules`；
  拦截接口用**端口 + pathname 谓词**，**别用 `**/xxx**`**（会连 vite 的 `/src/pages/xxx/index.vue` 一起拦，页面白屏）。
  完整脚本与其余坑见技能 `live-session-api-replay`。

## 角色与权限
- **管理员 ≠ owner**：管理员 = `privilege` 含 `'admin'`（`utils/permissions.js`）；owner = `role === 'owner'`（公司主账号）。
- 守卫：`requireExactOwner`（仅主账号）、`requirePeopleManager`（owner 或 admin）——用户说「由管理员维护」照后者写。
- **总经理** = `attendanceRoles` 含 `general_manager`，租户内唯一（`User.attendanceGeneralManagerTenantId`，`select:false`，
  由「用户管理 → 职位」同步）；代理审批人 = `Tenant.settings.attendanceGeneralManagerDelegateId`。
  审批链「一般是总经理」时**别加部门主管一级，也别留「可配置审批层级」开关**（实测被否）。
  催办链的「通知部门主管」是 `user.managerId`（**上报对象，非审批人**）。
- **审批权不看角色**：`reviewRequest` 只认审批链里的 `approverId`，派单按申请人 `managerId` ——「勾了 manager」≠
  「被设为直属经理」，会出现「收得到单子没入口」「空入口」。要收敛就统一按 `User.exists({managerId: 自己})` 推导。
- **三个考勤角色**（别凭直觉删）：`attendance_admin` 是刚需（工作日历、月台账结账/重开、全公司范围、读任意附件）；
  `manager` 只管**入口与范围**（自己申请跳过直属经理、团队申请/台账、侧栏「待我审批」）。
- `requireEmployee` 需**有工号**，覆盖 `/attendance/requests*` 与 `GET /attendance/payroll/my`，
  缺工号返回 `code:'EMPLOYEE_NO_MISSING'`（前端 `isEmployeeNoMissing()` 判断，**别匹配文案**）。
  **存量账号普遍没工号**（12 个里 7 个没有，含 admin）→ 要给可操作引导而不是一句报错。
- `models/User.js` 的 `mustChangePassword` 是 `default: undefined` + 守卫 `!== true`（放行），注释与代码相反。

## 编号 / 流水号
- **本仓没有流水号发生器**（`models/OrderNumber.js` 是「已用编号去重字典」，不是计数器）。要租户内自增号：
  独立集合 + `findOneAndUpdate({tenantId},{$inc:{n:1}},{upsert:true,new:true})` + 业务表唯一索引；**别用 `countDocuments()+1`**。

## 工作日历（国务院安排）
- 三层来源：内置 `YEARLY_SCHEDULES`（离线兜底）→ `holiday_calendars` 集合（全国数据**故意不挂 tenantId**）→
  线上 `china-holiday-source.js`。某年首次被需要时抓一次，**成功才落库**。
- `getChinaAttendanceCalendar(year)` 必须**同步**；异步的 `ensureChinaAttendanceCalendar(year)` **只在 `GET /attendance/calendar`**；
  `loadChinaAttendanceCalendar()` 在 app.js 连库后预热。**别把抓取塞进同步链路。**
- **「某天算不算工作日」唯一入口 = `workIntervalMinutes(date, policy)`**（返回有效分钟数或 `null`）。
  优先级：租户单日覆盖 > 国务院安排 > 周六上午 > 周一至周五。新增规则只改这里。
- 星期一律 `new Date(date+'T00:00:00.000Z').getUTCDay()`。月度应出勤**与人员无关**，整月只算一次；未结账月份不沿用快照。
- 日历角标：`休` / `班`（**只画周末**）/ `半`（中性底，别用玫瑰底）。年度下拉 `2026 .. 当前年份+10`。
- 测试不走真实网络（注入 fetch；mock `HolidayCalendar.findOne()` 那层是 Query，要还原 `.lean()`）。

## 考勤月台账
- **两层状态**：① 整月 `status: open|closed`——`open` 时**应出勤按当前日历实时重算**；`closed` 后读结账快照 `closedSnapshot`，
  要改必须「重新开启」并填原因（写 `AttendanceLedgerAudit`）。
  ② 每人一行 `confirmationState: pending|confirmed|no_basis`——`confirmed` 必须有非负整数实到，`no_basis` 必须填原因且实到留空。
- **结账前置（`closeMonth` 硬校验，缺一即 409）**：有 pending / confirmed 无分钟 / no_basis 无原因或有实到 /
  `requiresLeaveReconciliation`（请假未按天分摊，界面提示「请假分配待核对」）。
  确认与结账仅 **主账号 + `attendance_admin`**（`isMonthAdmin`）。可见范围：主账号/考勤管理员/总经理=全公司，经理=团队，其余=本人。
- **「无依据」不是「没出勤」**，而是**手上有依据地算不出实到**。与「已确认 + 实到 0」（＝有依据认定一分钟没到）是硬口径差异，
  **拿不准就填无依据，不许用 0 冒充**。
- **台账的实到不参与算钱**：工资条「请假与旷工扣款」由财务手填；工资表明细「当月考勤时长」来自**已通过的申请单**
  （`getMonthlyAttendanceSummary`），不依赖台账是否确认。
- **系统不登记「实际加班 / 实际出差」**：只有已批时长 + 人工确认的实到。那两行写死文案 2026-09-30 已删，**别加回来**。
- **加班补偿方式三种：调休 `comp_time` / 加班费 `overtime_pay` / 无补偿 `none`**（2026-09-30 加 `none`，
  申请时必选、**默认「无补偿」**；`ALLOWED_COMPENSATION` 与模型 enum 同步。
  展示名统一是「**无补偿**」，别写成「不补偿」——用户改过口径）。**加班总时长与方式无关**，三种都进 `overtimeApprovedMinutes`；
  台账「已批加班」格第二行用 `overtimeMethodLabel()` 列出**真有时长的**方式（`调休 1 小时 · 无补偿 1 小时`），
  **不写零**——用户明确否掉过「调休 0 小时 · 加班费 0 小时」那种每行都写零的样子。该格要 `whitespace-normal`，三种方式齐了会换行。
- **待审批申请的提示**：`buildRows` 一次 `status: {$in:['approved','pending']}` 查询后按状态切开，`pending*` 字段只作提示，
  **不并入任何「已批」口径、不参与实到**；界面只在非零时多一行「待审批 X 小时」，待审批请假未按天分摊则只写「未按天分摊」。
  **改这个查询会连坐测试**：夹具必须带 `status`，否则会被当成 pending（已踩过，3 个用例挂在夹具上）。
- **导入考勤记录**（迟到/早退/无打卡/备注）：`POST /attendance/ledger/import`（`isMonthAdmin`、已结账 409、
  **只更新传入字段**、逐条返结果、走月份并发锁）；前端 `components/LedgerImportDialog.vue` + 台账「考勤记录（导入）」列。
  - **只登记次数**：不改实到与确认状态（只作为实到自动计算的扣减依据）；请假**不导入**；空单元格不动原值、`0` 是有效值。
  - 解析按**表头文字**识别列（两级表头也认），列顺序不限；表尾注释/示例行用 `isNonEmployeeLabel` 跳过。
  - 报错文案用中文列名（`IMPORT_FIELD_LABELS`），**别漏出 `lateTotal` 这类 key**（会显示在界面上）。
- **实到分钟自动计算**（2026-09-30 定）：`实到 = 应出勤 − 请假合计 − 迟到/早退/无打卡扣减`，下限 0。
  - 默认值**唯一来源** `utils/attendance-ledger-actual.js` 的 `DEFAULT_ACTUAL_RULE`（0.5h / 1h / 1h / 1 个工作日）；
    租户配置存 `Tenant.settings.attendanceLedgerActualRule`，界面在「考勤设置 → 工作日历设置 → 实到分钟计算规则」，
    **字段标签/单位由后端 `ACTUAL_RULE_FIELDS` 下发**（前端不另写一份）；接口 `GET/POST .../actual-rule`（写＝`isMonthAdmin`）。
  - **建议值只算不写库**（读取时每行附 `suggestedActualMinutes / suggestedActualNote / actualMinutesIsManual`），
    保存那一行才落库（`actualMinutesSource = 'auto' | 'manual'`）；`auto` 由**服务端核对**（保存时重算比对，
    saveRow 因此多一次 `AttendanceRequest.find`，**测试必须打桩**）；已结账不算建议值。
  - 不覆盖判据 `isActualManual(row)`：`manual` → 保护；`auto` → 可重算；**无来源标记的旧行「有值即人工」**（免迁移）。
  - 不给建议值：`requiresLeaveReconciliation`、本月无应出勤；扣成负数按 0 计；只导入「迟到合计」未分档 → **不扣**。
  - 前端必须有 `effectiveActualMinutes(row)`（人工看实际值，否则看建议值），`makeDraft` / `isRowDirty` 都用它，
    否则一进页面就把预填值判成「未保存修改」，挡住切月与结账。

## 表格页验收：列可见性怎么断言（踩过，且是自查回归）
shadcn 的 `Table` 自带一层 `[data-slot="table-container"]`（`overflow-auto`），单元格溢出时**外层容器 `scrollWidth`
仍等于 clientWidth** → 只看外层必误判；判据与脚本见技能 `live-session-api-replay`。`TableCell` 自带 `whitespace-nowrap`，改文案后重量一次。

## 考勤申请 / 审批 / 附件（2026-10-01）

- 三个入口（我的申请 / 待我审批 / 审核记录）**共用 `RequestList.vue`**；详情是展开行不是弹窗（口径见
  `docs/attendance-request-workflow.md`）。**详情是时间线** = `components/RequestTimeline.vue`：
  提交 → 逐级审批 →（撤回），状态 `等待中|已通过|已驳回|未进行`（已结束的申请后面层级写「未进行」）；
  审批角色标签在 `constants/attendance-labels.ts` 的 `approvalRoleLabels`（别在组件里再抄一份）。
- **审批人姓名由后端序列化时注入**：审批链只存 `approverId`，`controllers/api/attendance.js` 的
  `approverNameMap(records)` → `serializeRequest(request, approverNames)` 写 `approvals[].approverName`。
  **坑（症状：前端一直显示「等待 审批」）**：`approvals` 是 mongoose 子文档，schema 里没有的字段
  直接赋值会被 **strict 模式静默丢掉**（不报错）——要给文档加「非持久化的展示字段」一律走序列化注入。
- **列表与详情的时长口径**：请假 = **折算天数**（÷ 每日工作分钟，8 小时 = 1 天；租户工作时段取
  `calendarMinutesPerWorkday(year)`，取不到按 480）、出差 = **日历天数**（起止含首尾）、加班 = **小时**；
  详情头部只显示部门，**不显示工号与职务**；时间线上轮到自己写「等待您的审批」（比 `approval.approverId` 与当前用户 id）。
- **附件按类型分流**：`utils/attendance-attachments.ts` 的 `canPreviewAttachment` → 图片与 PDF 内联预览
  （`components/AttachmentPreviewDialog.vue`：图片 `<img>`、PDF `<iframe>`，带下载与重试），Word / Excel 只能下载
  （`title="下载后查看"`）。**预览必须用本地 blob**：附件接口要登录态，直接给 `<img>/<iframe>` 在跨端口下拿不到 cookie。
- **测试桩**：`test/attendance.test.js` 顶部有文件级 `User.find = () => queryResult([])`（不桩就白等
  mongoose 缓冲超时，套件 1s → 81s）；**自定义 `User.find` 桩要同时支持 `.lean()`**，否则新加的
  `.select().lean()` 链会 TypeError。改查询链时 grep 测试里的自定义桩。
- **待办提示：只有审批页那一行**（2026-10-01，跨考勤与用章）：`components/approval/ApprovalPendingLinks.vue`
  按类型列出有待审批的入口，数据来自 `stores/approvals`（侧栏挂载时 `start()`：立即 + 60s 轮询，切页补拉，
  审完一条 `void refresh()`）。**侧栏菜单刻意不加角标**——用户明确否过（「不太好看」），别再往回加。
  计数接口 `GET /attendance/approvals/pending-counts`（**别挂 `requireEmployee`**，存量账号没工号会 403）、
  `GET /seal/requests/pending-count`（**必须排在 `/seal/requests/:id` 之前**）；口径必须等于列表 inbox。
  坑：待办链接与页签链接 **href 完全相同**，测试认 `data-slot="approval-pending-links"`。

## 薪资：五险一金方案
- **费率不由员工标准决定**：租户级 `Tenant.settings.payrollContributionScheme` 给费率，员工只填基数（公司/个人各一个）。
  `单位社保 = 公司基数 × 五险单位合计%`；`个人社保 = 个人基数 × 五险个人合计% + 医疗个人固定额`。
- 默认值**唯一来源** `utils/payroll-calculations.js` 的 `DEFAULT_CONTRIBUTION_SCHEME`；前端 `utils/payroll.ts` 是同一份兜底
  （**改口径要同时改两处**，接口返回值才权威）；`models/Tenant.js` 不写默认值。
- `PayrollStandard` 的**四个费率字段已废弃**（由 `withContributionSchemeRates` 对齐成方案值）；前端两个 Input 组件只含基数。
- `GET/POST /attendance/payroll/contribution-scheme`：读＝薪资读者，写＝**仅财务**。已发布工资条是快照不受影响。
  边界：缴费基数为 0 时个人社保仍有 ¥3.00，是按规则算的。
- 工资条 `components/payslip-table.vue` 两端共用：**只暴露「发布日期」，不暴露版本号**；版本/撤回属内部审计。
- **`constants/payroll-fields.ts` 的 `showPayrollPayments = false`**：「发放状态 / 已付 / 剩余 / 收退款登记」整块隐藏
  （工资表、我的工资条、薪资统计三处共用）；**接口与数据都保留**，别以为没做，也别删相关代码。
- 五险一金方案入口 = 工具栏 → **左侧抽屉**（576px）。三个坑：宽度要用**与组件同名的修饰符**覆盖（`DrawerContent` 自带的
  `data-[vaul-drawer-direction=left]:sm:max-w-sm` 与 `sm:max-w-lg` 不同名、tailwind-merge 不去重）；**`direction` 是
  `DrawerRoot` 的属性**（放 `DrawerContent` 会静默退回底部抽屉）；vaul 默认 `shouldScaleBackground` 要关掉。

## 站内通知
- `models/Notice.js` + `/notices`、`/unread-count`、`/:id/read`、`/read-all` + 顶栏 `notice-bell.vue`（60s 轮询）。
  **`Notice.link` 的约定是「前端可直接 `router.push` 的路径」**（可带 query）；写通知一律包 try/catch，失败只 warn。
- 登录弹窗挂 **`App.vue`**（不放 default 布局）；**watch 必须用 `(isLogin, wasLogin)` 区分「刚挂载」与「真的登出」**
  （只写 `else` 清标记会刷新后重复弹）。
- **两类审批的 decision 取值不一致**：考勤 `approve|reject`，用章 `approved|rejected`。
- **测试里必须打桩 `Notice.create`**（否则每条提交/审批用例白等缓冲超时，套件 2s → 85s）。

## 前端页面约定
- `fieldwork` 界面上一律叫**「出差」**（别改回去），类型 key 不变。展示名源头：`constants/attendance-labels.ts` +
  后端 `ATTENDANCE_TYPE_LABELS` + `sidebar-data.ts`（别漏台账/工资表列头）。考勤页在 `pages/attendance/`，局部组件放 `pages/attendance/components/`。
- **页头形态**：左 `h1.text-lg font-semibold` + 紧跟 `mt-1 text-xs text-muted-foreground` 说明（**只差 4px，不隔段**）+ 右操作按钮。
  **页内 h1 保留**（面包屑 + 页内大标题两层是用户要的）；只有左边已有页签的页面（台账、待我审批/审核记录、用章）不放 h1。
- 面包屑写 `layouts/default.vue` 的 `routeMap`；**同路径按 query 给不同标题时值写成函数**
  （`useRoute()` 是 reactive，函数里读 `route.query.x` 会被依赖收集）。
- **考勤设置的三个视图由左侧菜单驱动，不用页内 tab**（`?tab=people|payroll|calendar`）；可见性规则
  `utils/attendance-settings.ts` **菜单与页面共用一份**（改权限只改这一处）；缺参数要 `router.replace` 补上。
- **「我的申请」「待我审批」在左侧菜单**，按类型拆子项（`?type=leave|overtime|fieldwork`，读参数在
  `composables/use-request-type.ts`，未带/非法 → 全部类型）；**「审核记录」刻意不分类型**。
  「用章审批」**没有独立页面**（→ `/seal/requests?view=inbox`）。页签用**胶囊按钮**，不用下划线 tab。
- **列表页「页签 + 操作」合并成一行工具栏**（胶囊在左、筛选与操作在右，`border-b pb-2`）；
  台账右侧控件组要 `v-show="activeView === 'detail'"`。同屏控件已表达的范围不要再写一行文字。
- **错误状态不许渲染成空状态**：读取失败要显示「读取失败 + 重试」，不能显示「暂无申请 / 暂无已发布工资条」。已踩过两次。
- 金额用**系统字体栈**（不引 webfont）+ `tabular-nums` + 右对齐（SF Pro 的 tnum 已严格等宽）。
- **UI 基调：收敛、克制、常规**——细则见 `AGENTS.md` §5，交付前与同屏元素对比，突兀/过重就收敛。
- **内部/运维性质的功能不要放进用户界面**（如孤儿并发锁恢复只留后端接口）。
