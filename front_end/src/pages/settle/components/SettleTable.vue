<script setup lang="ts">
import { computed } from 'vue'

import type { SettleBill, SettleMode } from '../types'
import { formatDate } from '@/utils/format'

import { COLLECTION_SETTLE_FLAG, CUSTOMER_SETTLE_FLAG } from '../types'

const props = defineProps<{
  bills: SettleBill[]
  settleMode: SettleMode
  loading: boolean
  otherModeHasData: boolean
  selected: SettleBill[]
  basketBills?: SettleBill[]
}>()

const emit = defineEmits<{
  (e: 'update:selected', bills: SettleBill[]): void
  (e: 'switch-mode', mode: SettleMode): void
}>()

// 可选的提单（排除已在结算篮中的）
const selectableBills = computed(() => {
  if (!props.basketBills)
    return props.bills
  return props.bills.filter(bill => !props.basketBills!.some(b => b._id === bill._id))
})

// 是否全选（只计算可选的提单）
const allSelected = computed(() => {
  return selectableBills.value.length > 0 && props.selected.length === selectableBills.value.length
})

// 切换全选（只选择可选的提单）
function toggleAll() {
  if (allSelected.value) {
    emit('update:selected', [])
  }
  else {
    emit('update:selected', [...selectableBills.value])
  }
}

// 判断两个提单是否相同（使用更精确的条件）
function isSameBill(bill1: SettleBill, bill2: SettleBill) {
  return bill1._id === bill2._id
    && bill1.inv_no === bill2.inv_no
    && bill1.veh_ves_name === bill2.veh_ves_name
    && bill1.send_num === bill2.send_num
    && bill1.send_weight === bill2.send_weight
}

// 切换单个提单选择
function toggleBill(bill: SettleBill) {
  // 如果已在结算篮中，不允许选择
  if (isInBasket(bill))
    return

  const index = props.selected.findIndex(b => isSameBill(b, bill))
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
  return props.selected.some(b => isSameBill(b, bill))
}

// 判断是否在结算篮中
function isInBasket(bill: SettleBill) {
  if (!props.basketBills)
    return false
  return props.basketBills.some(b => isSameBill(b, bill))
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

  const parts: string[] = []

  // 客户结算状态
  if ((bill.inv_settle_flag & CUSTOMER_SETTLE_FLAG) === CUSTOMER_SETTLE_FLAG) {
    parts.push('客户已结算')
  } else if (bill.price === -1) {
    parts.push('客户不需结算')
  }

  // 代收付结算状态
  if ((bill.inv_settle_flag & COLLECTION_SETTLE_FLAG) === COLLECTION_SETTLE_FLAG) {
    parts.push('代收已结算')
  } else if (bill.collection_price === -1) {
    parts.push('代收不需结算')
  }

  const text = parts.join(',')
  const allDone = parts.length > 0 && parts.every(p => p.includes('已结算') || p.includes('不需结算'))
  return { text, class: allDone ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700' }
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
  if (emptyMessage.value.hasOtherMode && emptyMessage.value.mode) {
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
                :disabled="selectableBills.length === 0"
                class="h-4 w-4 rounded border-gray-300"
                :class="selectableBills.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
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
            <th class="px-1.5 py-1.5 text-left min-w-[110px] border-r border-border/50 text-xs">
              车船/运单号
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[65px] border-r border-border/50 text-xs">
              发运块数
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[70px] border-r border-border/50 text-xs">
              发运重量
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[65px] border-r border-border/50 text-xs">
              单价
            </th>
            <th class="px-1.5 py-1.5 text-center min-w-[70px] border-r border-border/50 text-xs">
              总价格
            </th>
            <th class="px-1.5 py-1.5 text-left min-w-[120px] border-r border-border/50 text-xs">
              始发→目的地
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
            :class="{
              'bg-amber-100 border-l-4 border-l-amber-500': isSelected(bill),
              'bg-orange-100 border-l-4 border-l-orange-500 opacity-60': isInBasket(bill),
              'hover:bg-amber-50 cursor-pointer': !isInBasket(bill),
              'cursor-not-allowed': isInBasket(bill),
            }"
            class="border-b transition-colors"
            @click="toggleBill(bill)"
          >
            <td class="px-1 py-1.5 border-r border-border/50" @click.stop>
              <input
                type="checkbox"
                :checked="isSelected(bill) || isInBasket(bill)"
                :disabled="isInBasket(bill)"
                class="h-4 w-4 rounded border-gray-300"
                :class="isInBasket(bill) ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'"
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
              <div class="flex items-center gap-1.5">
                <span>{{ bill.bill_no }}</span>
                <span
                  v-if="isInBasket(bill)"
                  class="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-orange-500 text-white rounded text-[10px] font-medium whitespace-nowrap"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1" /><circle cx="19" cy="21" r="1" /><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12" /></svg>
                  已在结算篮
                </span>
              </div>
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50 whitespace-nowrap">
              <div v-if="bill.ship_customer" class="leading-tight">
                <div class="font-medium">{{ bill.billing_name }}</div>
                <div class="text-muted-foreground text-[11px]">{{ bill.ship_customer }}</div>
              </div>
              <span v-else>{{ bill.billing_name }}</span>
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              <div class="leading-tight">
                <div class="font-medium">{{ bill.veh_ves_name }}</div>
                <div class="text-muted-foreground text-[11px]">{{ bill.inv_no }}</div>
              </div>
            </td>
            <td class="px-1.5 py-1.5 text-center border-r border-border/50">
              {{ bill.send_num || '' }}
            </td>
            <td class="px-1.5 py-1.5 text-center font-mono border-r border-border/50">
              {{ bill.send_weight.toFixed(3) }}
            </td>
            <td class="px-1.5 py-1.5 font-mono text-center border-r border-border/50" :class="getPriceDisplay(getPrice(bill)).class">
              {{ getPriceDisplay(getPrice(bill)).text }}
            </td>
            <td class="px-1.5 py-1.5 font-mono text-center border-r border-border/50">
              {{ getTotalPrice(bill) }}
            </td>
            <td class="px-1.5 py-1.5 border-r border-border/50">
              {{ bill.ship_from }}→{{ bill.ship_to }}
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
            <td class="px-1.5 py-1.5 text-xs">
              {{ getSpecDisplay(bill) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
