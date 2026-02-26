<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import * as settleApi from '@/services/api/settle.api'

const emit = defineEmits(['confirm'])

interface RecordGroup {
  id: string
  name: string
  wno: string
  shipFrom: string
  shipTo: string
  totalWeight: number
  totalPrice: number
  price: number
  priceInput: string
  remarkInput: string
  details: Array<{ wno: string; weight: number }>
}

type VesselGroup = RecordGroup
type VehicleGroup = RecordGroup

const visible = ref(false)
const saving = ref(false)
const priceMode = ref('unit')

const vesselGroups = ref<VesselGroup[]>([])
const vehicleGroups = ref<VehicleGroup[]>([])
const selectedRecords = ref<any[]>([])
const selectedInnerNo = ref<string[]>([])
const dbRecords = ref<any[]>([])

// 统一价格
const unifiedPrice = ref('')
const unifiedRemark = ref('')

function applyUnifiedPrice() {
  vesselGroups.value.forEach((group) => {
    group.priceInput = unifiedPrice.value
    group.remarkInput = unifiedRemark.value
  })
  vehicleGroups.value.forEach((group) => {
    group.priceInput = unifiedPrice.value
    group.remarkInput = unifiedRemark.value
  })
}

function open(selected: any[], innerNos: string[], allRecords: any[]) {
  selectedRecords.value = selected
  selectedInnerNo.value = innerNos
  dbRecords.value = allRecords
  priceMode.value = 'unit'
  unifiedPrice.value = ''
  unifiedRemark.value = ''

  // 构建车船号列表（主运单，每条记录独立）
  const vesselList: VesselGroup[] = []
  selected.forEach((record) => {
    const vehName = record.vehicle_vessel_name
    if (!vehName) return

    vesselList.push({
      id: generateId(`${vehName}_${record.waybill_no}`),
      name: vehName,
      wno: record.waybill_no,
      shipFrom: record.ship_from || '',
      shipTo: record.ship_to || '',
      totalWeight: record.total_weight,
      totalPrice: record.vessel_price > 0 ? record.vessel_price * record.total_weight : 0,
      price: record.vessel_price || 0,
      priceInput: record.vessel_price > 0 ? record.vessel_price.toString() : '',
      remarkInput: record.price_remark || '',
      details: [{ wno: record.waybill_no, weight: record.total_weight }],
    })
  })

  // 构建车辆列表（内部运单，同一 inner_waybill_no + veh_name 的记录需要聚合）
  const vehicleList: VehicleGroup[] = []
  innerNos.forEach((innerNo) => {
    const inv = getInvoiceByInnerNo(innerNo, allRecords)
    if (!inv) return

    // 先聚合同一 inner_waybill_no 下相同车名的记录
    let aggregatedWeight = 0
    let vehPrice = 0
    let vehName = ''
    let priceRemark = ''

    inv.bills?.forEach((bill: any) => {
      bill.vehicles?.forEach((veh: any) => {
        if (veh.inner_waybill_no === innerNo) {
          aggregatedWeight += veh.send_weight
          vehPrice = veh.veh_price || 0
          vehName = veh.veh_name
          priceRemark = veh.price_remark || ''
        }
      })
    })

    if (vehName) {
      vehicleList.push({
        id: generateId(`${vehName}_${innerNo}`),
        name: vehName,
        wno: innerNo,
        shipFrom: inv.ship_from || '',
        shipTo: inv.ship_to || '',
        totalWeight: aggregatedWeight,
        totalPrice: vehPrice > 0 ? vehPrice * aggregatedWeight : 0,
        price: vehPrice,
        priceInput: vehPrice > 0 ? vehPrice.toString() : '',
        remarkInput: priceRemark,
        details: [{ wno: innerNo, weight: aggregatedWeight }],
      })
    }
  })

  vesselGroups.value = vesselList
  vehicleGroups.value = vehicleList

  visible.value = true
}

// 价格模式切换时自动转换所有价格
function handlePriceModeChange(newMode: string) {
  const isToUnit = newMode === 'unit'

  // 统一价格无法转换（没有对应重量），直接清空
  unifiedPrice.value = ''

  // 转换车船号价格
  vesselGroups.value.forEach((group) => {
    if (group.priceInput && Number.parseFloat(group.priceInput) > 0) {
      const currentValue = Number.parseFloat(group.priceInput)
      if (isToUnit) {
        // 打包价 -> 单价
        group.priceInput = (currentValue / group.totalWeight).toFixed(3)
      } else {
        // 单价 -> 打包价
        group.priceInput = (currentValue * group.totalWeight).toFixed(2)
      }
    }
  })

  // 转换车辆价格
  vehicleGroups.value.forEach((group) => {
    if (group.priceInput && Number.parseFloat(group.priceInput) > 0) {
      const currentValue = Number.parseFloat(group.priceInput)
      if (isToUnit) {
        // 打包价 -> 单价
        group.priceInput = (currentValue / group.totalWeight).toFixed(3)
      } else {
        // 单价 -> 打包价
        group.priceInput = (currentValue * group.totalWeight).toFixed(2)
      }
    }
  })
}

async function handleConfirm() {
  try {
    saving.value = true

    const wnoList: string[] = []
    const priceData: any[] = []
    const mode = priceMode.value === 'unit' ? 0 : 1

    // 处理车船号价格
    selectedRecords.value.forEach((record) => {
      const group = vesselGroups.value.find((g) => g.wno === record.waybill_no)
      if (!group || !group.priceInput) return

      const price = Number.parseFloat(group.priceInput)
      if (isNaN(price) || (price < 0 && price !== -1)) return

      let unitPrice = 0
      if (priceMode.value === 'unit') {
        unitPrice = price
      } else {
        unitPrice = price / group.totalWeight
      }

      wnoList.push(record.waybill_no)
      priceData.push({
        wno: record.waybill_no,
        price: priceMode.value === 'unit' ? price * record.total_weight : price,
        inner: 0,
        mode,
        unitPrice,
        remark: group.remarkInput,
      })
    })

    // 处理车辆价格
    selectedInnerNo.value.forEach((innerNo) => {
      const inv = getInvoiceByInnerNo(innerNo, dbRecords.value)
      if (!inv) return

      const group = vehicleGroups.value.find((g) => g.wno === innerNo)
      if (!group || !group.priceInput) return

      const price = Number.parseFloat(group.priceInput)
      if (isNaN(price) || (price < 0 && price !== -1)) return

      let unitPrice = 0
      if (priceMode.value === 'unit') {
        unitPrice = price
      } else {
        unitPrice = price / group.totalWeight
      }

      if (!wnoList.includes(inv.waybill_no)) {
        wnoList.push(inv.waybill_no)
      }

      priceData.push({
        wno: innerNo,
        price: priceMode.value === 'unit' ? price * group.totalWeight : price,
        inner: 1,
        mode,
        unitPrice,
        remark: group.remarkInput,
      })
    })

    if (priceData.length === 0) {
      toast.warning('请至少输入一个价格')
      return
    }

    await settleApi.updateVesselPrice({
      wnoList,
      priceData,
    })

    toast.success('批量价格更新成功')
    visible.value = false
    emit('confirm', priceData)
  } catch (error: any) {
    toast.error(error.message || '批量价格更新失败')
  } finally {
    saving.value = false
  }
}

function handleClose(open: boolean) {
  if (!open && !saving.value) {
    visible.value = false
  }
}

// 根据内部运单号查找运单
function getInvoiceByInnerNo(innerNo: string, records: any[]) {
  const wno = innerNo.substring(0, 17)
  return records.find((inv) => inv.waybill_no === wno)
}

// 生成唯一ID（替换特殊字符）
function generateId(name: string): string {
  return name.replace(/[\s()#]+/g, '_')
}

function formatNumber(num: number | string | undefined): string {
  if (num === null || num === undefined || num === '') return '0.000'
  const n = typeof num === 'string' ? Number.parseFloat(num) : num
  return isNaN(n) ? '0.000' : n.toFixed(3)
}

defineExpose({ open })
</script>

<template>
  <Dialog :open="visible" @update:open="handleClose">
    <DialogContent class="sm:max-w-[800px] max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>批量输入价格</DialogTitle>
      </DialogHeader>

      <div class="flex-1 overflow-y-auto py-4 px-1">
        <!-- 输入方式 -->
        <div class="grid grid-cols-4 items-center gap-4 mb-6">
          <Label class="text-right">输入方式</Label>
          <div class="col-span-3">
            <RadioGroup v-model="priceMode" class="flex gap-4" @update:model-value="handlePriceModeChange">
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="batch-mode-unit" value="unit" />
                <Label html-for="batch-mode-unit">每吨单价</Label>
              </div>
              <div class="flex items-center space-x-2">
                <RadioGroupItem id="batch-mode-bale" value="bale" />
                <Label html-for="batch-mode-bale">打包价</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <!-- 统一价格 -->
        <div class="mb-6 p-3 bg-primary/5 rounded-md border border-primary/20">
          <div class="grid grid-cols-4 items-start gap-4">
            <Label class="text-right pt-2 font-medium">统一价格</Label>
            <div class="col-span-3 space-y-2">
              <div class="flex items-center gap-4">
                <InputGroup class="flex-1">
                  <InputGroupInput v-model="unifiedPrice" type="number" placeholder="输入统一价格" step="0.01" />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>¥</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                <Input v-model="unifiedRemark" placeholder="统一备注" class="flex-1" />
              </div>
              <div class="flex items-center justify-between">
                <span class="text-[11px] text-muted-foreground">设置后点击"应用"将价格填入下方所有车船号</span>
                <Button size="sm" variant="secondary" :disabled="!unifiedPrice" @click="applyUnifiedPrice">
                  应用到全部
                </Button>
              </div>
            </div>
          </div>
        </div>

        <!-- 车船号列表 -->
        <div v-if="vesselGroups.length > 0" class="mb-6">
          <h4 class="text-sm font-bold border-b pb-2 mb-4 text-foreground">车船号列表</h4>
          <div
            v-for="group in vesselGroups"
            :key="group.id"
            class="mb-3 p-3 bg-muted/30 rounded-md border hover:bg-muted/50 transition-colors space-y-2"
          >
            <div class="flex items-center gap-3 text-sm">
              <span class="font-semibold shrink-0">{{ group.name }}</span>
              <span class="text-muted-foreground text-xs">{{ group.wno }}</span>
              <span v-if="group.shipFrom || group.shipTo" class="text-muted-foreground text-xs">
                {{ group.shipFrom }} → {{ group.shipTo }}
              </span>
              <span class="text-muted-foreground text-xs">{{ formatNumber(group.totalWeight) }}吨</span>
              <span v-if="priceMode === 'unit' && group.priceInput" class="text-xs text-blue-600 whitespace-nowrap">
                ¥{{ formatNumber(parseFloat(group.priceInput) * group.totalWeight) }}
              </span>
              <span
                v-if="priceMode === 'bale' && group.priceInput && group.totalWeight"
                class="text-xs text-blue-600 whitespace-nowrap"
              >
                ¥{{ formatNumber(parseFloat(group.priceInput) / group.totalWeight) }}/吨
              </span>
            </div>
            <div class="flex items-center gap-3">
              <InputGroup class="flex-1">
                <InputGroupInput
                  v-model="group.priceInput"
                  type="number"
                  :placeholder="priceMode === 'unit' ? '单价(元/吨)' : '打包价(元)'"
                  step="0.001"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>¥</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <Input v-model="group.remarkInput" placeholder="备注" class="flex-1" />
            </div>
          </div>
        </div>

        <!-- 目的地为船的车辆 -->
        <div v-if="vehicleGroups.length > 0" class="mb-6">
          <h4 class="text-sm font-bold border-b pb-2 mb-4 text-foreground">目的地为(船)的车辆</h4>
          <div
            v-for="group in vehicleGroups"
            :key="group.id"
            class="mb-3 p-3 bg-muted/30 rounded-md border hover:bg-muted/50 transition-colors space-y-2"
          >
            <div class="flex items-center gap-3 text-sm">
              <span class="font-semibold shrink-0">{{ group.name }}</span>
              <span class="text-muted-foreground text-xs">{{ group.wno }}</span>
              <span v-if="group.shipFrom || group.shipTo" class="text-muted-foreground text-xs">
                {{ group.shipFrom }} → {{ group.shipTo }}
              </span>
              <span class="text-muted-foreground text-xs">{{ formatNumber(group.totalWeight) }}吨</span>
              <span v-if="priceMode === 'unit' && group.priceInput" class="text-xs text-blue-600 whitespace-nowrap">
                ¥{{ formatNumber(parseFloat(group.priceInput) * group.totalWeight) }}
              </span>
              <span
                v-if="priceMode === 'bale' && group.priceInput && group.totalWeight"
                class="text-xs text-blue-600 whitespace-nowrap"
              >
                ¥{{ formatNumber(parseFloat(group.priceInput) / group.totalWeight) }}/吨
              </span>
            </div>
            <div class="flex items-center gap-3">
              <InputGroup class="flex-1">
                <InputGroupInput
                  v-model="group.priceInput"
                  type="number"
                  :placeholder="priceMode === 'unit' ? '单价(元/吨)' : '打包价(元)'"
                  step="0.001"
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>¥</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              <Input v-model="group.remarkInput" placeholder="备注" class="flex-1" />
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="visible = false"> 取消 </Button>
        <Button :disabled="saving" @click="handleConfirm">
          <span v-if="saving" class="mr-2 animate-spin">⏳</span>
          确定
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
