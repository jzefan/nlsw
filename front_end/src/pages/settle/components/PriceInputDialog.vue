<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { inputPrice } from '@/services/api/settle.api'

import type { PriceMode, SettleBill, SettleMode } from '../types'

const props = defineProps<{
  open: boolean
  bill: SettleBill
  settleMode: SettleMode
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const priceMode = ref<PriceMode>('unit')
const priceValue = ref(0)
const remark = ref('')
const saving = ref(false)

// 标题文本
const titleText = computed(() => {
  return props.settleMode === 'CUSTOMER' ? '客户价格输入' : '代收代付价格输入'
})

// 价格标签
const priceLabel = computed(() => {
  if (props.settleMode === 'CUSTOMER') {
    return props.bill.veh_ves_name || '客户价格'
  }
  return '代收代付价格'
})

// 初始化数据
watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      const currentPrice = props.settleMode === 'CUSTOMER' ? props.bill.price : props.bill.collection_price
      priceValue.value = currentPrice > 0 ? currentPrice : 0
      remark.value = props.bill.incoming_price_remark || ''
      priceMode.value = 'unit'
    }
  },
)

// 监听价格模式变化，自动转换价格
watch(priceMode, (newMode, oldMode) => {
  if (priceValue.value > 0 && oldMode) {
    if (newMode === 'bale') {
      // 单价 → 打包价
      priceValue.value = Number((priceValue.value * props.bill.send_weight).toFixed(2))
    } else {
      // 打包价 → 单价
      priceValue.value = Number((priceValue.value / props.bill.send_weight).toFixed(2))
    }
  }
})

// 保存价格
async function handleSave() {
  if (priceValue.value < 0 && priceValue.value !== -1) {
    toast.error('请输入有效的价格')
    return
  }

  let finalPrice = priceValue.value

  // 如果是打包价模式，需要转换为单价
  if (priceMode.value === 'bale' && finalPrice > 0) {
    finalPrice = Number((finalPrice / props.bill.send_weight).toFixed(3))
  }

  const data = [
    {
      bid: props.bill._id,
      inv_no: props.bill.inv_no,
      price: finalPrice,
      remark: remark.value,
    },
  ]

  saving.value = true
  try {
    const result = await inputPrice(data, props.settleMode)
    if (result.ok) {
      // 更新本地数据
      if (props.settleMode === 'CUSTOMER') {
        props.bill.price = finalPrice
      } else {
        props.bill.collection_price = finalPrice
      }
      props.bill.incoming_price_remark = remark.value

      toast.success('价格保存成功')
      emit('update:open', false)
      emit('saved')
    } else {
      toast.error(result.message || '保存失败')
    }
  } catch (error: any) {
    toast.error(error.message || '保存失败')
  } finally {
    saving.value = false
  }
}

// 关闭对话框
function handleClose() {
  if (!saving.value) {
    emit('update:open', false)
  }
}
</script>

<template>
  <UiDialog :open="open" @update:open="handleClose">
    <UiDialogContent class="max-w-md">
      <UiDialogHeader>
        <UiDialogTitle>{{ titleText }}</UiDialogTitle>
      </UiDialogHeader>

      <div class="space-y-4 py-4">
        <!-- 提单信息 -->
        <div class="p-3 bg-muted rounded-lg text-sm space-y-1">
          <div class="flex justify-between">
            <span class="text-muted-foreground">提单号:</span>
            <span class="font-medium">{{ bill.bill_no }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">订单号:</span>
            <span class="font-medium">{{ bill.order_no }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">发运重量:</span>
            <span class="font-medium">{{ bill.send_weight.toFixed(3) }} 吨</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">始发地:</span>
            <span class="font-medium">{{ bill.ship_from }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">目的地:</span>
            <span class="font-medium">{{ bill.ship_to }}</span>
          </div>
        </div>

        <!-- 输入方式 -->
        <div>
          <label class="text-sm font-medium mb-2 block">输入方式</label>
          <div class="flex gap-4">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="priceMode" type="radio" value="unit" class="h-4 w-4 text-primary focus:ring-primary" />
              <span class="text-sm">每吨单价</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="priceMode" type="radio" value="bale" class="h-4 w-4 text-primary focus:ring-primary" />
              <span class="text-sm">打包价</span>
            </label>
          </div>
        </div>

        <!-- 价格输入 -->
        <div>
          <label class="text-sm font-medium mb-2 block">
            {{ priceLabel }}
            <span class="text-xs text-muted-foreground ml-2"> ({{ priceMode === 'unit' ? '元/吨' : '总价' }}) </span>
          </label>
          <div class="flex items-center gap-2">
            <UiInput
              v-model.number="priceValue"
              type="number"
              placeholder="请输入价格"
              step="0.01"
              min="0"
              class="flex-1"
            />
            <span class="text-sm text-muted-foreground">¥</span>
          </div>
          <div v-if="priceMode === 'unit' && priceValue > 0" class="text-xs text-muted-foreground mt-1">
            预计总价: ¥{{ (priceValue * bill.send_weight).toFixed(2) }}
          </div>
          <div v-if="priceMode === 'bale' && priceValue > 0" class="text-xs text-muted-foreground mt-1">
            换算单价: ¥{{ (priceValue / bill.send_weight).toFixed(2) }}/吨
          </div>
        </div>

        <!-- 备注 -->
        <div>
          <label class="text-sm font-medium mb-2 block">备注</label>
          <UiInput v-model="remark" placeholder="请输入备注（可选）" />
        </div>
      </div>

      <UiDialogFooter>
        <UiButton variant="outline" :disabled="saving" @click="handleClose"> 取消 </UiButton>
        <UiButton :disabled="saving" @click="handleSave">
          {{ saving ? '保存中...' : '确定' }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
