# 车船结算“不需要结算”误报已结算排查

- [x] 定位前端“不需要结算”动作及请求参数
- [x] 追踪后端“已结算”判定并与真实 Bill 数据对照
- [x] 建立最小复现/测试并记录根因与建议

## Review

- 根因：单行点击的前端拦截条件错误地依据顶部全局筛选 `filterForm.settleState`，而非该行的实际 `vessel_settle_state`。当页面在“全部”标签时，任何尚未标记“不需要结算”的行都会被提示“已结算”。
- 该提示发生在 API 请求之前；本次记录没有被后端拒绝，也没有发生数据库写入。
- 提供的 Bill 中 `settle_flag: 0`、`invoices[0].inv_settle_flag: 0` 均表示客户/代收结算未完成；车船结算页实际使用对应 Invoice 的 `vessel_settle_state`，截图显示该行是“未结算”。
- 验证：针对性断言已复现“行=未结算、顶部=全部”必然误报，并确认 `node --check controllers/api/vessel_settle.js` 成功。现有 `test/vessel-settle-weight-range.test.js` 与当前重量筛选算法期待不一致而失败，和本问题无关，未改动。

# 车船结算已结算导出空数据修复

- [x] 比对列表和导出路径的状态筛选语义，确认内部运单状态被导出路径错误丢弃
- [x] 让导出行重建与列表保持相同的主行/内部运单状态筛选规则
- [x] 运行前端类型校验并记录结果

## Review

- 根因：后端筛选“已结算”会返回船主行或内部运单任一状态命中的运单；列表会隐藏不匹配的船主行并展示命中的内部运单，但导出代码此前会因船主行状态不匹配而丢弃整张运单，最终得到空导出集。
- 修复：导出路径改为与列表相同的规则，只隐藏状态不匹配的船主行，继续导出状态匹配的内部运单；普通车运仍按主运单状态过滤。
- 校验：`git diff --check`、`pnpm -C front_end exec vue-tsc --noEmit` 均退出成功。

# 结算页操作者姓名修复

## 全局搜索运单跳转修复

- [x] 排查全局搜索运单结果点击后的实际跳转链路
- [x] 改为由搜索结果显式返回并使用修改运单目标页，避免前端二次猜测
- [x] 运行前后端校验并记录结果

## Review

- 根因确认：这里用户要的是“查看运单”，不是“修改运单”。全局搜索运单结果之前被带去了编辑页，动作语义就错了。
- 后端 `searchGlobalRecords` 现在会为运单结果显式返回查看页目标 `target_path=/reports/invoice`；前端点击时直接使用这个目标页。
- 运单报表页 `invoice.vue` 已支持读取 `globalWaybillNo`，会自动选中并加载对应运单详情，因此从全局搜索进入后就是直接查看该运单。
- 之前为了搜索跳转加在 `create-truck.vue` / `create-ship.vue` 里的 `globalWaybillNo` 自动打开逻辑已撤回，避免编辑页继续残留“查看入口”语义。
- 校验通过：`node --check controllers/api/invoice.js`、`pnpm -C front_end exec vue-tsc --noEmit`

## 工作台下钻月份筛选

- [x] 梳理工作台“发运总吨数 / 配发开单名称数”下钻弹框与移动端抽屉的数据加载逻辑
- [x] 为发运总吨数下钻增加月份筛选，并按所选月份重新请求数据
- [x] 为配发开单名称数下钻增加月份筛选，并按所选月份重新请求数据
- [x] 运行前端校验并记录结果

## Review

- 工作台桌面端 `overview-content.vue` 的“运单明细 / 开单名称统计明细”弹框均新增月份筛选，支持在当前统计区间内按财务月单独下钻；保留“全部”查看整个当前区间。
- 工作台移动端 `dashboard-mobile.vue` 的底部抽屉同步新增相同月份筛选，避免桌面端和移动端行为不一致。
- 复用现有 `/statistics/dashboard/invoices` 和 `/statistics/dashboard/billing-names` 接口，不新增后端接口；单月筛选时将开始和结束参数都传同一个 `YYYY-MM`，沿用现有财务月解析逻辑。
- 校验通过：`pnpm -C front_end exec vue-tsc --noEmit`

## 顶部全局搜索

- [x] 梳理顶部布局、搜索弹窗和提单/运单打开路径
- [x] 新增全局搜索接口，按“先提单、后运单”的优先级返回结果
- [x] 在顶部接入 shadcn 风格搜索对话框和键盘快捷键
- [x] 让提单列表和运单页面支持通过搜索结果自动定位
- [x] 运行前后端校验并记录结果

## Review

- 新增顶部全局搜索弹窗：`front_end/src/components/global-search-dialog.vue`，支持按钮触发和 `⌘K / Ctrl+K` 快捷键，交互样式沿用 shadcn `CommandDialog`。
- 新增前端 API：`front_end/src/services/api/global-search.api.ts`；新增后端接口：`GET /search/global`，实现“先查提单（订单号/提单号），查不到再查运单（运单号/车船号）”。
- 结果跳转策略：提单结果跳到 `提单列表` 并按 `globalBillNo` 自动筛选；运单结果根据运输类型跳到 `配发货-车运/船运` 页面并按 `globalWaybillNo` 自动加载现有运单。
- 已验证：`node --check controllers/api/invoice.js`、`node --check routes_api.js`、`pnpm -C front_end exec vue-tsc --noEmit`

- [x] 排查 `front_end/src/pages/settle/money.vue` 的姓名显示来源，确认是写入占位值还是读取映射错误
- [x] 确认同类逻辑在 `front_end/src/pages/settle/ticket.vue` 也存在相同问题
- [x] 接入登录态用户信息，统一用真实姓名/账号写入开票人与回款人
- [x] 运行前端校验并记录结果

## Review

- 根因确认：`money.vue` 和 `ticket.vue` 在提交回款/开票时都把操作者字段硬编码成 `'current_user'`，后端原样入库，列表页再原样展示。
- 修复方式：复用 `authStore.user`，优先写入 `user.name`，为空时回退 `user.userid`，不改后端接口和数据结构。
- 校验通过：`pnpm exec vue-tsc -b`

## 历史数据清理脚本

- [x] 梳理脚本目录和测试方式，确定采用默认 dry-run + `--apply` 的修复脚本
- [x] 先写脚本纯逻辑测试，覆盖脏数据识别、租户过滤和映射规则
- [x] 实现历史 `current_user` 清理脚本并导出可测试函数
- [x] 运行脚本测试并记录使用方法

## Review

- 新增脚本：`scripts/cleanup-settle-operator-placeholders.js`
- 默认 `dry-run`，只统计命中的 `ticket_person` / `return_person = current_user` 记录；带 `--apply` 才会写库。
- 支持 `--tenant` / `--tenant-id` 限定租户，支持 `--field ticket|return|both` 限定字段。
- 写库时必须显式指定 `--replace-with <name>` 或 `--clear`，避免误把历史数据批量改成错误姓名。
- 测试通过：`node --test test/settle-operator-cleanup.test.js`
- 帮助输出通过：`node scripts/cleanup-settle-operator-placeholders.js --help`

## 综合查询空结果提示修复

- [x] 排查 `/report/integrated_query` 在空结果时返回 `ok: false` 的后端分支，以及前端统一报“查询失败”的原因
- [x] 先补最小回归测试，锁定“空结果应返回成功空集”的行为
- [x] 修复后端空结果返回与前端提示文案，区分“暂无数据”和“真实错误”
- [x] 运行验证并记录结果

## Review

- 根因确认：`controllers/api/report.js` 在综合查询的多个“命中 0 条”分支里返回了 `ok: false, bills: [], total: 0`，例如订单号/提单号快速路径和部分 invoice-first 路径；前端 `integrated.vue` 又把所有 `ok: false` 统一提示为“查询失败”。
- 后端修复：空结果统一改为成功空集响应 `ok: true, bills: [], total: 0, message: '暂无符合条件的数据'`，真实异常仍走 `ok: false` 并带 `error`。
- 前端修复：`ok: true` 且 `total=0` 时提示“暂无符合条件的数据，请调整筛选条件后重试”；`ok: false` 时优先展示后端 `error/message`。
- 测试通过：`node --test test/integrated-query-response.test.js`
- 校验通过：`pnpm exec vue-tsc -b`

## 综合查询订单号/提单号去空格

- [x] 确认综合查询中只有订单号、提单号是自由输入，当前请求未对前后空格做清理
- [x] 先补回归测试，锁定接口会去掉订单号/提单号前后空格
- [x] 前后端同时加 `trim` 兜底，避免复制粘贴空格导致查不到
- [x] 运行验证并记录结果

## Review

- 修复点：综合查询中的订单号 `fOrder`、提单号 `fBno` 在前端发请求前先 `trim`，避免把空格带进 URL。
- 后端兜底：`controllers/api/report.js` 新增 `normalizeIntegratedQueryTextFields`，即使别的客户端直接调接口，`fOrder/fBno` 前后空格也会被清理后再参与查询。
- 回归测试通过：`node --test test/integrated-query-response.test.js`
- 前端校验通过：`pnpm exec vue-tsc -b`

## 磊硕物流部署目标

- [x] 将磊硕物流的 SSH 用户名和密码改为运行时输入，避免在仓库中新增凭据
- [x] 在部署目标菜单和帮助文本中加入 `leishuo`（146.56.224.80）
- [x] 让磊硕物流 Nginx 对外监听 3031，并在前端构建时使用对应 API 地址；其他目标保持 80 公网端口与 1080 后端端口
- [x] 校验脚本语法与目标选择、端口替换逻辑

## Review

- `leishuo` 选择项使用 IP `146.56.224.80`，并在运行时收集 SSH 用户名和密码，不在脚本内新增凭据。
- 该目标的前端产物将 API 地址设为 `http://146.56.224.80:3031/api`；远端部署时以仓库中的 Nginx 模板为基础生成 `listen 3031 default_server` 配置。后端仍使用原有 1080 端口。
- 已验证：`bash -n deploy/deploy.sh`、`git diff --check` 均退出成功；对 Nginx 模板应用相同替换后得到 `listen 3031 default_server`。

## 部署脚本远端 Node 运行时修复

- [x] 根据磊硕服务器部署日志定位到两段远端 SSH 脚本均写死 Node 22 路径，导致非交互 shell 回退到系统 Node 12 且找不到 npm
- [x] 根据磊硕服务器新环境移除全部 NVM 依赖
- [x] 让磊硕固定使用 `~/sw/node-v22/bin`，其他目标保持 `~/sw/node-v22.22/bin`
- [x] 校验两段远端命令均不会加载 NVM，且使用目标对应的固定目录

## Review

- `NODE_INSTALL_DIR` 默认为 `sw/node-v22.22`；选择 `leishuo` 时改为 `sw/node-v22`。
- 两段远端 SSH 命令均直接将该目录加入 `PATH`，不会加载任何版本管理工具。
- 验证：`bash -n deploy/deploy.sh`、`git diff --check` 均成功；检查确认两段远端命令均使用目标目录，脚本中没有 NVM 引用。

## 部署时启动 MongoDB

- [x] 根据后端 `ECONNREFUSED 127.0.0.1:27027` 日志定位 MongoDB 未运行
- [x] 对照 `deploy/server-init.sh`，确认部署主流程错误地以“服务单元存在”代替“服务已运行”
- [x] 改为启动 inactive 的 systemd `mongod`，并保留非 systemd 的 `startdb.sh` 回退路径
- [x] 校验脚本语法和 MongoDB 启动分支

## Review

- 根因：部署脚本先前使用 `systemctl list-units --all` 判断 MongoDB 是否“由 systemd 管理”；inactive 服务也会出现在该列表，因此脚本错误跳过启动，后端连接 `127.0.0.1:27027` 被拒绝。
- 修复：改用 `systemctl is-active --quiet mongod` 判断实际状态。服务已安装但 inactive 时执行 `sudo systemctl start mongod`；无 systemd 服务时才回退到 `startdb.sh`，并在后端重启前确认 `mongod` 进程存在。
- 验证：`bash -n deploy/deploy.sh`、`git diff --check` 均成功；MongoDB 启动段包含 active 检查、systemd 启动、回退路径和进程复查，旧的 `list-units --all` 条件已不存在。

## 非交互部署的 sudo 认证

- [x] 根据 `sudo: a terminal is required` 确认 SSH 登录密码不会自动用于远端 sudo
- [x] 清点部署主流程中的所有 sudo 调用，覆盖 MongoDB 与 Nginx
- [x] 为远端 sudo 提供标准输入密码，并校验脚本与特权调用路径

## Review

- 根因：部署通过 SSH heredoc 执行，未分配终端；`sudo` 无法读取密码。MongoDB 的 `systemctl start` 因而失败，之后 Nginx 配置也会受相同问题影响。
- 修复：磊硕部署目标新增可选 sudo 密码输入（空值复用 SSH 密码）。脚本以 Base64 在远端会话中传递密码，`run_sudo` 使用 `sudo -S` 从标准输入读取；MongoDB、Nginx 文件安装、配置校验和重载均通过该函数执行。
- 验证：`bash -n deploy/deploy.sh`、`git diff --check` 均成功；模拟 `sudo -S` 接收正确密码且命令成功执行，并确认认证函数位于实际部署的远端会话中。

## 磊硕物流项目 MongoDB 配置

- [x] 根据 `ps` 输出确认 systemd 启动的是错误的 `/etc/mongod.conf` 实例
- [x] 确认磊硕物流必须使用 `/home/leishuo/nlsw2/data/config/mongod.conf` 并监听 27027
- [x] 仅为 leishuo 调用 `~/nlsw2/data/script/startdb.sh` 启动项目 MongoDB，其他目标保留既有启动方式
- [x] 以 TCP 27027 连通性校验项目 MongoDB 已就绪

## Review

- 根因：`mongod` 进程来自 systemd 的 `/etc/mongod.conf`，并非磊硕项目的配置；该实例没有监听应用依赖的 27027，因此 Mongoose 报 `ECONNREFUSED`。
- 修复：`leishuo` 专用 `project` 模式停止 active 的默认 systemd MongoDB 后，后台调用 `$DEPLOY_PATH/data/script/startdb.sh`；不再由部署脚本直接执行 `mongod`。其他目标保持现有 systemd / `startdb.sh` 策略。
- 验证：`data/script/startdb.sh` 具备执行权限；`bash -n deploy/deploy.sh`、`git diff --check` 均成功；静态检查确认项目启动脚本、启动日志及 TCP 27027 就绪检查均已接入。

## 部署脚本 PM2 运行时可靠性

- [x] 先添加回归测试，固定前端必须使用目标 Node 的绝对 `serve` 路径
- [x] 在前后端 PM2 启动后校验进程处于 online，失败时输出日志并终止部署
- [x] 运行脚本语法、回归测试和远端服务连通性验证
- [x] 让 PM2 systemd 开机服务通过 `run_sudo` 配置，避免 Node/NVM 迁移后重启丢失服务

## Review

- 根因：新 Node 目录里安装的是 PM2 7.0.3，而守护进程仍是旧 Node/NVM 环境的 PM2 5.4.3；后端因此停留在 `launching`。旧 PM2 保存的前端命令还是裸 `serve`，NVM 删除后会以 exit 127 无限重试。
- 线上处置：执行 `pm2 update` 后发现旧条目已经失效，最终清洁重建 PM2，并仅恢复 `nlsw-backend`（Node 22.22.0）和以 `/home/leishuo/sw/node-v22/bin/serve` 启动的 `nlsw-frontend`。二者均为 `online`，本机 3000/1080 及 Nginx 3031/API 反代均验证成功。
- 脚本修复：前端改用目标 Node 下的绝对 `serve` 路径；前后端在 `pm2 start` 后均通过 `pm2 pid` 验证在线，失败时输出最近 50 行日志并终止部署。PM2 的 systemd 开机服务改为通过 `run_sudo` 和目标 Node `PATH` 配置，失败不再静默跳过。
- 校验：`node --test test/deploy-script-pm2.test.js`、`bash -n deploy/deploy.sh`、`git diff --check` 全部通过。
