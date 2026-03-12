<script setup lang="ts">
import { CheckSquare, ChevronDown, ChevronUp, Square } from 'lucide-vue-next'

import type { Bill } from '@/services/api/bill.api'
import { formatDate, formatDim, formatNumber } from '@/utils/format'

const props = defineProps<{
  bills: Bill[]
  loading?: boolean
  emptyText?: string
  getStatusVariant?: (status: string) => string
}>()

const emit = defineEmits<{
  (e: 'select', bill: Bill): void
}>()

defineSlots<{
  expandActions?: (props: { bill: Bill }) => any
}>()

const selectedIds = defineModel<Set<string>>('selectedIds', { default: () => new Set() })
const expandedCards = ref<Set<string>>(new Set())

function toggleCardExpand(billId: string) {
  if (expandedCards.value.has(billId)) {
    expandedCards.value.delete(billId)
  }
  else {
    expandedCards.value.add(billId)
  }
}

function isSelected(bill: Bill) {
  return selectedIds.value.has(bill._id!)
}

function toggleSelect(bill: Bill) {
  emit('select', bill)
}

function statusVariant(status: string) {
  if (props.getStatusVariant) return props.getStatusVariant(status)
  if (status === '新建') return 'secondary'
  if (status === '已配发') return 'default'
  if (status === '已结算' || status === '已开票' || status === '已回款') return 'outline'
  return 'secondary'
}
</script>

<template>
  <div class="space-y-2">
    <div
      v-for="bill in bills"
      :key="bill._id"
      class="border rounded-lg overflow-hidden"
      :class="{ 'border-primary bg-primary/5': isSelected(bill) }"
    >
      <!-- 卡片头部 -->
      <div class="p-3 flex items-start gap-3" @click="toggleSelect(bill)">
        <button class="mt-0.5 flex items-center shrink-0 focus:outline-none" @click.stop="toggleSelect(bill)">
          <CheckSquare v-if="isSelected(bill)" class="w-4 h-4 text-primary" />
          <Square v-else class="w-4 h-4 text-muted-foreground" />
        </button>
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="font-medium text-sm truncate">{{ bill.billing_name }}</span>
            <UiBadge :variant="statusVariant(bill.status) as any" class="shrink-0">
              {{ bill.status }}
            </UiBadge>
          </div>
          <div class="text-sm text-muted-foreground space-y-0.5">
            <div class="flex items-center justify-between">
              <span>订单: {{ bill.order_no }}-{{ bill.order_item_no }}</span>
              <button
                class="text-primary hover:text-primary/80 p-1"
                @click.stop="toggleCardExpand(bill._id!)"
              >
                <ChevronDown v-if="!expandedCards.has(bill._id!)" class="w-4 h-4" />
                <ChevronUp v-else class="w-4 h-4" />
              </button>
            </div>
            <div>提单号: {{ bill.bill_no }}</div>
            <div>牌号: {{ bill.brand_no }}</div>
            <div class="flex items-center justify-between">
              <span>总重量: {{ formatNumber(bill.total_weight, 2) }}</span>
              <span :class="bill.left_num > 0 ? 'text-blue-600 font-medium' : 'text-green-600'">
                余量: {{ formatNumber(bill.left_num, 2) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 展开的详细信息 -->
      <div v-if="expandedCards.has(bill._id!)" class="border-t bg-muted/30 p-3 text-sm space-y-2">
        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="text-muted-foreground">销售部门:</span>
            <span class="ml-1">{{ bill.sales_dep }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">仓库:</span>
            <span class="ml-1">{{ bill.ship_warehouse }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">厚度:</span>
            <span class="ml-1">{{ formatDim(bill.thickness) }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">宽度:</span>
            <span class="ml-1">{{ formatDim(bill.width) }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">长度:</span>
            <span class="ml-1">{{ formatDim(bill.len) }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">块数:</span>
            <span class="ml-1">{{ bill.block_num }}</span>
          </div>
          <div class="col-span-2">
            <span class="text-muted-foreground">合同号:</span>
            <span class="ml-1">{{ bill.contract_no }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">创建日期:</span>
            <span class="ml-1">{{ formatDate(bill.create_date) }}</span>
          </div>
          <div>
            <span class="text-muted-foreground">创建人:</span>
            <span class="ml-1">{{ bill.creater }}</span>
          </div>
          <div v-if="bill.dispatches?.length" class="col-span-2">
            <span class="text-muted-foreground">配发信息:</span>
            <div class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="(d, i) in bill.dispatches"
                :key="i"
                class="inline-flex flex-col items-center px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs leading-tight"
              >
                <span class="font-medium">{{ d.veh_name }}</span>
                <span class="text-muted-foreground text-[10px]">{{ d.waybill_no }}</span>
              </span>
            </div>
          </div>
        </div>
        <slot name="expandActions" :bill="bill" />
      </div>
    </div>

    <!-- 无数据提示 -->
    <div v-if="bills.length === 0 && !loading" class="border rounded-lg p-8 text-center text-muted-foreground">
      {{ emptyText || '暂无数据' }}
    </div>
  </div>
</template>
