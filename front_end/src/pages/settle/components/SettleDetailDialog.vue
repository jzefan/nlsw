<script setup lang="ts">
import dayjs from 'dayjs'
import { Download } from 'lucide-vue-next'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'

import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
import { getSettleDetail } from '@/services/api/ticket.api'
import { formatNumber, sortByOrder, toExcelDate, toExcelNum } from '@/utils/format'

import type { SettleRecord } from '../ticket-types'

const open = defineModel<boolean>('open', { default: false })

const props = defineProps<{
  settle: SettleRecord | null
}>()

const { exportWithPicker, showExportDialog, exportFileName, confirmExport } = useExport()

const loading = ref(false)
const detailBills = ref<any[]>([])
const currentSettle = ref<SettleRecord | null>(null)

watch(open, async (val) => {
  if (!val || !props.settle) return
  loading.value = true
  detailBills.value = []

  try {
    const result = await getSettleDetail(props.settle.serial_number)
    if (result.ok) {
      currentSettle.value = result.settle

      detailBills.value = result.settle_bills
        .map((settleBill: any) => {
          const bill = result.bills.find((b: any) => String(b._id) === String(settleBill.bill_id))
          if (!bill) return null

          let vessel = ''
          let shipTo = ''
          let price = 0

          if (bill.invoices && bill.invoices.length > 0) {
            for (const inv of bill.invoices) {
              if (inv.inv_no === settleBill.inv_no) {
                vessel = inv.veh_ves_name || ''
                shipTo = inv.ship_to
                if (result.settle.settle_type === '客户结算') {
                  price = inv.price || 0
                } else if (result.settle.settle_type === '代收代付结算') {
                  price = bill.collection_price || 0
                }
                break
              }
            }
          }

          return {
            ...bill,
            settle_num: settleBill.num,
            settle_weight: settleBill.weight,
            vessel,
            ship_to: shipTo,
            price,
            amount: price * settleBill.weight,
            ship_date: result.shipDateMap?.[settleBill.inv_no] || '',
          }
        })
        .filter(Boolean)
    } else {
      toast.error(result.message || '获取明细失败')
    }
  } catch (error: any) {
    toast.error(error.message || '获取明细失败')
  } finally {
    loading.value = false
  }
})

function exportDetail() {
  if (detailBills.value.length === 0) {
    toast.warning('没有��导出的数据')
    return
  }

  const sorted = sortByOrder(detailBills.value)
  const exportData = sorted.map((bill, index) => ({
    index: index + 1,
    order_no: `${bill.order_no}-${String(bill.order_item_no || 0).padStart(3, '0')}`,
    bill_no: bill.bill_no,
    ship_date: toExcelDate(bill.ship_date),
    spec: `${bill.thickness}*${bill.width}*${bill.len}`,
    billing_name: bill.billing_name,
    vessel: bill.vessel || '-',
    ship_to: bill.ship_to || '-',
    price: toExcelNum(bill.price),
    settle_num: toExcelNum(bill.settle_num),
    settle_weight: toExcelNum(bill.settle_weight),
    amount: toExcelNum(bill.amount),
  }))

  const fileName = currentSettle.value
    ? `结算明细_${currentSettle.value.serial_number}_${new Date().toLocaleDateString()}`
    : `结算明细_${new Date().toLocaleDateString()}`

  exportWithPicker({
    fileName,
    sheetName: '结算明细',
    columns: [
      { header: '序号', key: 'index' },
      { header: '订单号', key: 'order_no' },
      { header: '提单号', key: 'bill_no' },
      { header: '发货日期', key: 'ship_date', type: 'date' },
      { header: '规格', key: 'spec' },
      { header: '开单名称', key: 'billing_name' },
      { header: '车船', key: 'vessel' },
      { header: '目的地', key: 'ship_to' },
      { header: '单价', key: 'price', type: 'number' },
      { header: '发运块数', key: 'settle_num', type: 'number' },
      { header: '发运重量', key: 'settle_weight', type: 'number' },
      { header: '金额', key: 'amount', type: 'number' },
    ],
    data: exportData,
  })
}
</script>

<template>
  <UiDialog v-model:open="open">
    <UiDialogContent class="min-w-[1000px] max-w-[95vw] max-h-[85vh]">
      <UiDialogHeader>
        <UiDialogTitle>结算明细单</UiDialogTitle>
      </UiDialogHeader>
      <div class="overflow-auto max-h-[70vh]">
        <div v-if="loading" class="flex items-center justify-center p-8">
          <span class="text-muted-foreground">加载中...</span>
        </div>
        <div v-else-if="detailBills.length === 0" class="flex items-center justify-center p-8">
          <span class="text-muted-foreground">没有明细数据</span>
        </div>
        <table v-else class="w-full text-sm border-collapse">
          <thead class="bg-muted/80 sticky top-0">
            <tr class="border-b">
              <th class="px-2 py-2 text-left">订单号</th>
              <th class="px-2 py-2 text-left">提单号</th>
              <th class="px-2 py-2 text-left">规格</th>
              <th class="px-2 py-2 text-left">开单名称</th>
              <th class="px-2 py-2 text-left">车船</th>
              <th class="px-2 py-2 text-left">目的地</th>
              <th class="px-2 py-2 text-right">单价</th>
              <th class="px-2 py-2 text-right">发运块数</th>
              <th class="px-2 py-2 text-right">发运重量</th>
              <th class="px-2 py-2 text-right">金额</th>
              <th class="px-2 py-2 text-left">发货日期</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(bill, index) in detailBills" :key="index" class="border-b hover:bg-muted/50">
              <td class="px-2 py-2">{{ bill.order_no }}-{{ String(bill.order_item_no || 0).padStart(3, '0') }}</td>
              <td class="px-2 py-2">{{ bill.bill_no }}</td>
              <td class="px-2 py-2">{{ bill.thickness }}*{{ bill.width }}*{{ bill.len }}</td>
              <td class="px-2 py-2">{{ bill.billing_name }}</td>
              <td class="px-2 py-2">{{ bill.vessel || '-' }}</td>
              <td class="px-2 py-2">{{ bill.ship_to || '-' }}</td>
              <td class="px-2 py-2 text-right">{{ formatNumber(bill.price, 2) || '0' }}</td>
              <td class="px-2 py-2 text-right">{{ bill.settle_num || 0 }}</td>
              <td class="px-2 py-2 text-right">{{ formatNumber(bill.settle_weight) || '0' }}</td>
              <td class="px-2 py-2 text-right">{{ formatNumber(bill.amount, 2) || '0' }}</td>
              <td class="px-2 py-2">{{ bill.ship_date ? dayjs(bill.ship_date).format('YYYY-MM-DD') : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <UiDialogFooter class="flex items-center justify-between">
        <UiButton variant="outline" :disabled="detailBills.length === 0" @click="exportDetail">
          <Download class="w-4 h-4 mr-1" />
          导出
        </UiButton>
        <UiButton @click="open = false">关闭</UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>

  <ExportDialog v-model:open="showExportDialog" :default-file-name="exportFileName" @confirm="confirmExport" />
</template>
