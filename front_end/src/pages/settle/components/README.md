# 车船结算对话框组件

## 已实现的组件

### 1. VesselPriceInputDialog.vue - 单行价格输入对话框

**功能：**

- 单个运单或车辆的价格输入
- 支持两种输入模式：
  - 每吨单价（unit）：输入单价，自动计算总价
  - 打包价（bale）：输入总价，自动计算单价
- 模式切换时自动转换价格值
- 支持备注输入
- 区分主运单和内部车辆

**使用方法：**

```vue
<script setup>
import VesselPriceInputDialog from './components/VesselPriceInputDialog.vue'

const priceDialog = ref()

// 打开对话框
function openPriceDialog() {
  // 主运单
  priceDialog.value?.open(invoiceData, true)

  // 或内部车辆
  priceDialog.value?.open(invoiceData, false, innerWaybillNo)
}

// 确认回调
function handlePriceConfirm(priceData) {
  console.log('价格已保存:', priceData)
  // 刷新数据
}
</script>

<template>
  <VesselPriceInputDialog ref="priceDialog" @confirm="handlePriceConfirm" />
</template>
```

**参数说明：**

- `invoice`: 运单数据对象
- `forVessel`: boolean，true表示主运单，false表示内部车辆
- `innerNo`: string，内部运单号（仅在forVessel=false时需要）

**事件：**

- `confirm`: 价格保存成功后触发，参数为价格数据数组

---

### 2. VesselBatchPriceInputDialog.vue - 批量价格输入对话框

**功能：**

- 批量设置多个运单/车辆的价格
- 自动按车船号分组
- 每组显示总重量和明细
- 支持单价/打包价模式
- 每组可单独设置价格和备注
- 模式切换时自动转换所有组的价格

**使用方法：**

```vue
<script setup>
import VesselBatchPriceInputDialog from './components/VesselBatchPriceInputDialog.vue'

const batchPriceDialog = ref()

// 打开对话框
function openBatchPriceDialog() {
  batchPriceDialog.value?.open(
    selectedRecords, // 选中的主运单数组
    selectedInnerNos, // 选中的内部运单号数组
    allRecords // 所有运单数据（用于查找内部运单的完整信息）
  )
}

// 确认回调
function handleBatchPriceConfirm(priceData) {
  console.log('批量价格已保存:', priceData)
  // 刷新数据
}
</script>

<template>
  <VesselBatchPriceInputDialog
    ref="batchPriceDialog"
    @confirm="handleBatchPriceConfirm"
  />
</template>
```

**参数说明：**

- `selectedRecords`: 选中的主运单数组
- `selectedInnerNos`: 选中的内部运单号字符串数组
- `allRecords`: 所有运单数据数组

**事件：**

- `confirm`: 批量价格保存成功后触发，参数为价格数据数组

---

## 数据结构

### 价格数据格式（priceData）

```typescript
{
  wno: string,           // 运单号
  price: number,         // 总价（用于保存）
  inner: number,         // 0=主运单, 1=内部车辆
  mode: number,          // 0=单价模式, 1=打包价模式
  unitPrice: number,     // 单价（保存到数据库的值）
  remark: string         // 备注
}
```

### 运单数据格式（invoice）

```typescript
{
  waybill_no: string,           // 运单号
  vehicle_vessel_name: string,   // 车船号
  ship_from: string,            // 起始地
  ship_to: string,              // 目的地
  total_weight: number,         // 总重量
  vessel_price: number,         // 车船单价
  price_remark: string,         // 价格备注
  bills: [{                     // 提单数组
    vehicles: [{                // 车辆数组
      inner_waybill_no: string, // 内部运单号
      veh_name: string,         // 车辆名称
      veh_ship_from: string,    // 车辆起始地
      send_num: number,         // 发运块数
      send_weight: number,      // 发运重量
      veh_price: number,        // 车辆单价
      price_remark: string      // 价格备注
    }]
  }]
}
```

---

## API 接口

### 更新价格

```typescript
await settleApi.updateVesselPrice({
  wnoList: string[],      // 运单号列表
  priceData: PriceData[]  // 价格数据数组
})
```

---

---

### 3. VesselDelayInfoDialog.vue - 回执滞留信息对话框

**功能：**

- 预付现金/预付油卡输入
- 卸船日期选择（带日期限制）
- 滞留天数自动计算：卸船日期 - 发货日期 - 7天
- 手动输入滞留天数时自动计算卸船日期
- 回执状态勾选
- 回执图片上传（最大8M）
- 图片预览
- 备注信息输入
- 支持单条记录模式和批量模式

**使用方法：**

```vue
<script setup>
import VesselDelayInfoDialog from './components/VesselDelayInfoDialog.vue'

const delayDialog = ref()

// 打开对话框 - 单条记录
function openDelayDialog() {
  // 主运单
  delayDialog.value?.open(invoiceData, true)

  // 或内部车辆
  delayDialog.value?.open(invoiceData, false, innerWaybillNo)
}

// 打开对话框 - 批量模式（仅预付信息）
function openBatchDelayDialog() {
  delayDialog.value?.openBatch()
}

// 确认回调
function handleDelayConfirm() {
  // 刷新数据
}
</script>

<template>
  <VesselDelayInfoDialog ref="delayDialog" @confirm="handleDelayConfirm" />
</template>
```

**参数说明：**

- `invoice`: 运单数据对象
- `forVessel`: boolean，true表示主运单，false表示内部车辆
- `innerNo`: string，内部运单号（仅在forVessel=false时需要）

**事件：**

- `confirm`: 信息保存成功后触发

**特殊逻辑：**

1. **滞留天数自动计算**：选择卸船日期后自动计算滞留天数（卸船日期 - 发货日期 - 7）
2. **卸船日期自动计算**：手动输入滞留天数后自动计算卸船日期（发货日期 + 滞留天数 + 7）
3. **日期限制**：卸船日期不能早于发货日期
4. **图片上传**：支持拖拽和点击上传，最大8M
5. **批量模式**：只显示预付现金和油卡输入，不显示卸船日期和回执

---

### 4. VesselDetailDialog.vue - 显示明细对话框

**功能：**

- 显示运单的所有提单明细
- 包含提单号、订单号、规格、重量等详细信息
- 如果有车辆信息，显示每个提单的车辆发运明细
- 支持表格排序和筛选

**使用方法：**

```vue
<script setup>
import VesselDetailDialog from './components/VesselDetailDialog.vue'

const detailDialog = ref()

// 打开对话框
function openDetailDialog() {
  detailDialog.value?.open(invoiceData)
}
</script>

<template>
  <VesselDetailDialog ref="detailDialog" />
</template>
```

**参数说明：**

- `invoice`: 运单数据对象

**显示字段：**

- 提单号
- 订单号-项次号
- 发货仓库
- 厚度、宽度、长度
- 单重
- 总块数、总重量
- 发运块数、发运重量
- 车号（如果有车辆信息）

---

## 待实现的组件

1. **PrintDialog.vue** - 打印清单对话框
2. **ReceiptImageDialog.vue** - 查看回执图片对话框
3. **UploadReceiptDialog.vue** - 上传回执图片对话框

---

## 注意事项

1. 所有对话框都使用 Element Plus 的 `el-dialog` 组件
2. 价格输入时自动保留3位小数（单价）或2位小数（总价）
3. 支持 -1 作为特殊价格，表示"不需要结算"
4. 模式切换时会自动转换价格，避免手动计算错误
5. 所有对话框都有 loading 状态，防止重复提交
6. 表单验证确保输入有效性

---

## 样式说明

组件使用 SCSS 编写样式，包含：

- 响应式布局
- Element Plus 主题适配
- 帮助文本样式（灰色小字）
- 输入框分组布局
- 悬停效果

---

## 测试建议

1. 测试单价/打包价模式切换
2. 测试空值和无效值处理
3. 测试主运单和内部车辆的区分
4. 测试批量输入的分组逻辑
5. 测试价格计算的精度
6. 测试保存后的刷新机制
