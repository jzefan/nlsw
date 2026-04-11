# 结算页操作者姓名修复

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
