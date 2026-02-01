<script setup lang="ts">
import { computed } from 'vue'

import type { SettleBill, SettleMode } from '../types'

import { COLLECTION_SETTLE_FLAG, CUSTOMER_SETTLE_FLAG } from '../types'

const props = defineProps<{
  bills: SettleBill[]
  settleMode: SettleMode
  loading: boolean
  otherModeHasData: boolean
  selected: SettleBill[]
}>()

const emit = defineEmits<{
  (e: 'update:selected', bills: SettleBill[]): void
  (e: 'switch-mode', mode: SettleMode): void
}>()

// 是否全选
const allSelected = computed(() => {
  return props.bills.length > 0 && props.selected.length === props.bills.length
})

// 切换全选
function toggleAll() {
  if (allSelected.value) {
    emit('update:selected', [])
  }
  else {
    emit('update:selected', [...props.bills])
  }
}

// 切换单个提单选择
function toggleBill(bill: SettleBill) {
  const index = props.selected.findIndex(
    b => b._id === bill._id && b.inv_no === bill.inv_no && b.veh_ves_name === bill.veh_ves_name,
  )
  if (index >= 0) {
    const newSelected = [...props.selected]
    newSelected.splice(index, 1)
    emit('update:selected', newSelected)
  }
  else {
    emit('update:selected', [...props.selected, bill])
  }
}

// 判断是否选中
function isSelected(bill: SettleBill) {
  return props.selected.some(
    b => b._id === bill._id && b.inv_no === bill.inv_no && b.veh_ves_name === bill.veh_ves_name,
  )
}

// 获取当前价格
function getPrice(bill: SettleBill) {
  return props.settleMode === 'CUSTOMER' ? bill.price : bill.collection_price
}

// 获取价格显示
function getPriceDisplay(price: number) {
  if (price > 0)
    return { text: price.toFixed(2), class: 'text-green-600 font-semibold' }
  if (price < 0)
    return { text: '不需要结算', class: 'text-blue-600' }
  return { text: '0', class: 'text-red-600 font-semibold' }
}

// 获取总价格
function getTotalPrice(bill: SettleBill) {
  const price = getPrice(bill)
  if (price > 0) {
    return (price * bill.send_weight).toFixed(2)
  }
  return '-'
}

// 获取结算状态
function getStatus(bill: SettleBill) {
  if (!bill.inv_settle_flag || bill.inv_settle_flag === 0) {
    if (bill.price === -1 && bill.collection_price === -1)
      return { text: '客户,代收不需结算', class: 'bg-blue-100 text-blue-700' }
    if (bill.price === -1)
      return { text: '客户不需结算', class: 'bg-blue-100 text-blue-700' }
    if (bill.collection_price === -1)
      return { text: '代收不需结算', class: 'bg-blue-100 text-blue-700' }
    return { text: '未结算', class: 'bg-gray-100 text-gray-700' }
  }

  const statusText: string[] = []
  if ((bill.inv_settle_flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG) {
    statusText.push('客户')
  }
  if ((bill.inv_settle_flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG) {
    statusText.push('代收付')
  }
  return { text: `${statusText.join(',')}已结算`, class: 'bg-green-100 text-green-700' }
}

// 获取订单显示（包含项次号）
function getOrderDisplay(bill: SettleBill) {
  if (bill.order_item_no) {
    const itemNo = String(bill.order_item_no).padStart(3, '0')
    return `${bill.order_no}-${itemNo}`
  }
  return bill.order_no
}

// 获取开单名称显示（包含发货单位）
function getBillingNameDisplay(bill: SettleBill) {
  if (bill.ship_customer) {
    return `${bill.billing_name}/${bill.ship_customer}`
  }
  return bill.billing_name
}

// 格式化日期
function formatDate(date: string) {
  if (!date)
    return '-'
  return new Date(date).toLocaleDateString('zh-CN')
}

// 获取规格显示
function getSpecDisplay(bill: SettleBill) {
  const width = bill.width || 0
  const len = bill.len || 0
  const thickness = bill.thickness || 0

  if (width < 3000 && len < 13500) {
    return '正常'
  }
  else if ((width >= 3000 && width < 3300) || (len >= 13500 && len < 16500)) {
    return '超长宽'
  }
  else if (width >= 3300 || len >= 16500) {
    return '特长宽'
  }
  else {
    // 如果不符合任何规格分类，显示实际尺寸（长*宽*厚）
    return `${len}*${width}*${thickness}`
  }
}

// 获取空数据提示消息
const emptyMessage = computed(() => {
  if (props.otherModeHasData) {
    const otherMode: SettleMode = props.settleMode === 'CUSTOMER' ? 'COLLECTION' : 'CUSTOMER'
    const otherModeName = props.settleMode === 'CUSTOMER' ? '南钢结算' : '客户结算'
    return {
      hasOtherMode: true,
      prefix: '当前结算模式下暂无数据，您可以切换到',
      modeName: otherModeName,
      mode: otherMode,
      suffix: '查看',
    }
  }
  return {
    hasOtherMode: false,
    text: '没有符合条件的数据，请调整过滤条件或日期范围',
  }
})

// 切换到另一个结算模式
function switchToOtherMode() {
  if (emptyMessage.value.hasOtherMode) {
    emit('switch-mode', emptyMessage.value.mode)
  }
}
</script>

<template>
  <div class="border rounded-lg overflow-hidden">
    <div class="overflow-x-auto max-h-[calc(100vh-320px)]">
      <table class="w-full text-sm border-collapse">
        <thead class="bg-muted/80 sticky top-0 z-10">
          <tr class="border-b">
            <th class="px-1 py-1.5 text-left w-8 border-r border-border/50">
              <input
                type="checkbox"
                :checked="allSelected"
                :disabled="bills.length === 0"
                class="h-4 w-4 rounded border-gray-300 cursor-pointer"
                @change="toggleAll"
              >
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[80px] border-r border-border/50 text-xs">
              状态
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[95px] border-r border-border/50 text-xs">
              订单号
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[95px] border-r border-border/50 text-xs">
              提单号
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[110px] border-r border-border/50 text-xs">
              开单名称
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[90px] border-r border-border/50 text-xs">
              车船
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[70px] border-r border-border/50 text-xs">
              目的地
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[70px] border-r border-border/50 text-xs">
              总价格
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[65px] border-r border-border/50 text-xs">
              单价
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[65px] border-r border-border/50 text-xs">
              发运块数
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[70px] border-r border-border/50 text-xs">
              发运重量
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[65px] border-r border-border/50 text-xs">
              起始地
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[70px] border-r border-border/50 text-xs">
              发货仓库
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[90px] border-r border-border/50 text-xs">
              发货日期
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[65px] border-r border-border/50 text-xs">
              发货人
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[115px] border-r border-border/50 text-xs">
              运单号
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[85px] text-xs">
              规格
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- 加载状态 -->
          <tr v-if="loading">
            <td colspan="17" class="p-8 text-center text-muted-foreground">
              加载中...
            </td>
          </tr>

          <!-- 空状态 -->
          <tr v-else-if="bills.length === 0">
            <td colspan="17" class="p-8 text-center">
              <div class="flex flex-col items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p v-if="emptyMessage.hasOtherMode" class="text-muted-foreground">
                  {{ emptyMessage.prefix }}
                  <button
                    type="button"
                    class="text-blue-600 hover:text-blue-700 font-medium underline decoration-blue-600/30 hover:decoration-blue-700 underline-offset-2 transition-colors"
                    @click="switchToOtherMode"
                  >
                    {{ emptyMessage.modeName }}
                  </button>
                  {{ emptyMessage.suffix }}
                </p>
                <p v-else class="text-muted-foreground">
                  {{ emptyMessage.text }}
                </p>
              </div>
            </td>
          </tr>

          <!-- 数据行 -->
          <tr
            v-for="bill in bills"
            v-else
            :key="`${bill._id}-${bill.inv_no}-${bill.veh_ves_name}`"
            :class="{ 'bg-blue-50 border-l-4 border-l-blue-500': isSelected(bill) }"
            class="border-b hover:bg-muted/50 cursor-pointer transition-colors"
            @click="toggleBill(bill)"
          >
            <td class="px-1 py-1.5 border-r border-border/50" @click.stop>
              <input
                type="checkbox"
                :checked="isSelected(bill)"
                class="h-4 w-4 rounded border-gray-300 cursor-pointer"
                @change="toggleBill(bill)"
              >
            </td>
            <td class="px-1.5 py-1.5 text-xs border-r border-border/50">
              <span class="px-2 py-0.5 rounded text-xs font-medium" :class="getStatus(bill).class">
                {{ getStatus(bill).text }}
              </span>
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ getOrderDisplay(bill) }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.bill_no }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ getBillingNameDisplay(bill) }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.veh_ves_name }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.ship_to }}
            </td>
            <td class="px-1.5 py-1.5 font-mono text-center border-r border-border/50">
              {{ getTotalPrice(bill) }}
            </td>
            <td class="px-1.5 py-1.5 font-mono text-center border-r border-border/50" :class="getPriceDisplay(getPrice(bill)).class">
              {{ getPriceDisplay(getPrice(bill)).text }}
            </td>
            <td class="px-1.5 py-1.5 text-center border-r border-border/50">
              {{ bill.send_num || '' }}
            </td>
            <td class="px-1.5 py-1.5 text-center font-mono border-r border-border/50">
              {{ bill.send_weight.toFixed(3) }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.ship_from }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.ship_warehouse || '-' }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ formatDate(bill.inv_ship_date) }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.inv_shipper || '-' }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.inv_no }}
            </td>
            <td class="px-1.5 py-1.5 text-xs">
              {{ getSpecDisplay(bill) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
