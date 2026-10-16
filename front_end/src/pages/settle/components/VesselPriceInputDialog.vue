<script setup lang="ts">
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import { formatNumber } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import * as settleApi from '@/services/api/settle.api'

import { inputToUnitPrice, priceModeFromDb, priceModeToDb, unitPriceToInput } from '../price-mode'

import type { PriceMode } from '../types'

const emit = defineEmits(['confirm'])

const visible = ref(false)
const saving = ref(false)
const invoiceData = ref<any>(null)
const forVessel = ref(true)
const innerNo = ref('')
const vehInfo = ref<any>(null)
const priceMode = ref<PriceMode>('unit')
const priceValue = ref('')
const remark = ref('')

// 回填期间抑制换算：open() 会改写输入方式，那时不应被当成用户切换
let restoring = false

// 单价的**精确值**（元/吨）——入库用它；输入框里显示的只是按输入方式取整后的值。
// lastRenderedPrice 是「上次程序写入的显示值」：界面上的值仍等于它 → 用户没改过 → 换算沿用精确值，
// 避免「显示取整 → 再乘回去」的漂移（打包价 500 → 显示 15.273 → 切回打包价变成 499.99）。
let exactUnitPrice = 0
let lastRenderedPrice = ''

function currentWeight() {
  return forVessel.value ? (invoiceData.value?.total_weight || 0) : (vehInfo.value?.weight || 0)
}

// 写入显示值并记下基准
function setPriceDisplay(unitPrice: number, mode: PriceMode) {
  exactUnitPrice = unitPrice
  lastRenderedPrice = unitPriceToInput(unitPrice, currentWeight(), mode)
  priceValue.value = lastRenderedPrice
}

// 当前输入框对应的单价精确值：没被改过就沿用精确值，改过则按当前方式解析用户输入
function currentUnitPrice() {
  if (String(priceValue.value ?? '') === lastRenderedPrice) {
    return exactUnitPrice
  }
  return inputToUnitPrice(priceValue.value, currentWeight(), priceMode.value)
}

// 切换输入方式：从精确值重新渲染显示（绝不拿显示值来回乘除）
watch(priceMode, (newMode, oldMode) => {
  if (restoring || !oldMode) {
    return
  }
  setPriceDisplay(currentUnitPrice(), newMode)
}, { flush: 'sync' })

function open(inv: any, isVessel: boolean, inner?: string) {
  restoring = true

  invoiceData.value = inv
  forVessel.value = isVessel
  innerNo.value = inner || ''
  priceMode.value = 'unit'
  priceValue.value = ''
  remark.value = ''
  exactUnitPrice = 0
  lastRenderedPrice = ''

  if (forVessel.value) {
    // 主运单：按上次的输入方式回显（vessel_price 存的是单价，打包价只是显示）
    priceMode.value = priceModeFromDb(inv.price_mode)
    remark.value = inv.price_remark || ''
    setPriceDisplay(inv.vessel_price || 0, priceMode.value)
  }
  else if (inner) {
    // 内部车辆
    const vehObj = makeVehInfo(inv)
    if (vehObj && vehObj[inner]) {
      vehInfo.value = vehObj[inner]
      priceMode.value = priceModeFromDb(vehObj[inner].price_mode)
      remark.value = vehObj[inner].price_remark || ''
      setPriceDisplay(vehObj[inner].price || 0, priceMode.value)
    }
  }

  visible.value = true
  restoring = false
}

async function handleConfirm() {
  const price = Number.parseFloat(priceValue.value)

  if (isNaN(price)) {
    toast.warning('请输入有效的价格')
    return
  }

  if (price < 0 && price !== -1) {
    toast.warning('价格不能为负数（除了-1表示不需要结算）')
    return
  }

  // 入库恒用单价的精确值：显示值是取整过的，不能拿它回算
  const weight = currentWeight()
  const unitPrice = price === -1 ? -1 : currentUnitPrice()

  if (priceMode.value === 'bale' && !(weight > 0)) {
    toast.warning('发运重量为 0，无法按打包价换算')
    return
  }

  try {
    saving.value = true

    // price 字段后端不读，仅作记录
    const totalPrice = priceMode.value === 'bale' ? price : unitPrice * weight
    const priceData: any[] = [{
      wno: forVessel.value ? invoiceData.value.waybill_no : innerNo.value,
      price: totalPrice,
      inner: forVessel.value ? 0 : 1,
      mode: priceModeToDb(priceMode.value),
      unitPrice,
      remark: remark.value,
    }]

    await settleApi.updateVesselPrice({
      wnoList: [invoiceData.value.waybill_no],
      priceData,
    })

    toast.success('价格更新成功')
    visible.value = false
    emit('confirm', priceData)
  }
  catch (error: any) {
    toast.error(error.message || '价格更新失败')
  }
  finally {
    saving.value = false
  }
}

function handleClose(open: boolean) {
  if (!open && !saving.value) {
    visible.value = false
  }
}

// 生成车辆信息对象
function makeVehInfo(inv: any) {
  const allVehicles: any[] = []
  inv.bills?.forEach((bill: any) => {
    if (bill.vehicles) {
      allVehicles.push(...bill.vehicles)
    }
  })

  const vehObj: any = {}
  allVehicles.forEach((veh) => {
    if (vehObj[veh.inner_waybill_no]) {
      vehObj[veh.inner_waybill_no].num += veh.send_num
      vehObj[veh.inner_waybill_no].weight += veh.send_weight
    }
    else {
      vehObj[veh.inner_waybill_no] = {
        name: veh.veh_name,
        num: veh.send_num,
        weight: veh.send_weight,
        price: veh.veh_price || 0,
        price_mode: veh.price_mode || 0,
        ship_from: veh.veh_ship_from,
        price_remark: veh.price_remark || '',
      }
    }
  })

  return vehObj
}

defineExpose({ open })
</script>

<template>
  <Dialog :open="visible" @update:open="handleClose">
    <DialogContent class="sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle>单行价格输入</DialogTitle>
      </DialogHeader>

      <div class="grid gap-4 py-4">
        <!-- 输入方式 -->
        <div class="grid grid-cols-4 items-center gap-4">
          <Label class="text-right">输入方式</Label>
          <div class="col-span-3">
            <RadioGroup v-model="priceMode" class="flex gap-4">
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="mode-unit" value="unit" />
                <Label html-for="mode-unit">每吨单价</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="mode-bale" value="bale" />
                <Label html-for="mode-bale">打包价</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <!-- 主运单价格输入 -->
        <template v-if="forVessel">
          <div class="grid grid-cols-4 items-start gap-4">
            <Label class="text-right pt-2">{{ invoiceData?.vehicle_vessel_name || '车船号' }}</Label>
            <div class="col-span-3">
              <InputGroup>
                <InputGroupInput v-model="priceValue" type="number" placeholder="请输入价格" step="0.01" />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>¥</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <div class="text-[11px] text-muted-foreground mt-1">
                始发: {{ invoiceData?.ship_from || '' }}, 目的地: {{ invoiceData?.ship_to || '' }}, 发运重量: {{ formatNumber(invoiceData?.total_weight) }} 吨
              </div>
              <div v-if="priceMode === 'unit' && priceValue" class="text-[11px] text-muted-foreground">
                总价: ¥{{ formatNumber(parseFloat(priceValue) * (invoiceData?.total_weight || 0)) }}
              </div>
              <div v-if="priceMode === 'bale' && priceValue && invoiceData?.total_weight" class="text-[11px] text-muted-foreground">
                单价: ¥{{ formatNumber(parseFloat(priceValue) / invoiceData.total_weight) }}/吨
              </div>
            </div>
          </div>
        </template>

        <!-- 内部车辆价格输入 -->
        <template v-else>
          <div class="grid grid-cols-4 items-start gap-4">
            <Label class="text-right pt-2">{{ vehInfo?.name || '车辆' }}</Label>
            <div class="col-span-3">
              <InputGroup>
                <InputGroupInput v-model="priceValue" type="number" placeholder="请输入价格" step="0.01" :disabled="vehInfo?.price < 0" />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>¥</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <div class="text-[11px] text-muted-foreground mt-1">
                始发: {{ vehInfo?.ship_from || '' }}, 发运重量: {{ formatNumber(vehInfo?.weight) }} 吨
              </div>
              <div v-if="priceMode === 'unit' && priceValue" class="text-[11px] text-muted-foreground">
                总价: ¥{{ formatNumber(parseFloat(priceValue) * (vehInfo?.weight || 0)) }}
              </div>
              <div v-if="priceMode === 'bale' && priceValue && vehInfo?.weight" class="text-[11px] text-muted-foreground">
                单价: ¥{{ formatNumber(parseFloat(priceValue) / vehInfo.weight) }}/吨
              </div>
            </div>
          </div>
        </template>

        <!-- 备注 -->
        <div class="grid grid-cols-4 items-center gap-4">
          <Label class="text-right">备注</Label>
          <div class="col-span-3">
            <Input v-model="remark" placeholder="请输入备注（可选）" />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="visible = false">
          取消
        </Button>
        <Button :disabled="saving" @click="handleConfirm">
          <span v-if="saving" class="mr-2 animate-spin">⏳</span>
          确定
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
