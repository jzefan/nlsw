<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import * as settleApi from '@/services/api/settle.api'

const visible = ref(false)
const detailData = ref<any[]>([])
const hasVehicles = ref(false)

async function open(invoice: any) {
  try {
    // 检查是否有车辆信息
    hasVehicles.value = false
    if (invoice.bills && invoice.bills.length > 0) {
      invoice.bills.forEach((bill: any) => {
        if (bill.vehicles && bill.vehicles.length > 0) {
          hasVehicles.value = true
        }
      })
    }

    // 获取运单详细信息
    const response = await settleApi.getWaybill(invoice.waybill_no)

    if (response.bills && response.bills.length > 0) {
      // 构建明细数据
      const bills = response.bills
      const details: any[] = []

      bills.forEach((bill: any) => {
        // 查找对应的发运信息
        let sendNum = 0
        let sendWeight = 0
        let vehicleInfo: any[] = []

        if (invoice.bills) {
          const invBill = invoice.bills.find((ib: any) => String(bill._id) === String(ib.bill_id))
          if (invBill) {
            sendNum = invBill.num
            sendWeight = invBill.weight

            // 车辆信息
            if (invBill.vehicles && invBill.vehicles.length > 0) {
              vehicleInfo = invBill.vehicles.map((veh: any) => ({
                veh_name: veh.veh_name,
                send_num: veh.send_num,
                send_weight: veh.send_weight,
              }))
            }
          }
        }

        details.push({
          ...bill,
          send_num: sendNum,
          send_weight: sendWeight,
          vehicleInfo: vehicleInfo.length > 0 ? vehicleInfo : null,
        })
      })

      detailData.value = details
      visible.value = true
    }
    else {
      toast.error('未找到运单明细')
    }
  }
  catch (error: any) {
    toast.error(error.message || '获取运单明细失败')
  }
}

function getOrderInfo(row: any): string {
  if (!row.order_no)
    return ''
  if (!row.order_item_no)
    return row.order_no
  return `${row.order_no}-${row.order_item_no}`
}

function getSendWeight(row: any): number {
  if (row.send_weight) {
    return row.send_weight
  }
  // 如果没有直接的发运重量，根据块数计算
  if (row.block_num > 0 && row.send_num && row.weight) {
    return row.weight * row.send_num
  }
  return 0
}

function formatNumber(num: number | string | undefined): string {
  if (num === null || num === undefined || num === '')
    return ''
  const n = typeof num === 'string' ? Number.parseFloat(num) : num
  return isNaN(n) ? '' : n.toFixed(3)
}

defineExpose({ open })
</script>

<template>
  <Dialog v-model:open="visible">
    <DialogContent class="max-w-[90vw] max-h-[90vh]">
      <DialogHeader>
        <DialogTitle>车船结算明细单</DialogTitle>
      </DialogHeader>

      <div class="detail-dialog overflow-auto max-h-[calc(90vh-120px)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead class="w-[140px]">
                提单号
              </TableHead>
              <TableHead class="w-[150px]">
                订单号-项次号
              </TableHead>
              <TableHead class="w-[120px]">
                发货仓库
              </TableHead>
              <TableHead class="w-[80px] text-right">
                厚度
              </TableHead>
              <TableHead class="w-[80px] text-right">
                宽度
              </TableHead>
              <TableHead class="w-[80px] text-right">
                长度
              </TableHead>
              <TableHead class="w-[100px] text-right">
                单重
              </TableHead>
              <TableHead class="w-[90px] text-right">
                总块数
              </TableHead>
              <TableHead class="w-[100px] text-right">
                总重量
              </TableHead>
              <TableHead class="w-[100px] text-right">
                发运块数
              </TableHead>
              <TableHead class="w-[100px] text-right">
                发运重量
              </TableHead>
              <TableHead v-if="hasVehicles" class="min-w-[150px]">
                车号
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(row, index) in detailData" :key="index">
              <TableCell>{{ row.bill_no }}</TableCell>
              <TableCell>{{ getOrderInfo(row) }}</TableCell>
              <TableCell>{{ row.ship_warehouse }}</TableCell>
              <TableCell class="text-right">
                {{ formatNumber(row.thickness) }}
              </TableCell>
              <TableCell class="text-right">
                {{ formatNumber(row.width) }}
              </TableCell>
              <TableCell class="text-right">
                {{ formatNumber(row.len) }}
              </TableCell>
              <TableCell class="text-right">
                {{ formatNumber(row.weight) }}
              </TableCell>
              <TableCell class="text-right">
                {{ row.block_num || '' }}
              </TableCell>
              <TableCell class="text-right">
                {{ formatNumber(row.total_weight) }}
              </TableCell>
              <TableCell class="text-right">
                {{ row.send_num }}
              </TableCell>
              <TableCell class="text-right">
                {{ formatNumber(getSendWeight(row)) }}
              </TableCell>
              <TableCell v-if="hasVehicles">
                <div v-if="row.vehicleInfo" class="vehicle-info space-y-1">
                  <div v-for="(veh, vehIndex) in row.vehicleInfo" :key="vehIndex" class="text-xs">
                    {{ veh.veh_name }}, <code class="px-2 py-0.5 bg-muted rounded">{{ veh.send_num }}</code>
                    <code class="px-2 py-0.5 bg-muted rounded ml-1">{{ formatNumber(veh.send_weight) }}</code>
                  </div>
                </div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <DialogFooter>
        <Button @click="visible = false">
          关闭
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
.detail-dialog {
  font-size: 13px;
}
</style>
