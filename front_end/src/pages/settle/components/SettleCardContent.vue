<script setup lang="ts">
interface Props {
  orderNo: string
  status: string
  statusClass: string
  inBasket?: boolean
  billingName: string
  shipFrom: string
  shipTo: string
  shipDate: string
  weight: string
  price?: string
  priceClass?: string
}

defineProps<Props>()
</script>

<template>
  <div class="flex-1 min-w-0">
    <!-- 行1：订单号 + 状态 badge + 结算篮标记 -->
    <div class="flex items-center gap-2">
      <span class="font-medium text-sm truncate">{{ orderNo }}</span>
      <span
        class="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium"
        :class="statusClass"
      >{{ status }}</span>
      <span
        v-if="inBasket"
        class="shrink-0 text-[10px] text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200"
      >结算篮</span>
    </div>
    <!-- 行2：开单名称 -->
    <div class="text-sm text-muted-foreground truncate mt-0.5">{{ billingName }}</div>
    <!-- 行3：起始地→目的地 + 发货日期 -->
    <div class="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
      <span>{{ shipFrom }} → {{ shipTo }}</span>
      <span class="ml-auto shrink-0">{{ shipDate }}</span>
    </div>
    <!-- 行4：发运重量 + 单价 → 总价 -->
    <div class="flex items-center gap-3 mt-0.5 text-xs">
      <span class="text-foreground font-medium">{{ weight }}</span>
      <span v-if="price" :class="priceClass">{{ price }}</span>
    </div>
  </div>
</template>
