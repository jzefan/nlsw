# nlsw-saas 项目长期笔记

只留「不看就会做错」的判据，删背景与叙事。**细目按主题拆到 `topics/*.md`（索引见文末）**，
本文件只放跨模块判据。验证分级 L0–L3 见 `AGENTS.md` §2。

## 环境 / 验证
- `npm run dev` = `node --watch app.js`；`--watch` **不监听** `.env`/`views`/`public`/`data`/`uploads`。
  别 kill 用户正在跑的进程（1080 后端 / 5173 vite）。`npm run lint` 本就跑不起来（ESLint 9 vs v8 配置）。
- 验证：`npx vue-tsc -b`；`npx vite build --outDir .build-checkMMDD --emptyOutDir`（**每次换新目录名**）；
  全量 `node --test test/*.test.js`。
- **既有失败**（2026-10-06 确认，改动前后一致，别当回归）：`payroll-standard-draft` 3、
  `vessel-settle-weight-range` 1、`deploy-script-pm2` 1。细节与测试桩写法 → `topics/verify-and-stubs.md`。

## 前端（详版 → `topics/frontend-traps.md`）
- **别给布局加 `:key="route"`**（`App.vue` 已移除）：绑整个 route 对象会让**整棵布局连侧栏一起重建**。
  主内容回顶由 `layouts/default.vue` 的 `watch(route.fullPath)` + `nextTick` 完成。
- **`router.scrollBehavior` 只对 `window` 生效**；侧栏与主内容区是内部 `overflow-auto` 容器
  → 想滚哪个容器就在那个容器上自己 `scrollTo`。测侧栏位置**别用 `page.click()`**
  （Playwright 会 `scrollIntoViewIfNeeded` 把侧栏拉回顶部，误判成「侧栏仍会跳」）；
  验证「是不是同一个 DOM 实例」用 `el === document.querySelector(sel)` 比对，别靠截图。
- **封装组件只认自己声明的 prop，写错不报错也不生效**：`ui/Checkbox`/`ui/Switch` 只认 `modelValue`
  （reka-ui 2.8，无 `checked`）；`ui/Input` 只认 `modelValue`/`defaultValue`，`:value` 无效；
  **只读展示别用 Input**。原生 checkbox 才用 `:checked`。
- 抽屉/弹窗宽度要用**同名修饰符**覆盖（`sm:max-w-2xl`——tailwind-merge 不去重不同修饰符）；
  `DatePicker` 根是无宽度约束的 Popover → **定宽加在外层包裹 div**；
  并排子控件按**容器宽度**判断能否放下（别用视口断点）。
- **错误状态不许渲染成空状态**（读取失败给「读取失败 + 重试」）。
- **「弹层能打开但点不到」先用 `elementFromPoint` 查真正接收点击的元素**，别靠截图猜层级：
  z-index 大 ≠ 在上（要看**所在层叠上下文**）；祖先 `overflow-hidden` 会**直接裁掉**越界弹层；
  遮罩 z 必须**低于**弹层。自写下拉建议 `<Teleport to="body">` + `fixed` 定位。
- 其余（表格加列同步改 `min-w-[…]` 与两个 `colspan`、scoped 里 `:global(.dark)` 被编译丢掉、
  阴影挂外层、金额 `tabular-nums` 右对齐、页内 h1 规则、`const m = res.data.x || {}` 的 TS7053、
  展示字段走序列化注入、内部/运维功能不进用户界面）→ `topics/frontend-traps.md`。

## 全权身份与 privilege 的边界（2026-10-12 定，易混，先看这条）
> 用户反复强调：**「老业务的权限不要延伸到新的业务里」**。
- **全模块全权只有三种身份**：① 登录名 `userid === 'admin'`（**不是** `privilege` 里的 `'admin'`
  字符串，两个撞名）② `role === 'owner'` ③ 职务总经理/董事长（title `gm`/`ceo`）。
  后端唯一判据 `utils/user-title.js:isFullPrivilegeUser()`，前端 `utils/module-access.ts:isFullPrivilege()`。
  **新模块一律走这两个，不要散着判 role / userid / title。**
- **`privilege: ['admin']` 只管老业务模块**（订单、运单、结算、报表），在用章 / 考勤 / 员工资料 / 工资里
  **一律不生效**（403，有意为之）。
- **gm/ceo 在考勤台账与工作日历是只读**：`isMonthAdmin` 判「能不能改数据」，
  **不能用 `isFullPrivilegeUser()`**（否则 gm/ceo 跟着放行，与只读矛盾）。
- 用章权限只来自「身份」或「用章设置里的指派」；员工资料仅三种全权身份；
  审批权只看审批链 `approverId`，**新增审批角色要同时改三处**（后端待办 / `/me` 标记 / 前端入口）。
  其余细则（考勤三角色、`manager` 双语义、受保护身份两判据、`Tenant.settings` strict 坑）
  → `topics/permissions.md`。

## 员工开关（考勤统计 / 薪资统计）
- `User.attendanceTracked` 与 `User.payrollTracked` **同为 `Boolean default: true`**，语义 `!== false` 即纳入；
  两个开关在「员工资料」里各占一列，**互不连带**（只提交一个时另一个沿用库里值）。
- `payrollTracked === false` 是**一并排除**：工资表 `listStatements`、薪资统计 `getStatistics`、
  薪资设置 `listStandards`、批量福利、工资条导入/批量发布（后四者共用
  `payroll.js:payrollEmployeeQuery()`，**加条件只改这一处**）；历史工资条也不再列出。
- 聚合口径要回查账号：`payroll.js:excludedPayrollEmployeeIds()`、
  `attendance-ledger.js:payrollExcludedIdsAmong()`（都带 `.catch(() => [])`）。薪资权限候选**不排除**。

## 测试账号（2026-10-06 用户要求）
- 唯一判据 `utils/test-account.js`（`isTestAccount` / `filterRealEmployees`）：登录名 `userid`
  或真实姓名命中前缀 `test/zefan/demo/saas-test/guest/tmp`（不区分大小写、**只做前缀**）。
  **owner 豁免**（`test-firm`/`zefan` 是用户本人，排掉就没人能进系统维护）。
- **只在内存里过滤，不拼 Mongo 条件**；**历史数据不删**，只是不展示 / 不纳入新统计；
  **「只看本人」路径不排除**（否则测试账号连自己的台账/工资条都打不开）。
- 新增员工名单接口要挂：工资表 / 薪资设置 / 批量福利 / `loadEmployees` / 员工资料 / 薪资权限候选 /
  台账 `getScopedUsers` / 薪资统计；**用章设置两类都要过滤**（① `candidates` 候选下拉
  ② 库里已存的 `sealCustodianIds`/`sealApprovers`，写入侧三处校验也要排 → 400）。
  护栏 `test/seal-settings-test-accounts.test.js`。

## 线上环境
- 线上 `~/nlsw2`，Mongo `nldb_saas`@localhost:27027（auth `nlsw2026` / `HiNlsw2026.`）；
  node 在 `/home/xht2020/sw/node-v22.22/bin`（**非交互 shell 不在 PATH**，要显式 `export PATH=...`）。
- 根盘 49G 常年 99%，唯一大户是 `uploads/receipts`（9609 张 / 28.4G，可压到 1.8–3G）。
  回单路径/压缩/`/mnt/data` 挂载 → `topics/receipt-storage.md`。

## 编号
- **本仓没有流水号发生器**（`models/OrderNumber.js` 是去重字典）。租户内自增号：独立集合 +
  `findOneAndUpdate({tenantId},{$inc:{n:1}},{upsert:true,new:true})` + 唯一索引；
  **别用 `countDocuments()+1`**。

## topics 索引（需要时再读）
- `permissions.md` 权限 / 身份 / 审批拓扑 / strict 坑细则
- `frontend-traps.md` 布局·滚动·封装组件·层叠 细则
- `verify-and-stubs.md` 验证命令、既有失败、测试桩写法
- `receipt-storage.md` 回单路径、批量压缩脚本、前端 canvas 压缩、磁盘与 `/mnt/data`
- `deploy.md` 部署脚本的两份手工清单、远程 Node 目录探测、判活方式
- `attendance-calendar.md` 工作日历三层与工作时段配置
- `attendance-ledger.md` 月台账状态机、结账前置、导入、实到自动计算
- `attendance-requests.md` 三种申请的共用列表、时长口径、附件预览、考勤申述
- `seal.md` 用章审批人配置与会签口径
- `payroll-and-notice.md` 薪资费率、工资条发布与再发布、节日福利、薪资统计口径、小票·通知·移动端
- `settle-vessel-price.md` 车船价 `vessel_price`/`veh_price` 恒为元/吨、`price_mode` 只记录入方式
  不参与换算、接口车辆副本来自 Invoice 侧
- **免密码验证（复用在线会话回放接口）** → 技能 `live-session-api-replay`。最易忘：
  `connect.sid` = `s:<sid>.<HMAC-SHA256(sid, SESSION_SECRET)>`，**别写死 sid**；拦接口只按
  「端口 + pathname 谓词」（用 `**/xxx**` 会拦到 vite 的 `.vue` → 白屏）；写接口回放要带
  `origin`/`referer`；脚本末尾别接 `| head -N`（SIGPIPE 截掉汇总）。
