# nlsw-saas 项目长期笔记

只留「不看就会做错」的判据，删背景与叙事。规模受注入上限约束：**细目按主题拆到 `topics/*.md`**，本文件只放跨模块判据。验证分级 L0–L3 见 `AGENTS.md` §2。

## 环境 / 验证
- `npm run dev` = `node --watch app.js`；`--watch` **不监听** `.env`/`views`/`public`/`data`/`uploads`。别 kill 用户正在跑的进程（1080 后端 / 5173 vite）。`npm run lint` 本就跑不起来（ESLint 9 vs v8 配置）。
- 验证：`npx vue-tsc -b`；`npx vite build --outDir .build-checkMMDD --emptyOutDir`（每次换新目录名）；全量 `node --test test/*.test.js`。
- **既有失败（2026-10-06 确认，改动前后一致，别当回归）**：`payroll-standard-draft.test.js` 3（`useDevice is not a function`——桩没给 `@/composables/use-device`）、`vessel-settle-weight-range.test.js` 1、`deploy-script-pm2.test.js` 1（脚本已改用 `command -v serve`，断言还在找老的 `$NODE_INSTALL_DIR/bin/serve`）。
- **测试桩**：文件级 `User.find = () => queryResult([])`（不桩会 mongoose buffering 超时 10s/例）；自定义桩要同时支持 `.lean()`；桩 `SealUsageLog.create`/`Notice.create`（否则超时）。

## 部署脚本 deploy/deploy.sh
- **打包清单与增量复制白名单是两份手工列表**（`cp -r` 列表 / `cp -rf nlsw-deploy/xxx`），新增顶层目录（如 `services/`）**两处都要加**；漏了 → 远程 `require` 失败，后端启动即崩（PM2 显示 online 后 1s 变 errored、重启计数飙升）。
- **远程 Node 目录名别写死**：官方 tar 包目录带完整版本号（`~/sw/node-v22.22.0`），写 `node-v22.22` 解析不到；脚本内已加 `find -maxdepth 1 -type d -name 'node-v22*'` 自动探测（**必须 `-type d`**，否则会匹配到 `node-v22.x-linux-x64.tar.xz`）。
- 前端 `serve` 用 `command -v serve` 解析，别拼 `$HOME/$NODE_INSTALL_DIR/bin/serve`。
- 判活要看**端口是否响应**（`curl 127.0.0.1:1080/`），`pm2 pid` 有值不代表服务活着。

## 前端组件坑
- **封装组件只认自己声明的 prop，写错不报错也不生效**：`ui/Checkbox`/`ui/Switch` 只认 `modelValue`（reka-ui 2.8，无 `checked`）；`ui/Input` 只认 `modelValue`/`defaultValue`，`:value` 无效；**只读展示别用 Input**，用 `<div>`。原生 checkbox 才用 `:checked`。
- 抽屉/弹窗宽度要用**同名修饰符**覆盖（`DrawerContent` 自带 `sm:max-w-sm`、`DialogContent` 自带 `sm:max-w-lg`，tailwind-merge 不去重不同修饰符）→ 必须写 `sm:max-w-2xl`。`direction` 是 `DrawerRoot` 属性；vaul `shouldScaleBackground` 要关。
- `DatePicker` 内部 `cn('... w-full', props.class)` 且根是无宽度约束的 Popover → 传宽度 class 无效，**定宽加在外层包裹 div**。
- 并排子控件按**容器宽度**判断能否放下，别用视口断点（`sm:flex-nowrap` 在窄容器照样溢出）→ `flex-wrap` + 每段 `shrink-0` + 定宽。
- scoped 里 `:global(.dark) .x` 会被编译丢掉 → 用 Tailwind 任意属性变量；阴影挂**外层**（同元素 filter 被 mask 裁掉）。
- 金额用系统字体栈 + `tabular-nums` + 右对齐。**内部/运维功能不要放进用户界面**。
- 页内 h1 保留（左 h1 + 说明 + 右操作）；左边已有页签的页面（台账、待我审批/审核记录、用章）不放 h1。面包屑写 `layouts/default.vue` 的 `routeMap`。
- **错误状态不许渲染成空状态**（读取失败给「读取失败 + 重试」）。
- `const m = res.data.x || {}` 会被推成 `{}` → `m[key]` 报 TS7053，显式标 `const m: Partial<Record<T, V>> = ... || {}`。
- 外部接口的展示字段走**序列化注入**，别在前端猜名字。

## 角色与权限
- **管理员 ≠ owner**：管理员 = `privilege` 含 `'admin'`；owner = `role === 'owner'`。守卫 `requireExactOwner`/`requirePeopleManager`。
- **总经理** = `attendanceRoles` 含 `general_manager`，租户内唯一（`User.attendanceGeneralManagerTenantId`，`select:false`，由「用户管理 → 职位」同步）；代理 = `Tenant.settings.attendanceGeneralManagerDelegateId`。审批链**不加部门主管一级、不留「可配置审批层级」开关**（被否）。催办「通知部门主管」= `user.managerId`（上报对象，非审批人）。
- **审批权不看角色**：`reviewRequest` 只认审批链 `approverId` → 会出现「收得到单子没入口」。**新增审批角色必须同时改三处**：后端待办判据、`/me` 下发标记、前端 `module-access` 入口判据（考勤与用章都踩过）。
- 三个考勤角色（`manager` **已于 2026-10-07 停止开放勾选**）：
  - `attendance_admin`：日历、结账/重开、实到确认、**全公司范围**；
  - `general_manager`：终审 + 全公司查看，租户内**唯一**；
  - `manager`：**不再开放新增**。原唯一作用是「防自审」（`applicantIsManager` → 审批链只有总经理一步），
    用户 2026-10-07 决定改用「直属经理」指向总经理达成同样效果，**该角色对不上报对象的经理已无必要**。
    `createRequest` 里的 `applicantIsManager` 分支**仍保留**（存量数据兼容 + 不动审批链核心逻辑）。
    存量勾选的人**允许原样保留**（编辑其他字段时前端会带回来，后端 `keptManager` 分支放行，**不能 400 打断保存**），
    界面上渲染成禁用的「经理（已停用）」。新增走 `requested.includes('manager') && !存量` → 400 提示改设直属经理。
- **`manager` 这个字符串有两种语义，别混**：`User.attendanceRoles` 里的 `manager`（考勤角色，上面那条）
  vs `AttendanceRequest.approvals[].role === 'manager'`（**审批链步骤名**，表示「这一步由直属经理审」，
  由 `user.managerId` 汇报对象决定，与考勤角色无关；**这个 role 值不能删**，删了审批链渲染会挂）。
  库里实际使用：14 人里只有 `admin` 勾了 `attendance_admin`，`manager` 勾选数为 0。
- `requireEmployee` 需**有工号**（覆盖 `/attendance/requests*`、`GET /attendance/payroll/my`）；缺工号返回 `code:'EMPLOYEE_NO_MISSING'`（前端 `isEmployeeNoMissing()`，**别匹配文案**）。**存量账号普遍没工号**。
- `models/User.js` 的 `mustChangePassword` 是 `default: undefined` + 守卫 `!== true`（放行），注释与代码相反。
- **加 `Tenant.settings.*` 必须先在 `models/Tenant.js` 声明**，否则写入被 strict 静默丢弃（接口 200、校验重算全对，库里没字段、读取回落默认值）。`settings` 是**平铺路径**（`Tenant.schema.paths['settings.xxx']`），不是嵌套 schema；数组子文档加 `_id: false`。护栏见 `test/attendance-work-periods.test.js` 首两条断言。
- **子文档 schema 未声明的字段直接赋值会被 strict 丢掉** → 展示字段一律走序列化注入（考勤 `approverNameMap()`、用章 `serializeRequests()`）。

## 测试账号（2026-10-06 用户明确要求，切记）
- **判据唯一来源 `utils/test-account.js`**：`isTestAccount` / `filterRealEmployees`。
  登录名 `userid` 或真实姓名命中前缀（`test/zefan/demo/saas-test/guest/tmp`，不区分大小写、**只做前缀**）即算测试账号。
- **owner 豁免**：`test-firm`、`zefan` 都是 owner（用户本人），排掉就没人能进系统维护 → `isTestAccount` 里先判 `role === 'owner'` 返回 false。
- **只在内存里过滤，不拼 Mongo 条件**：判据要同时看 `userid`、`profile.name`、`role`，
  用 `$or`+`$nin` 拼的与内存判据极易不一致。员工量几十到几百级，过滤开销可忽略。
- 已挂的读路径（**新加员工名单接口时也要挂，别只改这一处**）：
  工资表 `listStatements`、薪资设置 `listStandards`、批量福利 `batchWelfare`、`loadEmployees`、
  员工资料 `listPeople`、薪资权限 `getPayrollRoleCandidates`、
  台账 `getScopedUsers`（+ `isAttendanceTracked` 写入守卫）、薪资统计 `getPayrollAttendanceSummary` / `getStatistics`。
- **「只看本人」路径不排除**（`scope:'mine'`、`getMyStatements`、本人统计）——否则测试账号连自己的台账/工资条都打不开。
- 薪资统计/考勤聚合那两个函数的数据源是**申请单与台账行**（只有 `employeeId`、没有 `userid`），
  得用 `testAccountIdsAmong(tenantId, candidateIds)` 回查账号表判据；**只查这次实际用到的 id**，
  且必须带 `.catch(() => [])` —— 测试夹具不桩 `User.find` 时靠它兜住，否则 mongoose 缓冲 10s 超时直接把用例拖挂。
- **历史数据不删**，只是不展示、不纳入新统计（用户定的口径）。
- **用章设置也是员工名单**（2026-10-06 补，`controllers/api/seal.js`），**两类都要过滤**：
  ① `candidates` 候选下拉；② **库里已存的 `sealCustodianIds` 与 `sealApprovers`** ——
  配置是历史留下的，只过滤候选列表的话，测试账号仍会显示在「已指派」里。
  写入侧 `sealCustodianIds` / `sealCustodianId` / `sealApprovers` 三处校验也要排（400）。
  护栏见 `test/seal-settings-test-accounts.test.js`。

## 编号
- **本仓没有流水号发生器**（`models/OrderNumber.js` 是去重字典）。租户内自增号：独立集合 + `findOneAndUpdate({tenantId},{$inc:{n:1}},{upsert:true,new:true})` + 唯一索引；**别用 `countDocuments()+1`**。

## 工作日历
- 三层：内置 `YEARLY_SCHEDULES`（离线兜底）→ `holiday_calendars`（全国数据**故意不挂 tenantId**）→ 线上 `china-holiday-source.js`。
- `getChinaAttendanceCalendar(year)` 必须**同步**；异步 `ensureChinaAttendanceCalendar(year)` **只在 `GET /attendance/calendar`**；`loadChinaAttendanceCalendar()` 在 app.js 预热。**别把抓取塞进同步链路**。
- **「某天算不算工作日」唯一入口 = `workIntervalMinutes(date, policy)`**；优先级：租户单日覆盖 > 国务院安排 > 周六上午 > 周一至周五。
- 星期一律 `new Date(date+'T00:00:00.000Z').getUTCDay()`。月度应出勤**与人员无关**；未结账月份不沿用快照。mock `HolidayCalendar.findOne()` 是 Query，**要还原 `.lean()`**。
- **每天工作时段可配**（`Tenant.settings.attendanceWorkPeriods`，默认 09:00–12:00 + 13:00–18:00）：唯一来源 `utils/attendance-permissions.js` 的 `DEFAULT_WORK_PERIODS`（getCalendar 引用它）；校验 `validateWorkPeriods`（1–4 段、不重叠、≤16h）；入口 = 工作日历设置页「工作时间」，接口 `POST /attendance/calendar/work-periods`（仅 owner/`attendance_admin`）。`toMinutes` **接受一位数小时**（`8:00`）；`hoursPerDay` 从时段推导；周六上午从时段里切（`leadingWorkIntervals`）；改配置**不影响已结账月份**。

## 考勤月台账
- **两层状态**：整月 `status: open|closed`（open 实时重算应出勤；closed 读快照，改要「重新开启」+ 原因 + `AttendanceLedgerAudit`）；每人 `confirmationState: pending|confirmed|no_basis`（confirmed 必须有非负整数实到；no_basis 必须填原因且实到留空）。
- **结账前置（`closeMonth`，缺一即 409）**：有 pending / confirmed 无分钟 / no_basis 无原因或有实到 / `requiresLeaveReconciliation`。确认与结账仅**主账号 + `attendance_admin`**（`isMonthAdmin`）。可见范围：主账号/考勤管理员/总经理=全公司，经理=团队，其余=本人。
- **「无依据」≠「没出勤」**；拿不准填无依据，**不许用 0 冒充**。
- **台账实到不参与算钱**：工资条「请假与旷工扣款」财务手填；工资表明细「当月考勤时长」来自**已通过的申请单**（`getMonthlyAttendanceSummary`）。
- **系统不登记「实际加班 / 实际出差」**（2026-09-30 已删，**别加回来**）。
- **加班补偿**：`comp_time`/`overtime_pay`/`none`（必选、**默认无补偿**；`ALLOWED_COMPENSATION` 与模型 enum 同步），展示统一「无补偿」。**加班总时长与方式无关**，三种都进 `overtimeApprovedMinutes`；台账「已批加班」第二行用 `overtimeMethodLabel()` 只列真有时长的。
- **待审批只作提示**：`buildRows` 一次 `$in:['approved','pending']` 后按状态切开，`pending*` 不并入「已批」、不参与实到。**改这个查询会连坐测试**（夹具必须带 `status`）。
- **导入考勤记录**（`POST /attendance/ledger/import`、`LedgerImportDialog.vue`）：`isMonthAdmin`、已结账 409、**只更新传入字段**、走月份锁。**只登记次数**；请假**不导入**；空格不动原值、`0` 有效；按**表头文字**识别列；注释行 `isNonEmployeeLabel` 跳过；报错用中文列名（`IMPORT_FIELD_LABELS`），**别漏出 `lateTotal` 这类 key**。
- **实到自动计算** = `应出勤 − 请假 − 迟到/早退/无打卡扣减`，下限 0。唯一来源 `utils/attendance-ledger-actual.js` 的 `DEFAULT_ACTUAL_RULE`；租户配置 `Tenant.settings.attendanceLedgerActualRule`（**字段标签由后端 `ACTUAL_RULE_FIELDS` 下发**）。**建议值只算不写库**（读时附 `suggestedActualMinutes/suggestedActualNote/actualMinutesIsManual`），保存那行才落库（`actualMinutesSource='auto'|'manual'`；auto 由服务端核对，saveRow 多一次 `AttendanceRequest.find`，**测试要打桩**）。不覆盖判据 `isActualManual(row)`：无来源标记的旧行「有值即人工」。不给建议值：`requiresLeaveReconciliation`、本月无应出勤；扣成负数按 0；只导入「迟到合计」未分档 → 不扣。前端必须有 `effectiveActualMinutes(row)`（`makeDraft`/`isRowDirty` 都用它，否则一进页面就判成「未保存修改」，挡住切月与结账）。

## 考勤申请 / 审批 / 附件
- 三入口（我的申请 / 待我审批 / 审核记录）**共用 `RequestList.vue`**；详情是展开行（`RequestTimeline.vue`，状态 `等待中|已通过|已驳回|未进行`）。
- **时长口径**：请假 = **折算天数**（÷ `calendarMinutesPerWorkday(year)`，取不到按 480）、出差 = **日历天数**（含首尾）、加班 = **小时**；详情头部只显示部门。
- **附件**：`canPreviewAttachment` → 图片/PDF 内联预览，Word/Excel 只下载。**预览必须用本地 blob**（附件接口要登录态，跨端口拿不到 cookie）。
- **待办提示只有审批页那一行**：`components/approval/ApprovalPendingLinks.vue` ← `stores/approvals`（侧栏挂载 `start()`，立即 + 60s 轮询）。**侧栏菜单不加角标**（被否）。`GET /attendance/approvals/pending-counts`（**别挂 `requireEmployee`**）、`GET /seal/requests/pending-count`（**必须排在 `/seal/requests/:id` 之前**）。测试认 `data-slot="approval-pending-links"`。
- **考勤申述 = 第四种 `type: 'appeal'`**：表单只有**发生日期 + 申述类型 + 事由 + 附件**；`startAt/endAt/durationMinutes` 是**条件 required**（`this.type !== 'appeal'`）；`occurredOn` 定台账归属，**审批加月锁也按 `occurredOn.slice(0,7)`**。类型与可核减字段唯一来源 `utils/attendance-ledger-actual.js` 的 `APPEAL_TYPES/APPEAL_TYPE_LABELS/APPEAL_OFFSET_FIELDS`；**`APPEAL_OFFSET_FIELDS` 不含 `absence`**。**按申请单聚合时长的地方都要 `if (type === 'appeal') continue`**（否则崩在 `endAt.getTime()`）。核减只在**读时**（`withAppealOffset` 改 `suggestedActualMinutes`，说明写 `appealOffsetLabel`，**不写库**）；`buildRows` 与 `actualSuggestionFor` 必须同口径。重复提交（同人/同日期/同类型 pending|approved）409。
- 界面名一律叫**「出差」**（`fieldwork` key 不变）；展示名源头 `constants/attendance-labels.ts` + 后端 `ATTENDANCE_TYPE_LABELS` + `sidebar-data.ts`。左侧菜单按类型拆子项（`?type=leave|overtime|fieldwork|appeal`，读参数 `composables/use-request-type.ts`）；「审核记录」不分类型。

## 用章：审批人配置 + 会签
- **配置以人为中心**：`Tenant.settings.sealApprovers = [{ userId, sealTypes: [] }]`（子文档 `_id: false`），**一人可负责多类章**。已废弃 `sealApproverMap`（类别→人字典，表达不了「一人管多类」）。解析用 `sealApproverLookup()` 压成 类别→人 查找表。
- **未被覆盖的类别 = 走兜底**（总经理 → 总经理代理 → 主账号）；配置的人**已停用或就是申请人本人 → 当作未配置**。
- **会签口径**：类别分属不同人时，一人都要通过才转「待发章」；任一步驳回 → 整单 rejected，**其余 pending 步骤必须记 `skipped`**（撤回同理），否则会被 `syncPendingApprovers()` 收回待审名单。同一人负责的类别**合并成一步**。
- **`approvals` 是唯一数据源**，`currentApproverIds` 是派生字段（唯一写入口 `syncPendingApprovers`）。**待我审批查询必须打在 `approvals.$elemMatch:{approverId, status:'pending'}` 上**——打在派生字段上，存量单据（只有旧 `currentApproverId`）的审批人会**收不到单**。
- `canApproveSealRequest`：认「我名下有 **pending** 步骤」→ 自己那步通过后**立刻失去**权限（防重复审批）；owner/admin/GM 兜底代审仅在 `status==='pending'` 时有效。
- **写入校验**（`updateSettings`）：同一人只能一条；**同一类别不允许挂两个人**（撞车直接 400）。
- **前端入口必须一起改**：`/me` 下发 `isSealApprover` → `canApproveSeal` 也要认它。
- 审批人姓名/类别中文名走 `serializeRequests()` 注入。「用章审批」**没有独立页面**（→ `/seal/requests?view=inbox`）；配置入口 = 用章设置页「用章审批人」卡片。

## 其它主题（需要时再读）
- **薪资费率 / 工资条发布与再发布 / 节日福利 / 薪资统计 / 小票·通知·移动端** → `topics/payroll-and-notice.md`。
- **免密码验证（复用在线会话回放接口）** → 技能 `live-session-api-replay`。最易忘：`connect.sid` = `s:<sid>.<HMAC-SHA256(sid, SESSION_SECRET)>`，**别写死 sid**；拦接口只按「端口 + pathname 谓词」（用 `**/xxx**` 会拦到 vite 的 `.vue` → 白屏）；写接口回放要带 `origin`/`referer`；脚本末尾别接 `| head -N`（SIGPIPE 截掉汇总）。
