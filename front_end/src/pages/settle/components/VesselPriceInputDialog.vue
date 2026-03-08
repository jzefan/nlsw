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

const emit = defineEmits(['confirm'])

const visible = ref(false)
const saving = ref(false)
const invoiceData = ref<any>(null)
const forVessel = ref(true)
const innerNo = ref('')
const vehInfo = ref<any>(null)
const priceMode = ref('unit')
const priceValue = ref('')
const remark = ref('')

// 监听价格模式变化，自动转换价格
watch(priceMode, (newMode, oldMode) => {
  if (!priceValue.value || !oldMode)
    return

  const currentValue = Number.parseFloat(priceValue.value)
  if (isNaN(currentValue) || currentValue <= 0)
    return

  const weight = forVessel.value ? invoiceData.value?.total_weight || 1 : vehInfo.value?.weight || 1

  if (newMode === 'unit') {
    // 从打包价转为单价
    priceValue.value = (currentValue / weight).toFixed(3)
  }
  else {
    // 从单价转为打包价
    priceValue.value = (currentValue * weight).toFixed(2)
  }
})

function open(inv: any, isVessel: boolean, inner?: string) {
  invoiceData.value = inv
  forVessel.value = isVessel
  innerNo.value = inner || ''
  priceMode.value = 'unit'
  priceValue.value = ''
  remark.value = ''

  if (forVessel.value) {
    // 主运单
    if (inv.vessel_price > 0) {
      priceValue.value = inv.vessel_price.toString()
    }
    remark.value = inv.price_remark || ''
  }
  else if (inner) {
    // 内部车辆
    const vehObj = makeVehInfo(inv)
    if (vehObj && vehObj[inner]) {
      vehInfo.value = vehObj[inner]
      if (vehObj[inner].price > 0) {
        priceValue.value = vehObj[inner].price.toString()
      }
      remark.value = vehObj[inner].price_remark || ''
    }
  }

  visible.value = true
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

  try {
    saving.value = true

    const priceData: any[] = []
    let unitPrice = 0
    let totalPrice = price

    if (forVessel.value) {
      // 主运单
      const weight = invoiceData.value.total_weight

      if (priceMode.value === 'unit') {
        unitPrice = price
        totalPrice = price * weight
      }
      else {
        unitPrice = price / weight
        totalPrice = price
      }

      priceData.push({
        wno: invoiceData.value.waybill_no,
        price: totalPrice,
        inner: 0,
        mode: priceMode.value === 'unit' ? 0 : 1,
        unitPrice,
        remark: remark.value,
      })
    }
    else {
      // 内部车辆
      const weight = vehInfo.value.weight

      if (priceMode.value === 'unit') {
        unitPrice = price
        totalPrice = price * weight
      }
      else {
        unitPrice = price / weight
        totalPrice = price
      }

      priceData.push({
        wno: innerNo.value,
        price: totalPrice,
        inner: 1,
        mode: priceMode.value === 'unit' ? 0 : 1,
        unitPrice,
        remark: remark.value,
      })
    }

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
