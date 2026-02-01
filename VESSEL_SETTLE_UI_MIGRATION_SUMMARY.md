# 车船结算 Element Plus → Shadcn UI 迁移摘要

## 状态：已完成 ✅

所有计划内的组件迁移工作已全部完成，并修复了迁移过程中发现的语法、导入、预处理器和运行时错误。

## 已完成的替换

### vessel.vue (主页面)
- **下拉选择框**: `el-select` → `Select`
- **日期选择器**: `el-date-picker` → `DatePicker`
- **输入框**: `el-input` → `Input`
- **消息提示**: `ElMessage` → `toast` (vue-sonner)
- **确认对话框**: `ElMessageBox.confirm` → `window.confirm` / Custom Dialogs
- **状态管理**: 修复了 `useUserStore` 导入错误，已统一使用 `useAuthStore` (@/stores/auth)
- **日期处理**: 修复了 `moment` 未定义错误，已统一使用 `dayjs`
- **样式**: 移除了 SCSS 依赖，将嵌套样式重构为标准 CSS
- **过滤器**: 修复了 `SelectItem` 不允许空值的问题，使用 `__ALL__` 作为"全部"的标识值

### 对话框组件 (全部已迁移)

1. **VesselDetailDialog.vue** (明细对话框)
   - 使用 `Dialog`, `Table` 组件重构
   - 移除了 SCSS 依赖

2. **VesselPriceInputDialog.vue** (单行价格输入)
   - 使用 `Dialog`, `Label`, `RadioGroup`, `Input`, `Button` 重构
   - 修复了 API 导入错误 (`import * as settleApi`)

3. **VesselBatchPriceInputDialog.vue** (批量价格输入)
   - 使用 `Dialog`, `Input`, `Label`, `Button`, `RadioGroup` 重构
   - 修复了 API 导入错误

4. **VesselDelayInfoDialog.vue** (回执滞留信息)
   - 使用 `Dialog`, `Input`, `DatePicker`, `Checkbox`, `Button` 重构
   - 日期处理已从 `moment` 迁移到 `dayjs`
   - 修复了 API 导入错误

5. **VesselPrintDialog.vue** (打印对话框)
   - 使用 `Dialog`, `Table`, `Button` 重构
   - 日期处理已从 `moment` 迁移到 `dayjs`

6. **VesselReceiptImageDialog.vue** (回执图片查看)
   - 使用 `Dialog`, `Button` 重构
   - 修复了 API 导入错误

7. **VesselUploadReceiptDialog.vue** (上传回执)
   - 使用 `Dialog`, `Button`, `Progress` 重构
   - 使用 `lucide-vue-next` 图标替换 `el-icon`
   - 修复了 API 导入错误

## 关键错误修复 (Bug Fixes)

1. **DatePicker 语法错误**: 修复了 `@internationalized/date` 中 `toDate` 不存在的问题，改为使用 `date.toDate()` 方法。
2. **依赖缺失修复**: 将所有组件中的 `moment` 替换为项目中已有的 `dayjs`。
3. **Store 导入修复**: 修复了 `vessel.vue` 中 `useUserStore` 路径错误，更正为 `@/stores/auth` 中的 `useAuthStore`。
4. **Progress 组件**: 在 `VesselUploadReceiptDialog.vue` 中正确使用了 Shadcn UI 的 `Progress` 组件。
5. **CSS 预处理器修复**: 移除了所有组件中的 `lang="scss"`，解决了 `sass-embedded` 缺失的问题。
6. **API 导入修复**: 修正了 `settle.api.ts` 的导入方式，从 `import { settleApi }` 改为 `import * as settleApi`。
7. **Select 组件修复**: 修复了 `Select` 组件中 `SelectItem` 不接受空字符串值的问题，改为使用特殊标记 `__ALL__` 并相应更新了查询逻辑。

## 组件映射表回顾

| Element Plus | Shadcn UI | 导入路径 |
|--------------|-----------|----------|
| el-select | Select | @/components/ui/select |
| el-date-picker | DatePicker | @/components/ui/date-picker |
| el-input | Input | @/components/ui/input |
| el-button | Button | @/components/ui/button |
| el-dialog | Dialog | @/components/ui/dialog |
| el-table | Table | @/components/ui/table |
| el-radio | RadioGroup | @/components/ui/radio-group |
| el-checkbox | Checkbox | @/components/ui/checkbox |
| el-progress | Progress | @/components/ui/progress |
| el-form-item | Label + div | @/components/ui/label |
| ElMessage | toast | vue-sonner |

## 后续建议

1. **统一日期库**: 建议全局搜索并确保不再引入 `moment`，统一使用 `dayjs` 以减小包体积。
2. **类型检查**: 建议运行 `pnpm build` 或 `vue-tsc` 进行全面的类型检查，确保迁移后的组件接口完全匹配。
3. **样式统一**: 建议检查项目中其他使用 SCSS 的文件，逐步迁移到 CSS 或引入 Sass 支持（如果需要）。
4. **组件规范**: 确保所有 `SelectItem` 组件的 `value` 属性都不为空字符串，遵循 Shadcn UI 的最佳实践。
