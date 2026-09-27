# nlsw-saas 项目长期笔记

## 运行环境与验证方式（2026-09 定）

- 后端启动脚本（2026-09-26 起）：`npm run dev` = `node --watch app.js`（Node 22 自带监听，改 .js 自动整进程重启）；
  `npm start` 与 `pnpm run dev:saas` 仍是裸 `node app.js`，部署侧无 pm2/守护进程。
  `deploy/ecosystem.config.js` 是给服务器用的 pm2 配置，本机没装 pm2。
  → 用 `dev` 跑时改后端会自动重启；用 `start`/`dev:saas` 跑时**改后端代码必须重启才生效**，
  不重启时进程持旧代码，症状是新字段/新文案拿不到
  （判断办法：拿线上响应的文案或字段去磁盘代码里搜，搜不到就是旧代码；也可看 `/server-version` 的 `stale`）。
  → `--watch` 只监听进程 require 过的模块，`.env`、`views/*.pug`、`public/`、`data/`、`uploads/` 不在其中（pug 模板开发态每次请求重读，不用重启）。
  → **不要 kill 用户正在跑的进程**：杀了没人自动拉起来，会让用户失去服务。重启交给用户自己做。
- 端口：后端 `1080`，前端 vite `5173`，`8000` 是另一个项目（python）的端口，别混。
- 前端 `npm run lint` **在本仓跑不起来**：仓库是 `.eslintrc.json`（v8 格式），
  而 npx 解析到 ESLint 9（只认 `eslint.config.js`）→ `ESLint couldn't find an eslint.config.*`。既有问题。
- 前端类型检查用 `npx vue-tsc -b`：**增量**跑，改了几个文件约 40 秒（2026-09-27 实测）；
  `--force` 才是全量重建，8–9 分钟。所以不必因为「怕慢」而跳过类型检查。
- 构建校验（不想跑整链 `vue-tsc -b && vite build` 时）：
  `npx vite build --outDir .build-check-0927 --emptyOutDir`，**每次换一个新目录名**——
  复用旧目录会走到「清空输出目录」，被沙箱的批量删除保护拦下（`[SAFE_DELETE_BULK_CONFIRM_REQUIRED]`），
  看起来像构建失败。看日志里 `✓ N modules transformed` 是否出现即可区分：出现即模板/TS 全过，失败的只是清目录那一步。

## 免密码验证（复用用户在线会话）

- 后端会话在 Mongo 的 `sessions` 集合，`session` 字段是 **JSON 字符串**。
  cookie 值 = `s:<sid>.<HMAC-SHA256(sid, SESSION_SECRET) base64 去= >`，拼成 `connect.sid` 即可直打 1080 接口。
- 同一个 cookie 注入 playwright context（`domain: 'localhost'`，不带端口）→ 可免密码打开受保护页面。
- `config/passport.js` 的 `deserializeUser` **每个请求都 `User.findById().populate('tenantId')`**，
  所以改了用户字段（工号、角色）**不需要重新登录**，前端重新拉数据即可。
- 详见技能 `live-session-api-replay`。

## 考勤/薪资模块权限口径

- `utils/attendance-permissions.js`：
  - `requireAttendanceEnabled`：需 `status==='active'`、非 platform、有租户、且功能开关开（standalone 下看 `ENABLE_ATTENDANCE`）。
  - `requireEmployee`：另需**有员工工号**（`hasLinkedEmployee`）。覆盖 `/attendance/requests*`（读/建/撤/审）
    与 `GET /attendance/payroll/my`。**没有工号时返回 `code: 'EMPLOYEE_NO_MISSING'`**，
    前端 `utils/attendance-error.ts` 的 `isEmployeeNoMissing()` 据此给引导（不要匹配文案字符串）。
  - 请假与工资条都按工号归属到人，所以这道守卫不能省。
- `models/User.js` 的 `mustChangePassword` 用 `default: undefined` + 守卫 `!== true`（放行）——
  注释曾写成「legacy accounts require a self-change」与代码相反，**改这块时先看清楚语义**。
- **存量账号普遍没有工号**（实测 12 个里 7 个没有，含 admin/平台管理员），
  任何「要求工号」的功能都要考虑这个默认状态，并给出可操作的引导而不是一句报错。

## 工作日历（国务院节假日安排）数据链（2026-09-27 定）

- 三层来源：**内置兜底表**（`utils/china-attendance-calendar.js` 的 `YEARLY_SCHEDULES`，目前只有 2026，
  离线可用）→ **`holiday_calendars` 集合**（`models/HolidayCalendar.js`，全国统一数据**故意不挂 tenantId**，
  全局租户插件不会介入）→ **线上数据源**（`utils/china-holiday-source.js`，holiday-cn 优先、jiejiariapi 兜底；
  timor.tech 被 Cloudflare 拦、apihubs 字段是数字编码，都别用）。
  某个年度第一次被需要时抓一次，**成功才落库**，失败只回状态、下次再试。
- `getChinaAttendanceCalendar(year)` 必须是**同步**的（请假时长、台账、日历渲染都在同步链路）。
  所以内存注册表是唯一真源：新增的 `ensureChinaAttendanceCalendar(year)` 是异步的，**只在 `GET /attendance/calendar` 里调**；
  `loadChinaAttendanceCalendar()` 在 `app.js` 连上 Mongo 后预热。**不要把抓取塞进请假/台账等同步链路。**
- `official.status` 四态：`cached`（内存/库里已有）/ `fetched`（本次线上取得并落库）/
  `unpublished`（数据源明确答复没有）/ `unavailable`（所有源都没答复）。抓取、读库、落库失败都只 warn。
- **有官方安排的年度会被当作「已确认」**（沿用原有语义：内置年本来就算 configuredYears），
  所以管理员在下拉里浏览过某年，该年的请假与台账就算日历可用，不必手工点一天。
- 年度下拉（设置页日历视图）：`2026 .. 当前年份 + 10`，`yearOptions` 里对更早的已确认年度留了兜底项。
- 测试都不走真实网络：`test/china-holiday-calendar.test.js` 注入 fetch + mock 模型；
  `HolidayCalendar.findOne()` 那层是 Query，mock 要还原 `.lean()`。

## 前端页面约定

- 考勤页在 `front_end/src/pages/attendance/`，局部组件放 `pages/attendance/components/`。
- **考勤设置的三个视图由左侧菜单驱动，不用页内 tab**（2026-09-27 改）：
  App 侧栏「考勤与工资 → 设置」下挂三个子项，url 形如 `/attendance/settings?tab=people|payroll|calendar`；
  页面只按 `route.query.tab` 渲染对应视图，组件不重建，**靠 `watch(() => route.query.tab)` 响应**，
  地址里没带 `?tab=` 时 `router.replace` 补上（否则左侧菜单高亮不到）。
  可见性规则抽在 `front_end/src/utils/attendance-settings.ts`，**菜单与页面共用一份**——
  改权限口径只改这一处，否则会出现「菜单能点、进去说无权」。
  副作用：只挂了考勤总经理角色的人没有任何可配项，侧栏不再出现「设置」（直接进地址仍给引导文案）。
- tab 容器用现成的 `components/ui/tabs`（reka-ui）；`TabsContent` 只是隐藏，不卸载 DOM。
- **内部/运维性质的功能不要放进用户界面**（例：孤儿并发锁恢复已从考勤设置页移除，
  只保留后端接口给运维）。用户只关心「做申请、看工资条」。
- **错误状态不许渲染成空状态**：读取失败时不能显示「暂无申请 / 暂无已发布工资条」，
  要显示「读取失败 + 重试」或专门的引导态。已踩过两次。
- **UI 基调：默认收敛、克制、常规**（细则见 `AGENTS.md` §5，2026-09-26 加入）：
  文案不解释不啰嗦、只留必要信息；尺寸间距按界面类型/信息密度/使用频率/视觉层级判断，
  不写死统一规格也不主动放大；辅助入口·设置·开关·工具按钮不抢视觉中心；常见功能用通用图标隐喻
  （成熟图标库/系统图标/行业通用符号，不自创奇怪图标）；层级靠位置、分组、轻微颜色、hover、
  tooltip、分隔线、状态反馈表达，避免夸张尺寸/重色块/大圆角/厚边框/强阴影/装饰性渐变/营销页式布局。
  **交付前必须与同屏元素对比检查**，显得突兀、过大、过重或破坏信息密度就主动收敛。

## 验证强度：分级，不要一律回归（2026-09-26 定）

- `AGENTS.md`（42 行）已写入 **分级验证** 表，语义：
  **L0** 文案/样式/图标/单页展示微调 → 能编译 + 开页面看一眼即可，**不跑测试套件、不补测试、不建 todo**；
  **L1** 单页逻辑/局部组件 → 相关文件类型检查 + 该模块已有测试；
  **L2** 接口/数据模型/权限/共享 composable·store → 模块测试 + 走一遍主流程；
  **L3** 部署、迁移、批量、不可逆 → 全量 + 备份 + 回滚。
- 档位按**影响面**判，不按改动行数；判不准取低档并说明依据。只有用户明确要求才跑全量回归。
- 与之配套：删掉了旧文档里「验证为王 / 测试驱动 / Never mark complete without proving it works」这类绝对表述，
  保留「不测 ≠ 不报」（跑了什么、没跑什么要如实说，错误不许静默失败）。
- `SKILL.md` 同步瘦身为速查表（430 → 71 行）：长示例代码块一律删除（仓库里有真文件，且会腐烂），
  只留目录骨架、命名表、接口/错误约定、派生字段钩子、两套表格、最短流程、中文状态值、提交前缀。
