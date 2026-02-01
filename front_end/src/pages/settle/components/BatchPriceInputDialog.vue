<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { inputPrice } from '@/services/api/settle.api'

import type { BatchPriceGroup, SettleBill, SettleMode } from '../types'

const props = defineProps<{
  open: boolean
  bills: SettleBill[]
  settleMode: SettleMode
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'saved'): void
}>()

const saving = ref(false)

// 客户结算：按开单名称、车船、目的地分组
const priceGroups = computed<BatchPriceGroup[]>(() => {
  if (props.settleMode !== 'CUSTOMER')
    return []

  const groups: Record<string, BatchPriceGroup> = {}

  props.bills.forEach((bill) => {
    const billingName = bill.billing_name
    const key = `${bill.veh_ves_name}--${bill.ship_to}`
    const id = `${billingName.replace(/[\s()#]+/g, '_')}_${key.replace(/[\s()#-]+/g, '_')}`

    if (!groups[billingName]) {
      groups[billingName] = {
        billingName,
        items: [],
      }
    }

    const existing = groups[billingName].items.find(item => item.id === id)
    if (!existing) {
      groups[billingName].items.push({
        vehVesName: bill.veh_ves_name,
        shipTo: bill.ship_to,
        id,
      })
    }
  })

  return Object.values(groups)
})

// 存储每个输入框的价格
const prices = ref<Record<string, number>>({})

// 南钢结算：统一价格
const collectionPrice = ref(0)

// 初始化数据
watch(
  () => props.open,
  (newVal) => {
    if (newVal) {
      prices.value = {}
      collectionPrice.value = 0
    }
  },
)

// 保存价格
async function handleSave() {
  const data: Array<{ bid: string, inv_no: string, price: number }> = []

  if (props.settleMode === 'COLLECTION') {
    // 南钢结算：所有提单使用同一个价格
    if (collectionPrice.value < 0 && collectionPrice.value !== -1) {
      toast.error('请输入有效的价格')
      return
    }

    if (collectionPrice.value === 0) {
      toast.error('请输入价格')
      return
    }

    props.bills.forEach((bill) => {
      bill.collection_price = collectionPrice.value
      data.push({
        bid: bill._id,
        inv_no: bill.inv_no,
        price: collectionPrice.value,
      })
    })
  }
  else {
    // 客户结算：根据分组价格
    props.bills.forEach((bill) => {
      const key = `${bill.veh_ves_name}--${bill.ship_to}`
      const id = `${bill.billing_name.replace(/[\s()#]+/g, '_')}_${key.replace(/[\s()#-]+/g, '_')}`
      const price = prices.value[id]

      if (price !== undefined && (price >= 0 || price === -1)) {
        bill.price = price
        data.push({
          bid: bill._id,
          inv_no: bill.inv_no,
          price,
        })
      }
    })
  }

  if (data.length === 0) {
    toast.warning('没有需要保存的价格，请至少输入一个价格')
    return
  }

  saving.value = true
  try {
    const result = await inputPrice(data, props.settleMode)
    if (result.ok) {
      toast.success(`批量价格保存成功，共 ${data.length} 条记录`)
      emit('update:open', false)
      emit('saved')
    }
    else {
      toast.error(result.message || '保存失败')
    }
  }
  catch (error: any) {
    toast.error(error.message || '保存失败')
  }
  finally {
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
    <UiDialogContent class="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
      <UiDialogHeader>
        <UiDialogTitle>批量价格输入</UiDialogTitle>
        <p class="text-sm text-muted-foreground mt-1">
          {{ settleMode === 'CUSTOMER' ? '按车船-目的地分组输入价格' : '统一输入代收代付价格' }}
        </p>
      </UiDialogHeader>

      <div class="flex-1 overflow-y-auto py-4">
        <!-- 南钢结算：统一输入 -->
        <div v-if="settleMode === 'COLLECTION'" class="space-y-4">
          <div class="p-4 border rounded-lg bg-muted/50">
            <div class="mb-3 text-sm text-muted-foreground">
              将为 <strong class="text-foreground">{{ bills.length }}</strong> 条提单统一设置代收代付价格
            </div>
            <div>
              <label class="text-sm font-medium mb-2 block">代收代付价格（元/吨）</label>
              <div class="flex items-center gap-2 max-w-md">
                <UiInput
                  v-model.number="collectionPrice"
                  type="number"
                  placeholder="请输入价格"
                  step="0.01"
                  min="0"
                  class="flex-1"
                />
                <span class="text-sm text-muted-foreground">¥/吨</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 客户结算：分组输入 -->
        <div v-else class="space-y-6">
          <div
            v-for="group in priceGroups"
            :key="group.billingName"
            class="border rounded-lg p-4 bg-muted/30"
          >
            <h3 class="font-medium mb-4 text-base flex items-center gap-2">
              <span class="w-1 h-6 bg-primary rounded" />
              {{ group.billingName }}
            </h3>
            <div class="space-y-3 pl-4">
              <div
                v-for="item in group.items"
                :key="item.id"
                class="grid grid-cols-12 gap-3 items-center"
              >
                <label class="text-sm font-medium col-span-3">
                  {{ item.vehVesName }}
                </label>
                <div class="col-span-5 flex items-center gap-2">
                  <UiInput
                    v-model.number="prices[item.id]"
                    type="number"
                    placeholder="请输入价格"
                    step="0.01"
                    min="0"
                  />
                  <span class="text-sm text-muted-foreground whitespace-nowrap">¥/吨</span>
                </div>
                <span class="text-xs text-muted-foreground col-span-4">
                  目的地: {{ item.shipTo }}
                </span>
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="priceGroups.length === 0" class="p-8 text-center text-muted-foreground">
            没有可输入价格的提单
          </div>
        </div>
      </div>

      <UiDialogFooter class="border-t pt-4">
        <UiButton variant="outline" :disabled="saving" @click="handleClose">
          取消
        </UiButton>
        <UiButton :disabled="saving" @click="handleSave">
          {{ saving ? '保存中...' : '确定' }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
