<script setup lang="ts">
import { ref } from 'vue'
import { toast } from 'vue-sonner'

import { formatDate, formatNumber } from '@/utils/format'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const emit = defineEmits(['confirm'])

const visible = ref(false)
const printData = ref<any[]>([])
const totalWeight = ref(0)
const totalAmount = ref(0)
const unpaidAmount = ref(0)

function open(selectedRows: any[]) {
  if (!selectedRows || selectedRows.length === 0) {
    toast.warning('请选择要打印的记录')
    return
  }

  // 构建打印数据
  const data: any[] = []
  let totWeight = 0
  let totAmount = 0
  let payment = 0

  selectedRows.forEach((row) => {
    if (!row.selected)
      return

    const isSubItem = row.isSubItem

    // 计算重量和价格
    const weight = isSubItem ? row.send_weight : row.total_weight
    let price = 0
    let unitPrice = '无'

    if (isSubItem) {
      if (row.price >= 0) {
        price = row.price * row.send_weight
        unitPrice = formatNumber(row.price)
      }
    }
    else {
      if (row.vessel_price >= 0) {
        price = row.vessel_price * row.total_weight
        unitPrice = formatNumber(row.vessel_price)
      }
    }

    // 计算预付
    const chargeCash = isSubItem ? row.charge_cash || 0 : row.charge_cash || 0
    const chargeOil = isSubItem ? row.charge_oil || 0 : row.charge_oil || 0
    payment += chargeCash + chargeOil

    let chargeText = '无'
    if (chargeCash > 0 && chargeOil > 0) {
      chargeText = `现金:${chargeCash},油:${chargeOil}`
    }
    else if (chargeCash > 0) {
      chargeText = `现金:${chargeCash}`
    }
    else if (chargeOil > 0) {
      chargeText = `油:${chargeOil}`
    }

    data.push({
      vehicle: isSubItem ? row.veh_name : row.vehicle_vessel_name,
      shipName: row.shipName || '',
      shipFrom: row.ship_from || '',
      shipTo: isSubItem ? row.ship_to : row.ship_to || '',
      weight: formatNumber(weight),
      unitPrice,
      totalPrice: price >= 0 ? formatNumber(price) : '无',
      shipDate: formatDate(row.ship_date),
      delayDay: row.delay_day || 0,
      charge: chargeText,
    })

    totWeight += weight
    totAmount += price
  })

  printData.value = data
  totalWeight.value = totWeight
  totalAmount.value = totAmount
  unpaidAmount.value = totAmount - payment

  visible.value = true
}

function handlePrint() {
  const printContent = document.getElementById('print-content')
  if (!printContent) {
    toast.error('打印内容未找到')
    return
  }

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    toast.error('请允许弹出窗口！')
    return
  }

  // 获取表格内容，但去掉 Table 组件的封装，直接生成 HTML 表格，或者复制 innerHTML
  // 由于 Shadcn UI Table 渲染为标准 table，我们可以直接复制 innerHTML
  // 但需要注入样式，因为打印窗口没有 Tailwind CSS

  const tableHtml = printContent.innerHTML

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>车船结算清单</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
          font-size: 12px;
        }
        th, td {
          border: 1px solid black;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f5f5f5;
          font-weight: bold;
        }
        .text-right {
          text-align: right;
        }
        .text-center {
          text-align: center;
        }
        .flex {
          display: flex;
        }
        .justify-end {
          justify-content: flex-end;
        }
        .space-y-2 > * + * {
          margin-top: 0.5rem;
        }
        .gap-8 {
          gap: 2rem;
        }
        .font-bold {
          font-weight: bold;
        }
        @media print {
          @page {
            margin: 1cm;
          }
        }
      </style>
    </head>
    <body>
      ${tableHtml}
    </body>
    </html>
  `)

  printWindow.document.close()
  printWindow.focus()

  setTimeout(() => {
    printWindow.print()
    printWindow.close()
  }, 250)
}

function handlePrintAndPay() {
  handlePrint()
  visible.value = false
  emit('confirm', true) // true 表示需要付款
}

function handleClose(open: boolean) {
  if (!open) {
    visible.value = false
  }
}


defineExpose({ open })
</script>

<template>
  <Dialog :open="visible" @update:open="handleClose">
    <DialogContent class="max-w-[90vw] w-full max-h-[90vh] flex flex-col">
      <DialogHeader>
        <DialogTitle>车船结算清单</DialogTitle>
      </DialogHeader>

      <div class="flex-1 overflow-auto p-4">
        <div id="print-content" class="print-content">
          <div class="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>车船号</TableHead>
                  <TableHead>开单名称/发货单位</TableHead>
                  <TableHead>起始地</TableHead>
                  <TableHead>目的地</TableHead>
                  <TableHead class="text-right">
                    发运重量
                  </TableHead>
                  <TableHead class="text-right">
                    单价
                  </TableHead>
                  <TableHead class="text-right">
                    总价格
                  </TableHead>
                  <TableHead>发货日期</TableHead>
                  <TableHead class="text-center">
                    滞留天数
                  </TableHead>
                  <TableHead>预付</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="(row, index) in printData" :key="index">
                  <TableCell>{{ row.vehicle }}</TableCell>
                  <TableCell>{{ row.shipName }}</TableCell>
                  <TableCell>{{ row.shipFrom }}</TableCell>
                  <TableCell>{{ row.shipTo }}</TableCell>
                  <TableCell class="text-right">
                    {{ row.weight }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ row.unitPrice }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ row.totalPrice }}
                  </TableCell>
                  <TableCell>{{ row.shipDate }}</TableCell>
                  <TableCell class="text-center">
                    {{ row.delayDay }}
                  </TableCell>
                  <TableCell>{{ row.charge }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>

          <div class="flex justify-end mt-6">
            <div class="space-y-2 text-sm">
              <div class="flex justify-between gap-8">
                <span class="font-bold">总重量:</span>
                <span class="font-bold">{{ formatNumber(totalWeight) }}</span>
              </div>
              <div class="flex justify-between gap-8">
                <span class="font-bold">价格:</span>
                <span class="font-bold">{{ formatNumber(totalAmount) }}</span>
              </div>
              <div class="flex justify-between gap-8">
                <span class="font-bold">未付款:</span>
                <span class="font-bold">{{ formatNumber(unpaidAmount) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" @click="visible = false">
          关闭
        </Button>
        <Button @click="handlePrint">
          打印
        </Button>
        <Button @click="handlePrintAndPay">
          打印并确定付款
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
