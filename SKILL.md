---
name: nlsw-patterns
description: nlsw 仓储的编码约定与模式速查（Vue3+TS 前端 / Express+Mongo 后端）
version: 2.0.0
source: condensed from local git history analysis
---

# NLSW 编码约定

**技术栈**：前端 Vue 3 + TypeScript + shadcn-vue(reka-ui) + Vite；后端 Node + Express + Mongoose(MongoDB)；包管理 pnpm。
**业务**：货运/集装箱物流管理 SaaS（订单 → 配发 → 结算 → 开票 → 回款），多租户，另含考勤与薪资模块。业务字段与用户可见文案用中文。

> 本文件是速查表，**不是代码模板**。示例以仓库里的现有文件为准，不要照抄这里的片段。

## 目录骨架

```
front_end/src/
├── components/{ui,data-table,global-layout,app-sidebar}/
├── composables/        # use-*.ts
├── pages/              # 文件路由 (unplugin-vue-router)：bills/settle/invoices/reports/attendance/admin/platform/settings
├── services/api/       # *.api.ts
├── stores/             # pinia
├── types/  utils/
后端：controllers/api/*.js + models/*.js + routes_api.js（接口）/ routes.js（页面）
```

## 命名

| 位置 | 约定 | 例 |
|---|---|---|
| Vue 组件 / 类型 | PascalCase | `BillFilter.vue`、`BillCreateData` |
| composable | `use-` 前缀 | `use-auth.ts`、`use-axios.ts` |
| API 服务 | kebab + `.api.ts` | `vessel-settle.api.ts` |
| 页面文件 | kebab-case | `create-ship.vue` |
| 后端 model | PascalCase | `Bill.js`、`PayrollStatement.js` |
| 后端 controller / DB 字段 | snake_case | `vessel_settle.js`、`bill_no` |

## 接口约定

- 成功 `{ ok: true, data, total?, page?, totalPages? }`；失败 `{ ok: false, error }`（部分老接口用 `msg`，前端两者都要兜）。
- 控制器一律 try/catch，异常走 `res.status(500).json({ ok: false, error })` 并 `console.error`，不许吞。
- 分页从 query 解析并给默认值（`page=1`、`limit=20`）；列表模糊搜 `{ $regex, $options: 'i' }`；读多写少的查询加 `.lean()`。
- 前端请求统一走 `composables/use-axios.ts` 的 `axiosInstance`，服务层函数返回 `response.data`（不给调用方留 `response` 包装）。
- 页面鉴权用 `<route lang="yaml">meta: { auth: true }</route>`。

## 数据模型

- 派生字段（如 `status` ↔ `status_flag`）在 `pre('save')` / `pre('findOneAndUpdate')` 里统一同步，不要散在控制器里改。
- 常用查询字段建索引；导出/解析 Excel 用 `xlsx` / `exceljs`。

## 前端模式

- 页面骨架用 `BasicPage`（`title` / `description` + `#actions` 插槽）包住内容。
- 弹窗用 `UiDialog`（内容区 `max-h-[90vh] overflow-y-auto`），反馈用 `vue-sonner` 的 `toast`。
- 表格必须两套：桌面 `<table>`（外层 `hidden lg:block border rounded-lg overflow-x-auto`）+ 移动端卡片（`lg:hidden`）。
- 全局状态进 Pinia，页面内状态用 `ref`。
- **视觉基调默认收敛克制**：文案只留必要、辅助控件不抢中心、图标用通用隐喻、层级靠位置与分组表达；细则见 `AGENTS.md` §5。

## 常用流程（最短路径）

- **加页面**：`pages/<模块>/<名>.vue` →（需鉴权）加 route meta → `services/api/<名>.api.ts` → `controllers/api/<名>.js` → 注册 `routes_api.js`。
- **加接口**：控制器函数 → `routes_api.js` → `.api.ts` 类型化函数（补 request/response interface）。
- **改模型**：`models/*.js`（含索引与钩子）→ 前端类型同步，别只改一处。

## 业务状态值（保持中文原文，勿翻译）

新建 / 待配发 / 部分配发 / 已配发 / 已结算 / 已开票 / 已回款

## 提交信息

现状中英混用（`feat:` / `fix:` / `优化` / `bug fixed`）。新提交统一 `feat: / fix: / refactor: / chore:` + 简短描述。
