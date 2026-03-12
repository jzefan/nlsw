<script setup lang="ts">
import { ChevronDown, ChevronUp } from 'lucide-vue-next'

interface Props {
  name: string
  category?: string
  status: string
  statusClass: string
  chargeText?: string
  remark?: string
  shipName: string
  shipCustomer?: string
  shipFrom: string
  shipTo: string
  shipDate: string
  sendNum?: string
  weight: string
  price?: string
  priceClass?: string
  showExpand?: boolean
  expanded?: boolean
  // 展开详情字段
  cardExpanded?: boolean
  waybillNo?: string
  ticketNo?: string
  chargeCash?: number
  chargeOil?: number
  delayDay?: number
  settleDate?: string
  unshipDate?: string
  payDate?: string
  carrierBoss?: string
}

defineProps<Props>()

defineEmits<{
  (e: 'toggle-expand'): void
  (e: 'toggle-card-expand'): void
}>()
</script>

<template>
  <div class="flex-1 min-w-0" @click.stop="$emit('toggle-card-expand')">
    <!-- 行1：名称 + 状态 + 预付 + 备注 + 展开箭头 -->
    <div class="flex items-center gap-2 pr-10">
      <span class="font-medium text-sm truncate">{{ name }}</span>
      <span
        v-if="category"
        class="shrink-0 inline-flex items-center px-1 py-0 rounded border text-[10px] font-medium leading-tight"
        :class="category === '自有' ? 'bg-blue-100 text-blue-700 border-transparent' : 'bg-orange-100 text-orange-700 border-transparent'"
      >{{ category === '自有' ? '自' : '外' }}</span>
      <span
        class="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium"
        :class="statusClass"
      >{{ status }}</span>
      <span
        v-if="chargeText && chargeText !== '无'"
        class="shrink-0 text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200"
      >{{ chargeText }}</span>
      <span v-if="remark" class="text-red-500 text-xs shrink-0" :title="remark">ⓘ</span>
      <span
        v-if="showExpand"
        class="ml-auto cursor-pointer text-gray-500 hover:text-gray-800"
        @click.stop="$emit('toggle-expand')"
      >
        <component :is="expanded ? ChevronUp : ChevronDown" class="w-4 h-4" />
      </span>
    </div>
    <!-- 行2：开单名称/发货单位 -->
    <div class="text-sm text-muted-foreground truncate mt-0.5">
      {{ shipName }}<span v-if="shipCustomer" class="text-xs ml-1">/ {{ shipCustomer }}</span>
    </div>
    <!-- 行3：起始地→目的地 + 发货日期 -->
    <div class="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
      <span>{{ shipFrom }} → {{ shipTo }}</span>
      <span class="ml-auto shrink-0">{{ shipDate }}</span>
    </div>
    <!-- 行4：发运数 + 吨数 + 价格 -->
    <div class="flex items-center gap-3 mt-0.5 text-xs">
      <span v-if="sendNum" class="text-muted-foreground">{{ sendNum }}块</span>
      <span class="text-foreground font-medium">{{ weight }}</span>
      <span v-if="price" :class="priceClass">{{ price }}</span>
      <!-- 卡片展开箭头 -->
      <component
        :is="cardExpanded ? ChevronUp : ChevronDown"
        class="ml-auto h-4 w-4 text-muted-foreground shrink-0"
      />
    </div>

    <!-- 展开详情：每个信息一行 -->
    <div v-if="cardExpanded" class="border-t mt-2 pt-2 space-y-1 text-xs" @click.stop>
      <div>
        <span class="text-muted-foreground">运单号：</span>
        <span>{{ waybillNo || '-' }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">车船号：</span>
        <span class="font-medium">{{ name }}</span>
        <span v-if="category" class="ml-1 text-muted-foreground">（{{ category }}）</span>
      </div>
      <div>
        <span class="text-muted-foreground">承运单位：</span>
        <span>{{ carrierBoss || '-' }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">开单名称：</span>
        <span>{{ shipName }}</span>
        <span v-if="shipCustomer" class="text-muted-foreground ml-1">/ {{ shipCustomer }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">始发地：</span>
        <span>{{ shipFrom }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">目的地：</span>
        <span>{{ shipTo }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">发运数：</span>
        <span>{{ sendNum || '-' }}块</span>
      </div>
      <div>
        <span class="text-muted-foreground">发运重量：</span>
        <span class="font-medium">{{ weight }}</span>
      </div>
      <div v-if="price">
        <span class="text-muted-foreground">价格：</span>
        <span :class="priceClass">{{ price }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">发货日期：</span>
        <span>{{ shipDate }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">结算日期：</span>
        <span>{{ settleDate || '-' }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">卸船日期：</span>
        <span>{{ unshipDate || '-' }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">滞留天数：</span>
        <span :class="delayDay ? 'text-red-500' : ''">{{ delayDay || 0 }}天</span>
      </div>
      <div>
        <span class="text-muted-foreground">预付现金：</span>
        <span :class="chargeCash ? 'text-orange-600' : ''">{{ chargeCash || 0 }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">预付油费：</span>
        <span :class="chargeOil ? 'text-orange-600' : ''">{{ chargeOil || 0 }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">票号：</span>
        <span>{{ ticketNo || '-' }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">付款日期：</span>
        <span>{{ payDate || '-' }}</span>
      </div>
      <div>
        <span class="text-muted-foreground">状态：</span>
        <span :class="statusClass" class="px-1.5 py-0.5 rounded border text-[10px] font-medium">{{ status }}</span>
      </div>
      <div v-if="remark">
        <span class="text-muted-foreground">备注：</span>
        <span class="text-red-500">{{ remark }}</span>
      </div>
    </div>
  </div>
</template>
