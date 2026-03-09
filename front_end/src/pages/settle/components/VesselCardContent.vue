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
  shipFrom: string
  shipTo: string
  shipDate: string
  weight: string
  price?: string
  priceClass?: string
  showExpand?: boolean
  expanded?: boolean
}

defineProps<Props>()

defineEmits<{
  (e: 'toggle-expand'): void
}>()
</script>

<template>
  <div class="flex-1 min-w-0">
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
    <!-- 行2：开单名称 -->
    <div class="text-sm text-muted-foreground truncate mt-0.5">{{ shipName }}</div>
    <!-- 行3：起始地→目的地 + 发货日期 -->
    <div class="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
      <span>{{ shipFrom }} → {{ shipTo }}</span>
      <span class="ml-auto shrink-0">{{ shipDate }}</span>
    </div>
    <!-- 行4：吨数 + 价格 -->
    <div class="flex items-center gap-3 mt-0.5 text-xs">
      <span class="text-foreground font-medium">{{ weight }}</span>
      <span v-if="price" :class="priceClass">{{ price }}</span>
    </div>
  </div>
</template>
