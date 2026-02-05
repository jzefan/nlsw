<script setup lang="ts">
// @ts-nocheck
import { Download, Printer, Search } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import ExcelJS from 'exceljs'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DatePicker } from '@/components/ui/date-picker'
import {
  getInvoiceDetail,
  getInvoiceList,
  getInvoices,
  type Invoice,
} from '@/services/api/invoice.api'
import { getCompanies, getVehicles } from '@/services/api/data-dict.api'
import { useAuthStore } from '@/stores/auth'
import { COMPANY_FULL_NAME } from '@/config/constants'

const authStore = useAuthStore()

// State
const loading = ref(false)
const searchKeyword = ref('')
const selectedWaybillNo = ref('')
const myWaybills = ref(false)
const invoiceDetail = ref<any>(null)

// Advanced Search State
const showAdvancedSearch = ref(false)
const advLoading = ref(false)
const advResults = ref<Invoice[]>([])
const advForm = ref({
  waybillNo: '',
  vehicleName: '',
  shipName: '',
  state: '',
  startDate: '',
  endDate: '',
})

// Computed
const isAdmin = computed(() => {
  return authStore.user?.privilege === 'admin' || authStore.user?.privilege === '11111111'
})

// Search function for the combobox
async function searchInvoices(keyword: string, limit: number, page: number) {
  try {
    const params: any = {
      keyword,
      page,
      limit,
    }
    if (myWaybills.value) {
      params.myOnly = true
    }

    const result = await getInvoiceList(params)
    if (result.ok) {
      return {
        ok: true,
        data: result.data.map(item => ({
          name: item.waybill_no,
          desc: `${item.vehicle_vessel_name} | ${item.ship_name}`,
          ...item,
        })),
        total: result.total,
      }
    }
    return { ok: false, data: [], total: 0 }
  }
  catch (error) {
    console.error(error)
    return { ok: false, data: [], total: 0 }
  }
}

// Search function for vehicles
async function searchVehicles(keyword: string, limit: number, page: number) {
  try {
    const result = await getVehicles({
      search: keyword,
      page,
      limit,
    })
    if (result.ok) {
      return {
        ok: true,
        data: result.data.map(item => ({
          name: item.name,
          ...item,
        })),
        total: result.total,
      }
    }
    return { ok: false, data: [], total: 0 }
  } catch (error) {
    console.error(error)
    return { ok: false, data: [], total: 0 }
  }
}

// Search function for ship names (companies)
async function searchShipNames(keyword: string, limit: number, page: number) {
  try {
    const result = await getCompanies({
      search: keyword,
      page,
      limit,
    })
    if (result.ok) {
      return {
        ok: true,
        data: result.data.map(item => ({
          name: item.name,
          ...item,
        })),
        total: result.total,
      }
    }
    return { ok: false, data: [], total: 0 }
  } catch (error) {
    console.error(error)
    return { ok: false, data: [], total: 0 }
  }
}

// Advanced Search
function disableStartDate(date: Date) {
  if (advForm.value.endDate) {
    const end = new Date(advForm.value.endDate)
    end.setHours(23, 59, 59, 999)
    return date > end
  }
  return false
}

function disableEndDate(date: Date) {
  if (advForm.value.startDate) {
    const start = new Date(advForm.value.startDate)
    start.setHours(0, 0, 0, 0)
    return date < start
  }
  return false
}

async function handleAdvancedSearch() {
  if (advForm.value.startDate && advForm.value.endDate && new Date(advForm.value.startDate) > new Date(advForm.value.endDate)) {
    toast.error('开始日期不能晚于结束日期')
    return
  }

  advLoading.value = true
  try {
    const result = await getInvoices({
      waybillNo: advForm.value.waybillNo || undefined,
      vehicleName: advForm.value.vehicleName || undefined,
      shipName: advForm.value.shipName || undefined,
      state: advForm.value.state || undefined,
      startDate: advForm.value.startDate || undefined,
      endDate: advForm.value.endDate || undefined,
      page: 1,
      limit: 50, // Limit to 50 results for preview
    })

    // Fix: The API might return 'data' instead of 'invoices'
    const invoices = (result as any).data || result.invoices || []
    
    if (result.ok) {
      advResults.value = invoices
      if (invoices.length === 0) {
        toast.info('未找到符合条件的运单')
      }
    }
    else {
      toast.error('查询失败')
    }
  }
  catch (e: any) {
    toast.error('查询出错', { description: e.message })
  }
  finally {
    advLoading.value = false
  }
}

function selectAdvResult(invoice: Invoice) {
  if (selectedWaybillNo.value === invoice.waybill_no) {
    loadInvoice()
  }
  else {
    selectedWaybillNo.value = invoice.waybill_no
  }
  showAdvancedSearch.value = false
}

function resetAdvForm() {
  advForm.value = {
    waybillNo: '',
    vehicleName: '',
    shipName: '',
    state: '',
    startDate: '',
    endDate: '',
  }
  advResults.value = []
}

// Load invoice detail
async function loadInvoice() {
  if (!selectedWaybillNo.value)
    return

  loading.value = true
  try {
    const result = await getInvoiceDetail(selectedWaybillNo.value)
    if (result.ok && result.data) {
      invoiceDetail.value = result.data
      toast.success('运单加载成功')
    }
    else {
      toast.error(result.message || '加载运单失败')
      invoiceDetail.value = null
    }
  }
  catch (error: any) {
    toast.error(error.message || '加载运单失败')
    invoiceDetail.value = null
  }
  finally {
    loading.value = false
  }
}

// Watchers
watch(selectedWaybillNo, (newVal) => {
  if (newVal) {
    loadInvoice()
  }
  else {
    invoiceDetail.value = null
  }
})

watch(myWaybills, () => {
  // Clear selection when filter changes to force re-search with new filter
  selectedWaybillNo.value = ''
  invoiceDetail.value = null
})

// Helpers
function formatDate(date: string | Date | undefined) {
  if (!date)
    return ''
  return new Date(date).toLocaleDateString('zh-CN')
}

function formatNumber(num: number | undefined) {
  if (num === undefined || num === null)
    return ''
  return Number(num).toFixed(3)
}

function getOrderDisplay(bill: any) {
  if (bill.order_item_no != null) {
    const itemNo = String(bill.order_item_no).padStart(3, '0')
    return `${bill.order_no}-${itemNo}`
  }
  return bill.order_no
}

// Print
function handlePrint() {
  if (!invoiceDetail.value)
    return

  const printContent = document.getElementById('report-content')
  if (!printContent)
    return

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    toast.error('请允许弹出窗口以进行打印')
    return
  }

  const styles = `
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; }
      .header { text-align: center; margin-bottom: 30px; }
      .header h2 { margin: 0; font-size: 24px; }
      .info-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 20px; font-size: 14px; }
      .info-column { display: flex; flex-direction: column; gap: 8px; }
      .info-item { display: flex; }
      .info-label { font-weight: bold; width: 80px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
      th, td { border: 1px solid #000; padding: 6px; text-align: left; }
      th { background-color: #f5f5f5; }
      .text-right { text-align: right; }
      .footer { display: flex; justify-content: flex-end; margin-top: 20px; font-weight: bold; font-size: 14px; }
      .footer-item { margin-left: 40px; }
    </style>
  `

  const content = `
    <div class="header">
      <h2><i class="fa fa-globe"></i> ${COMPANY_FULL_NAME}发货单</h2>
    </div>
    <div class="info-grid">
      <div class="info-column">
        <div class="info-item"><span class="info-label">运单号:</span> <span>${invoiceDetail.value.waybill_no}</span></div>
        <div class="info-item"><span class="info-label">车船号:</span> <span>${invoiceDetail.value.vehicle_vessel_name}</span></div>
        <div class="info-item"><span class="info-label">发货日期:</span> <span>${formatDate(invoiceDetail.value.ship_date)}</span></div>
        <div class="info-item"><span class="info-label">始发地:</span> <span>${invoiceDetail.value.ship_from}</span></div>
        <div class="info-item"><span class="info-label">电话:</span> <span>${invoiceDetail.value.ship_from_phone || ''}</span></div>
      </div>
      <div class="info-column">
        <div class="info-item"><span class="info-label">开单名称:</span> <span>${invoiceDetail.value.ship_name}</span></div>
        <div class="info-item"><span class="info-label">发货单位:</span> <span>${invoiceDetail.value.ship_customer || ''}</span></div>
        <div class="info-item"><span class="info-label">电话:</span> <span>${invoiceDetail.value.ship_phone || ''}</span></div>
      </div>
      <div class="info-column">
        <div class="info-item"><span class="info-label">目的地:</span> <span>${invoiceDetail.value.ship_to}</span></div>
        <div class="info-item"><span class="info-label">电话:</span> <span>${invoiceDetail.value.ship_to_phone || ''}</span></div>
        <div class="info-item"><span class="info-label">联系人:</span> <span>${invoiceDetail.value.ship_to_contact || ''}</span></div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>提单号</th>
          <th>订单号</th>
          <th>牌号</th>
          <th class="text-right">厚度</th>
          <th class="text-right">宽度</th>
          <th class="text-right">长度</th>
          <th class="text-right">单重</th>
          <th class="text-right">发运数</th>
          <th class="text-right">发运重量</th>
          <th>仓库</th>
          <th>合同号</th>
          <th>车号</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceDetail.value.bills.map((bill: any) => {
          // 处理车辆子项
          const rows = []
          const billInfo = bill.bill_id || {}

          if (bill.vehicles && bill.vehicles.length > 0) {
            bill.vehicles.forEach((veh: any) => {
              rows.push(`
                 <tr>
                   <td>${billInfo.bill_no || ''}</td>
                   <td>${getOrderDisplay(billInfo)}</td>
                   <td>${billInfo.brand_no || ''}</td>
                   <td class="text-right">${formatNumber(billInfo.thickness)}</td>
                   <td class="text-right">${formatNumber(billInfo.width)}</td>
                   <td class="text-right">${formatNumber(billInfo.len)}</td>
                   <td class="text-right">${formatNumber(billInfo.weight)}</td>
                   <td class="text-right">${veh.send_num}</td>
                   <td class="text-right">${formatNumber(veh.send_weight)}</td>
                   <td>${billInfo.ship_warehouse || ''}</td>
                   <td>${billInfo.contract_no || ''}</td>
                   <td>${veh.veh_name || ''}</td>
                 </tr>
               `)
            })
          }
          else {
            rows.push(`
               <tr>
                 <td>${billInfo.bill_no || ''}</td>
                 <td>${getOrderDisplay(billInfo)}</td>
                 <td>${billInfo.brand_no || ''}</td>
                 <td class="text-right">${formatNumber(billInfo.thickness)}</td>
                 <td class="text-right">${formatNumber(billInfo.width)}</td>
                 <td class="text-right">${formatNumber(billInfo.len)}</td>
                 <td class="text-right">${formatNumber(billInfo.weight)}</td>
                 <td class="text-right">${bill.num || 0}</td>
                 <td class="text-right">${formatNumber(bill.weight)}</td>
                 <td>${billInfo.ship_warehouse || ''}</td>
                 <td>${billInfo.contract_no || ''}</td>
                 <td>-</td>
               </tr>
             `)
          }
          return rows.join('')
        }).join('')}
      </tbody>
    </table>
    <div class="footer">
      <div class="footer-item">总发运块数: ${calculateTotals.value.totalNum}</div>
      <div class="footer-item">总重量: ${formatNumber(calculateTotals.value.totalWeight)} 吨</div>
    </div>
  `

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>打印运单 - ${invoiceDetail.value.waybill_no}</title>
        ${styles}
      </head>
      <body>
        ${content}
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

// Export with ExcelJS (styled)
async function handleExport() {
  if (!invoiceDetail.value)
    return

  const inv = invoiceDetail.value
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('发货单')

  // 定义边框样式
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  }

  const headerFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE5E7EB' }
  }

  const labelFill: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF3F4F6' }
  }

  // 用于记录每列的最大宽度
  const columnWidths: number[] = Array(12).fill(0)

  // 计算文本宽度（中文字符算2个宽度，英文算1个）
  function getTextWidth(text: any): number {
    const str = String(text || '')
    return [...str].reduce((sum, char) => {
      return sum + (char.charCodeAt(0) > 127 ? 2 : 1)
    }, 0)
  }

  // 更新列宽
  function updateColumnWidth(colIndex: number, text: any) {
    const width = getTextWidth(text)
    columnWidths[colIndex] = Math.max(columnWidths[colIndex], width)
  }

  let rowNum = 1

  // 标题行
  sheet.mergeCells(rowNum, 1, rowNum, 12)
  const titleCell = sheet.getCell(rowNum, 1)
  const titleText = `${COMPANY_FULL_NAME}发货单`
  titleCell.value = titleText
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(rowNum).height = 30
  updateColumnWidth(0, titleText)
  rowNum++

  // 空行
  rowNum++

  // 基本信息区域
  // 第一行：运单号(1列) | 运单号值(2列) | 开单名称(2列) | 开单名称值(4列) | 目的地(1列) | 目的地值(2列)
  const row1 = sheet.getRow(rowNum)
  const r1c1 = '运单号'
  row1.getCell(1).value = r1c1
  row1.getCell(1).font = { bold: true }
  row1.getCell(1).fill = labelFill
  row1.getCell(1).border = thinBorder
  updateColumnWidth(0, r1c1)

  sheet.mergeCells(rowNum, 2, rowNum, 3)
  row1.getCell(2).value = inv.waybill_no
  row1.getCell(2).border = thinBorder
  row1.getCell(3).border = thinBorder
  updateColumnWidth(1, inv.waybill_no)

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  const r1c4 = '开单名称'
  row1.getCell(4).value = r1c4
  row1.getCell(4).font = { bold: true }
  row1.getCell(4).fill = labelFill
  row1.getCell(4).border = thinBorder
  row1.getCell(5).border = thinBorder
  updateColumnWidth(3, r1c4)

  sheet.mergeCells(rowNum, 6, rowNum, 9)
  row1.getCell(6).value = inv.ship_name
  for (let c = 6; c <= 9; c++) row1.getCell(c).border = thinBorder
  updateColumnWidth(5, inv.ship_name)

  const r1c10 = '目的地'
  row1.getCell(10).value = r1c10
  row1.getCell(10).font = { bold: true }
  row1.getCell(10).fill = labelFill
  row1.getCell(10).border = thinBorder
  updateColumnWidth(9, r1c10)

  sheet.mergeCells(rowNum, 11, rowNum, 12)
  row1.getCell(11).value = inv.ship_to
  row1.getCell(11).border = thinBorder
  row1.getCell(12).border = thinBorder
  updateColumnWidth(10, inv.ship_to)
  rowNum++

  // 第二行：车船号(1列) | 车船号值(2列) | 发货单位(2列) | 发货单位值(4列) | 联系人(1列) | 联系人值(2列)
  const row2 = sheet.getRow(rowNum)
  row2.getCell(1).value = '车船号'
  row2.getCell(1).font = { bold: true }
  row2.getCell(1).fill = labelFill
  row2.getCell(1).border = thinBorder

  sheet.mergeCells(rowNum, 2, rowNum, 3)
  row2.getCell(2).value = inv.vehicle_vessel_name
  row2.getCell(2).border = thinBorder
  row2.getCell(3).border = thinBorder

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  row2.getCell(4).value = '发货单位'
  row2.getCell(4).font = { bold: true }
  row2.getCell(4).fill = labelFill
  row2.getCell(4).border = thinBorder
  row2.getCell(5).border = thinBorder

  sheet.mergeCells(rowNum, 6, rowNum, 9)
  row2.getCell(6).value = inv.ship_customer || '-'
  for (let c = 6; c <= 9; c++) row2.getCell(c).border = thinBorder

  row2.getCell(10).value = '联系人'
  row2.getCell(10).font = { bold: true }
  row2.getCell(10).fill = labelFill
  row2.getCell(10).border = thinBorder

  sheet.mergeCells(rowNum, 11, rowNum, 12)
  row2.getCell(11).value = inv.ship_to_contact || '-'
  row2.getCell(11).border = thinBorder
  row2.getCell(12).border = thinBorder
  rowNum++

  // 第三行：发货日期(1列) | 发货日期值(2列) | 电话(2列) | 电话值(4列) | 电话(1列) | 电话值(2列)
  const row3 = sheet.getRow(rowNum)
  row3.getCell(1).value = '发货日期'
  row3.getCell(1).font = { bold: true }
  row3.getCell(1).fill = labelFill
  row3.getCell(1).border = thinBorder

  sheet.mergeCells(rowNum, 2, rowNum, 3)
  row3.getCell(2).value = formatDate(inv.ship_date)
  row3.getCell(2).border = thinBorder
  row3.getCell(3).border = thinBorder

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  row3.getCell(4).value = '电话'
  row3.getCell(4).font = { bold: true }
  row3.getCell(4).fill = labelFill
  row3.getCell(4).border = thinBorder
  row3.getCell(5).border = thinBorder

  sheet.mergeCells(rowNum, 6, rowNum, 9)
  row3.getCell(6).value = inv.ship_phone || '-'
  for (let c = 6; c <= 9; c++) row3.getCell(c).border = thinBorder

  row3.getCell(10).value = '电话'
  row3.getCell(10).font = { bold: true }
  row3.getCell(10).fill = labelFill
  row3.getCell(10).border = thinBorder

  sheet.mergeCells(rowNum, 11, rowNum, 12)
  row3.getCell(11).value = inv.ship_to_phone || '-'
  row3.getCell(11).border = thinBorder
  row3.getCell(12).border = thinBorder
  rowNum++

  // 第四行：始发地(1列) | 始发地值(11列)
  const row4 = sheet.getRow(rowNum)
  row4.getCell(1).value = '始发地'
  row4.getCell(1).font = { bold: true }
  row4.getCell(1).fill = labelFill
  row4.getCell(1).border = thinBorder

  sheet.mergeCells(rowNum, 2, rowNum, 12)
  row4.getCell(2).value = inv.ship_from
  for (let c = 2; c <= 12; c++) row4.getCell(c).border = thinBorder
  rowNum++

  // 空行
  rowNum++

  // 表格表头
  const tableHeaders = ['提单号', '订单号', '牌号', '厚度', '宽度', '长度', '单重', '发运数', '发运重量', '仓库', '合同号', '车号']
  const headerRow = sheet.getRow(rowNum)
  tableHeaders.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = header
    cell.font = { bold: true }
    cell.fill = headerFill
    cell.border = thinBorder
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
    updateColumnWidth(idx, header)
  })
  sheet.getRow(rowNum).height = 22
  rowNum++

  // 表格数据
  const tableStartRow = rowNum
  inv.bills.forEach((bill: any) => {
    const billInfo = bill.bill_id || {}

    const addDataRow = (data: any[]) => {
      const dataRow = sheet.getRow(rowNum)
      data.forEach((val, idx) => {
        const cell = dataRow.getCell(idx + 1)
        cell.value = val
        cell.border = thinBorder
        // 数字列右对齐
        if (idx >= 3 && idx <= 8) {
          cell.alignment = { horizontal: 'right' }
        }
        updateColumnWidth(idx, val)
      })
      rowNum++
    }

    if (bill.vehicles && bill.vehicles.length > 0) {
      bill.vehicles.forEach((veh: any) => {
        addDataRow([
          billInfo.bill_no || '',
          getOrderDisplay(billInfo),
          billInfo.brand_no || '',
          formatNumber(billInfo.thickness),
          formatNumber(billInfo.width),
          formatNumber(billInfo.len),
          formatNumber(billInfo.weight),
          veh.send_num,
          formatNumber(veh.send_weight),
          billInfo.ship_warehouse || '',
          billInfo.contract_no || '',
          veh.veh_name || ''
        ])
      })
    }
    else {
      addDataRow([
        billInfo.bill_no || '',
        getOrderDisplay(billInfo),
        billInfo.brand_no || '',
        formatNumber(billInfo.thickness),
        formatNumber(billInfo.width),
        formatNumber(billInfo.len),
        formatNumber(billInfo.weight),
        bill.num || 0,
        formatNumber(bill.weight),
        billInfo.ship_warehouse || '',
        billInfo.contract_no || '',
        '-'
      ])
    }
  })

  // 空行
  rowNum++

  // 汇总行
  sheet.mergeCells(rowNum, 1, rowNum, 7)
  sheet.mergeCells(rowNum, 8, rowNum, 9)
  sheet.mergeCells(rowNum, 10, rowNum, 12)
  const summaryRow = sheet.getRow(rowNum)
  const summaryText1 = `总发运块数: ${calculateTotals.value.totalNum}`
  const summaryText2 = `总重量: ${formatNumber(calculateTotals.value.totalWeight)} 吨`
  summaryRow.getCell(8).value = summaryText1
  summaryRow.getCell(8).font = { bold: true }
  summaryRow.getCell(8).alignment = { horizontal: 'right' }
  summaryRow.getCell(10).value = summaryText2
  summaryRow.getCell(10).font = { bold: true }
  summaryRow.getCell(10).alignment = { horizontal: 'right' }
  for (let c = 1; c <= 12; c++) {
    summaryRow.getCell(c).border = thinBorder
  }
  updateColumnWidth(7, summaryText1)
  updateColumnWidth(9, summaryText2)

  // 应用列宽（设置最小宽度10，最大宽度50）
  sheet.columns = columnWidths.map(width => ({
    width: Math.max(10, Math.min(width + 2, 50))
  }))

  // 导出文件
  try {
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `发货单_${inv.waybill_no}.xlsx`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  }
  catch (error: any) {
    console.error('Export error:', error)
    toast.error('导出失败', { description: error.message })
  }
}

// Calculate totals from bills
const calculateTotals = computed(() => {
  if (!invoiceDetail.value?.bills)
    return { totalNum: 0, totalWeight: 0 }

  let totalNum = 0
  let totalWeight = 0

  invoiceDetail.value.bills.forEach((bill: any) => {
    if (bill.vehicles?.length > 0) {
      bill.vehicles.forEach((veh: any) => {
        totalNum += veh.send_num || 0
        totalWeight += veh.send_weight || 0
      })
    }
    else {
      totalNum += bill.num || 0
      totalWeight += bill.weight || 0
    }
  })

  return { totalNum, totalWeight }
})
</script>

<template>
  <BasicPage title="运单报表" description="查询、打印和导出运单发货明细">
    <!-- Tool Bar -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6 p-4 border rounded-lg bg-muted/30">
      <div class="flex flex-col md:flex-row items-center gap-4 w-full md:w-auto">
        <div class="flex items-center gap-2 w-full md:w-[600px]">
          <Label class="whitespace-nowrap">运单号</Label>
          <SearchableCombobox
            :key="String(myWaybills)"
            v-model="selectedWaybillNo"
            :search-fn="searchInvoices"
            placeholder="搜索运单号、车船号或开单名称..."
            class="flex-1"
          />
        </div>

        <div class="flex items-center gap-2">
          <input
            id="my-waybills"
            type="checkbox"
            v-model="myWaybills"
            class="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
          />
          <Label for="my-waybills" class="cursor-pointer">本用户的运单</Label>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button variant="outline" :disabled="!invoiceDetail" @click="handlePrint">
          <Printer class="w-4 h-4 mr-2" />
          打印
        </Button>
        <Button variant="outline" :disabled="!invoiceDetail" @click="handleExport">
          <Download class="w-4 h-4 mr-2" />
          导出 Excel
        </Button>
        <Button variant="ghost" @click="showAdvancedSearch = true">
          <Search class="w-4 h-4 mr-2" />
          高级查询
        </Button>
      </div>
    </div>

    <!-- Report Content -->
    <div v-if="invoiceDetail" id="report-content" class="border rounded-lg p-8 bg-card shadow-sm print:shadow-none print:border-0">
      <div class="text-center mb-8">
        <h2 class="text-2xl font-bold flex items-center justify-center gap-2">
          <i class="hidden print:inline-block">🌏</i> <!-- Icon placeholder for print -->
          {{ COMPANY_FULL_NAME }}发货单
        </h2>
      </div>

      <!-- Info Grid -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 text-sm">
        <!-- Col 1 -->
        <div class="space-y-2">
          <div class="flex">
            <span class="font-bold w-20">运单号:</span>
            <code class="bg-muted px-1 rounded">{{ invoiceDetail.waybill_no }}</code>
          </div>
          <div class="flex">
            <span class="font-bold w-20">车船号:</span>
            <span>{{ invoiceDetail.vehicle_vessel_name }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">发货日期:</span>
            <span>{{ formatDate(invoiceDetail.ship_date) }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">始发地:</span>
            <span>{{ invoiceDetail.ship_from }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">电话:</span>
            <span>{{ invoiceDetail.ship_from_phone || '-' }}</span>
          </div>
        </div>

        <!-- Col 2 -->
        <div class="space-y-2">
          <div class="flex">
            <span class="font-bold w-20">开单名称:</span>
            <span class="font-bold">{{ invoiceDetail.ship_name }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">发货单位:</span>
            <span class="font-bold">{{ invoiceDetail.ship_customer || '-' }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">电话:</span>
            <span>{{ invoiceDetail.ship_phone || '-' }}</span>
          </div>
        </div>

        <!-- Col 3 -->
        <div class="space-y-2">
          <div class="flex">
            <span class="font-bold w-20">目的地:</span>
            <span class="font-bold">{{ invoiceDetail.ship_to }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">电话:</span>
            <span>{{ invoiceDetail.ship_to_phone || '-' }}</span>
          </div>
          <div class="flex">
            <span class="font-bold w-20">联系人:</span>
            <span>{{ invoiceDetail.ship_to_contact || '-' }}</span>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="rounded-md border overflow-hidden">
        <Table>
          <TableHeader class="bg-muted/50">
            <TableRow>
              <TableHead>提单号</TableHead>
              <TableHead>订单号</TableHead>
              <TableHead>牌号</TableHead>
              <TableHead class="text-right">
                厚度
              </TableHead>
              <TableHead class="text-right">
                宽度
              </TableHead>
              <TableHead class="text-right">
                长度
              </TableHead>
              <TableHead class="text-right">
                单重
              </TableHead>
              <TableHead class="text-right">
                发运数
              </TableHead>
              <TableHead class="text-right">
                发运重量
              </TableHead>
              <TableHead>仓库</TableHead>
              <TableHead>合同号</TableHead>
              <TableHead>车号</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <template v-for="(bill, index) in invoiceDetail.bills" :key="index">
              <!-- Check for vehicles to flatten rows -->
              <template v-if="bill.vehicles && bill.vehicles.length > 0">
                <TableRow v-for="(veh, vIndex) in bill.vehicles" :key="`${index}-${vIndex}`">
                  <TableCell>{{ bill.bill_id?.bill_no }}</TableCell>
                  <TableCell>{{ getOrderDisplay(bill.bill_id) }}</TableCell>
                  <TableCell>{{ bill.bill_id?.brand_no }}</TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.thickness) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.width) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.len) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.weight) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ veh.send_num }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(veh.send_weight) }}
                  </TableCell>
                  <TableCell>{{ bill.bill_id?.ship_warehouse }}</TableCell>
                  <TableCell>{{ bill.bill_id?.contract_no }}</TableCell>
                  <TableCell>{{ veh.veh_name }}</TableCell>
                </TableRow>
              </template>
              <template v-else>
                <TableRow>
                  <TableCell>{{ bill.bill_id?.bill_no }}</TableCell>
                  <TableCell>{{ getOrderDisplay(bill.bill_id) }}</TableCell>
                  <TableCell>{{ bill.bill_id?.brand_no }}</TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.thickness) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.width) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.len) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.bill_id?.weight) }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ bill.num || 0 }}
                  </TableCell>
                  <TableCell class="text-right">
                    {{ formatNumber(bill.weight) }}
                  </TableCell>
                  <TableCell>{{ bill.bill_id?.ship_warehouse }}</TableCell>
                  <TableCell>{{ bill.bill_id?.contract_no }}</TableCell>
                  <TableCell>-</TableCell>
                </TableRow>
              </template>
            </template>
          </TableBody>
        </Table>
      </div>

      <!-- Footer Summary -->
      <div class="mt-4 flex justify-end">
        <div class="border rounded-md p-4 bg-muted/20 w-full md:w-1/3">
          <div class="flex justify-between items-center mb-2">
            <span class="font-bold">总重量:</span>
            <span class="text-lg">{{ formatNumber(calculateTotals.totalWeight) }} 吨</span>
          </div>
          <Separator class="my-2" />
          <div class="flex justify-between items-center">
            <span class="font-bold">总发运块数:</span>
            <span>{{ calculateTotals.totalNum }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="!loading" class="flex flex-col items-center justify-center p-12 border rounded-lg border-dashed bg-muted/10 text-muted-foreground">
      <Search class="w-12 h-12 mb-4 opacity-20" />
      <p>请选择运单号以查看报表</p>
    </div>

    <!-- Advanced Search Dialog -->
    <Dialog v-model:open="showAdvancedSearch">
      <DialogContent class="min-w-[1000px] max-w-[90vw] flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>高级查询</DialogTitle>
          <DialogDescription>
            输入条件搜索运单，点击列表项查看详情
          </DialogDescription>
        </DialogHeader>

        <div class="py-4">
          <div class="grid grid-cols-4 gap-3 items-end">
            <SearchableCombobox
              v-model="advForm.waybillNo"
              :search-fn="searchInvoices"
              placeholder="运单号"
              class="h-9 w-full"
            />
            <SearchableCombobox
              v-model="advForm.vehicleName"
              :search-fn="searchVehicles"
              placeholder="车船号"
              class="h-9 w-full"
            />
            <SearchableCombobox
              v-model="advForm.shipName"
              :search-fn="searchShipNames"
              placeholder="开单名称"
              class="h-9 w-full"
            />
            <Select v-model="advForm.state">
              <SelectTrigger class="h-9 w-full">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="已配发">已配发</SelectItem>
                <SelectItem value="已结算">已结算</SelectItem>
                <SelectItem value="已开票">已开票</SelectItem>
                <SelectItem value="已回款">已回款</SelectItem>
              </SelectContent>
            </Select>
            <DatePicker v-model="advForm.startDate" placeholder="开始日期" :disabled-date="disableStartDate" disabled-hint="开始日期不能晚于结束日期" class="h-9 w-full" />
            <DatePicker v-model="advForm.endDate" placeholder="结束日期" :disabled-date="disableEndDate" disabled-hint="结束日期不能早于开始日期" class="h-9 w-full" />
            
            <div class="col-span-2 flex justify-end gap-2">
              <Button variant="outline" size="sm" @click="resetAdvForm" class="h-9">
                重置
              </Button>
              <Button :disabled="advLoading" size="sm" @click="handleAdvancedSearch" class="h-9">
                <Search class="w-4 h-4 mr-2" />
                查询
              </Button>
            </div>
          </div>
        </div>

        <!-- Search Results -->
        <div class="border rounded-md flex-1 overflow-hidden flex flex-col min-h-[300px]">
          <div class="overflow-y-auto">
            <Table>
              <TableHeader class="bg-muted/50 sticky top-0 z-10">
                <TableRow>
                  <TableHead>运单号</TableHead>
                  <TableHead>车船号</TableHead>
                  <TableHead>开单名称</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>发货日期</TableHead>
                  <TableHead class="w-20 text-center">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-if="advResults.length > 0">
                  <TableRow v-for="inv in advResults" :key="inv._id" class="hover:bg-muted/50">
                    <TableCell class="py-2">{{ inv.waybill_no }}</TableCell>
                    <TableCell class="py-2">{{ inv.vehicle_vessel_name }}</TableCell>
                    <TableCell class="py-2">{{ inv.ship_name }}</TableCell>
                    <TableCell class="py-2">{{ inv.state }}</TableCell>
                    <TableCell class="py-2">{{ formatDate(inv.ship_date) }}</TableCell>
                    <TableCell class="py-2 text-center">
                      <Button size="sm" variant="outline" class="h-7 px-2" @click="selectAdvResult(inv)">
                        选择
                      </Button>
                    </TableCell>
                  </TableRow>
                </template>
                <template v-else>
                  <TableRow>
                    <TableCell colspan="6" class="h-32 text-center text-muted-foreground">
                      {{ advLoading ? '查询中...' : '请输入条件查询' }}
                    </TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>

  </BasicPage>
</template>