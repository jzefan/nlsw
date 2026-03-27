<script setup lang="ts">
// @ts-nocheck
import { Download, Printer, Search } from 'lucide-vue-next'
import { computed, ref, watch, watchEffect } from 'vue'
import { toast } from 'vue-sonner'
import ExcelJS from 'exceljs'

import { BasicPage } from '@/components/global-layout'
import ExportDialog from '@/components/export-dialog.vue'
import { useExport } from '@/composables/use-export'
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
import { formatDate, formatDim, formatNumber, toExcelDate, toExcelNum } from '@/utils/format'

const { exportWithBufferPicker, showExportDialog, exportFileName, confirmExport } = useExport()

const companyName = computed(() => {
  // 独立部署模式：使用 .env 中配置的公司名称
  if (authStore.isStandalone && authStore.standaloneCompany) return authStore.standaloneCompany
  // SaaS 模式：使用当前租户公司名称
  if (authStore.companyDisplayName) return authStore.companyDisplayName
  return COMPANY_FULL_NAME
})
import { hasPermission, isAdmin, PERMISSIONS } from '@/constants/permissions'

const authStore = useAuthStore()

// 权限
const privilege = computed(() => authStore.user?.privilege ?? [])
const canSeePrice = computed(() => hasPermission(privilege.value, PERMISSIONS.SEE_PRICE))
// 业务权限用户只能看自己的运单（无统计/会计/管理权限）
const isOperatorOnly = computed(() =>
  !isAdmin(privilege.value)
  && !hasPermission(privilege.value, PERMISSIONS.STATISTICS)
  && !hasPermission(privilege.value, PERMISSIONS.ACCOUNT)
)

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

// 业务权限用户强制只看自己的运单
watchEffect(() => {
  if (isOperatorOnly.value) {
    myWaybills.value = true
  }
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
          ...item,
          value: item.waybill_no,
          name: item.waybill_no,
          shipper: [item.shipper_name, item.transport_type, item.vehicle_vessel_name].filter(Boolean).join(' | '),
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
      <h2><i class="fa fa-globe"></i> ${companyName.value}发货单</h2>
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
                   <td class="text-right">${formatDim(billInfo.thickness)}</td>
                   <td class="text-right">${formatDim(billInfo.width)}</td>
                   <td class="text-right">${formatDim(billInfo.len)}</td>
                   <td class="text-right">${formatNumber(billInfo.weight)}</td>
                   <td class="text-right">${veh.send_num}</td>
                   <td class="text-right">${formatNumber(getVehSendWeight(veh, billInfo))}</td>
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
                 <td class="text-right">${formatDim(billInfo.thickness)}</td>
                 <td class="text-right">${formatDim(billInfo.width)}</td>
                 <td class="text-right">${formatDim(billInfo.len)}</td>
                 <td class="text-right">${formatNumber(billInfo.weight)}</td>
                 <td class="text-right">${bill.num || 0}</td>
                 <td class="text-right">${formatNumber(getBillSendWeight(bill))}</td>
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
  // 合并单元格宽度约束：{ startCol(0-based), endCol(0-based), width }
  const mergedConstraints: { startCol: number, endCol: number, width: number }[] = []

  // 计算文本宽度（中文字符算2个宽度，英文算1个）
  // 数字类型先格式化为最多3位小数再计算宽度，避免原始精度撑大列宽
  function getTextWidth(text: any): number {
    if (text instanceof Date) return 10 // yyyy-mm-dd
    const str = typeof text === 'number'
      ? parseFloat(text.toFixed(3)).toString()
      : String(text ?? '')
    return [...str].reduce((sum, char) => {
      return sum + (char.charCodeAt(0) > 127 ? 2 : 1)
    }, 0)
  }

  // 更新单列列宽
  function updateColumnWidth(colIndex: number, text: any) {
    const width = getTextWidth(text)
    columnWidths[colIndex] = Math.max(columnWidths[colIndex], width)
  }

  // 更新合并列列宽（内容宽度分摊到跨越的列）
  function updateMergedColumnWidth(startCol: number, endCol: number, text: any) {
    const width = getTextWidth(text)
    if (width > 0) {
      mergedConstraints.push({ startCol, endCol, width })
    }
  }

  // 最终计算列宽：先用单列宽度，再用合并约束补齐不足
  function resolveColumnWidths() {
    for (const { startCol, endCol, width } of mergedConstraints) {
      const spanCount = endCol - startCol + 1
      // 当前跨越列的宽度总和
      let currentSum = 0
      for (let c = startCol; c <= endCol; c++) {
        currentSum += columnWidths[c]
      }
      // 如果现有总宽度不够，将差额均分到各列
      if (currentSum < width) {
        const deficit = width - currentSum
        const perCol = Math.ceil(deficit / spanCount)
        for (let c = startCol; c <= endCol; c++) {
          columnWidths[c] += perCol
        }
      }
    }
  }

  let rowNum = 1

  // 标题行
  sheet.mergeCells(rowNum, 1, rowNum, 12)
  const titleCell = sheet.getCell(rowNum, 1)
  const titleText = `${companyName.value}发货单`
  titleCell.value = titleText
  titleCell.font = { bold: true, size: 16 }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  sheet.getRow(rowNum).height = 30
  // 标题跨全部12列，不影响单列宽度
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
  updateMergedColumnWidth(1, 2, inv.waybill_no)

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  const r1c4 = '开单名称'
  row1.getCell(4).value = r1c4
  row1.getCell(4).font = { bold: true }
  row1.getCell(4).fill = labelFill
  row1.getCell(4).border = thinBorder
  row1.getCell(5).border = thinBorder
  updateMergedColumnWidth(3, 4, r1c4)

  sheet.mergeCells(rowNum, 6, rowNum, 9)
  row1.getCell(6).value = inv.ship_name
  for (let c = 6; c <= 9; c++) row1.getCell(c).border = thinBorder
  updateMergedColumnWidth(5, 8, inv.ship_name)

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
  updateMergedColumnWidth(10, 11, inv.ship_to)
  rowNum++

  // 第二行：车船号(1列) | 车船号值(2列) | 发货单位(2列) | 发货单位值(4列) | 联系人(1列) | 联系人值(2列)
  const row2 = sheet.getRow(rowNum)
  row2.getCell(1).value = '车船号'
  row2.getCell(1).font = { bold: true }
  row2.getCell(1).fill = labelFill
  row2.getCell(1).border = thinBorder
  updateColumnWidth(0, '车船号')

  sheet.mergeCells(rowNum, 2, rowNum, 3)
  row2.getCell(2).value = inv.vehicle_vessel_name
  row2.getCell(2).border = thinBorder
  row2.getCell(3).border = thinBorder
  updateMergedColumnWidth(1, 2, inv.vehicle_vessel_name)

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  row2.getCell(4).value = '发货单位'
  row2.getCell(4).font = { bold: true }
  row2.getCell(4).fill = labelFill
  row2.getCell(4).border = thinBorder
  row2.getCell(5).border = thinBorder
  updateMergedColumnWidth(3, 4, '发货单位')

  sheet.mergeCells(rowNum, 6, rowNum, 9)
  row2.getCell(6).value = inv.ship_customer || '-'
  for (let c = 6; c <= 9; c++) row2.getCell(c).border = thinBorder
  updateMergedColumnWidth(5, 8, inv.ship_customer)

  row2.getCell(10).value = '联系人'
  row2.getCell(10).font = { bold: true }
  row2.getCell(10).fill = labelFill
  row2.getCell(10).border = thinBorder
  updateColumnWidth(9, '联系人')

  sheet.mergeCells(rowNum, 11, rowNum, 12)
  row2.getCell(11).value = inv.ship_to_contact || '-'
  row2.getCell(11).border = thinBorder
  row2.getCell(12).border = thinBorder
  updateMergedColumnWidth(10, 11, inv.ship_to_contact)
  rowNum++

  // 第三行：发货日期(1列) | 发货日期值(2列) | 电话(2列) | 电话值(4列) | 电话(1列) | 电话值(2列)
  const row3 = sheet.getRow(rowNum)
  row3.getCell(1).value = '发货日期'
  row3.getCell(1).font = { bold: true }
  row3.getCell(1).fill = labelFill
  row3.getCell(1).border = thinBorder
  updateColumnWidth(0, '发货日期')

  sheet.mergeCells(rowNum, 2, rowNum, 3)
  const shipDate = toExcelDate(inv.ship_date)
  row3.getCell(2).value = shipDate
  if (shipDate instanceof Date) {
    row3.getCell(2).numFmt = 'yyyy-mm-dd'
  }
  row3.getCell(2).border = thinBorder
  row3.getCell(3).border = thinBorder
  updateMergedColumnWidth(1, 2, shipDate)

  sheet.mergeCells(rowNum, 4, rowNum, 5)
  row3.getCell(4).value = '电话'
  row3.getCell(4).font = { bold: true }
  row3.getCell(4).fill = labelFill
  row3.getCell(4).border = thinBorder
  row3.getCell(5).border = thinBorder
  updateMergedColumnWidth(3, 4, '电话')

  sheet.mergeCells(rowNum, 6, rowNum, 9)
  row3.getCell(6).value = inv.ship_phone || '-'
  for (let c = 6; c <= 9; c++) row3.getCell(c).border = thinBorder
  updateMergedColumnWidth(5, 8, inv.ship_phone)

  row3.getCell(10).value = '电话'
  row3.getCell(10).font = { bold: true }
  row3.getCell(10).fill = labelFill
  row3.getCell(10).border = thinBorder
  updateColumnWidth(9, '电话')

  sheet.mergeCells(rowNum, 11, rowNum, 12)
  row3.getCell(11).value = inv.ship_to_phone || '-'
  row3.getCell(11).border = thinBorder
  row3.getCell(12).border = thinBorder
  updateMergedColumnWidth(10, 11, inv.ship_to_phone)
  rowNum++

  // 第四行：始发地(1列) | 始发地值(11列)
  const row4 = sheet.getRow(rowNum)
  row4.getCell(1).value = '始发地'
  row4.getCell(1).font = { bold: true }
  row4.getCell(1).fill = labelFill
  row4.getCell(1).border = thinBorder
  updateColumnWidth(0, '始发地')

  sheet.mergeCells(rowNum, 2, rowNum, 12)
  row4.getCell(2).value = inv.ship_from
  for (let c = 2; c <= 12; c++) row4.getCell(c).border = thinBorder
  updateMergedColumnWidth(1, 11, inv.ship_from)
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

  // 数字列索引（厚度3, 宽度4, 长度5, 单重6, 发运数7, 发运重量8）
  const numColIndices = new Set([3, 4, 5, 6, 7, 8])
  // 重量列索引（单重6, 发运重量8）→ 3位小数
  const weightColIndices = new Set([6, 8])

  // 交替背景色（用于船运按车分组）
  const altFillA: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F7FF' } }
  const altFillB: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8F0' } }

  const addDataRow = (data: any[], fill?: ExcelJS.Fill) => {
    const dataRow = sheet.getRow(rowNum)
    data.forEach((val, idx) => {
      const cell = dataRow.getCell(idx + 1)
      cell.value = val
      cell.border = thinBorder
      if (fill) cell.fill = fill
      if (numColIndices.has(idx)) {
        cell.alignment = { horizontal: 'right' }
      }
      if (weightColIndices.has(idx) && typeof val === 'number') {
        cell.numFmt = '0.000'
      }
      if (idx === 2) {
        cell.alignment = { wrapText: true }
      }
      updateColumnWidth(idx, val)
    })
    rowNum++
  }

  // 判断是否为船运（有 vehicles 的提单）
  const isVesselInvoice = inv.bills.some((bill: any) => bill.vehicles && bill.vehicles.length > 0)

  if (isVesselInvoice) {
    // 船运：展开所有 bill-vehicle 对，按 inner_waybill_no 排序
    const flatRows: { billInfo: any; veh: any; innerWaybillNo: string }[] = []
    inv.bills.forEach((bill: any) => {
      const billInfo = bill.bill_id || {}
      if (bill.vehicles && bill.vehicles.length > 0) {
        bill.vehicles.forEach((veh: any) => {
          flatRows.push({ billInfo, veh, innerWaybillNo: veh.inner_waybill_no || '' })
        })
      }
    })
    flatRows.sort((a, b) => a.innerWaybillNo.localeCompare(b.innerWaybillNo))

    // 按 inner_waybill_no 分组交替背景色
    let currentInnerNo = ''
    let colorIndex = 0
    flatRows.forEach((row) => {
      if (row.innerWaybillNo !== currentInnerNo) {
        if (currentInnerNo !== '') colorIndex++
        currentInnerNo = row.innerWaybillNo
      }
      const fill = colorIndex % 2 === 0 ? altFillA : altFillB
      addDataRow([
        row.billInfo.bill_no || '',
        getOrderDisplay(row.billInfo),
        row.billInfo.brand_no || '',
        toExcelNum(row.billInfo.thickness),
        toExcelNum(row.billInfo.width),
        toExcelNum(row.billInfo.len),
        toExcelNum(row.billInfo.weight),
        toExcelNum(row.veh.send_num),
        toExcelNum(getVehSendWeight(row.veh, row.billInfo)),
        row.billInfo.ship_warehouse || '',
        row.billInfo.contract_no || '',
        row.veh.veh_name || ''
      ], fill)
    })
  } else {
    // 车运：按原顺序输出
    inv.bills.forEach((bill: any) => {
      const billInfo = bill.bill_id || {}
      addDataRow([
        billInfo.bill_no || '',
        getOrderDisplay(billInfo),
        billInfo.brand_no || '',
        toExcelNum(billInfo.thickness),
        toExcelNum(billInfo.width),
        toExcelNum(billInfo.len),
        toExcelNum(billInfo.weight),
        toExcelNum(bill.num),
        toExcelNum(getBillSendWeight(bill)),
        billInfo.ship_warehouse || '',
        billInfo.contract_no || '',
        '-'
      ])
    })
  }

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
  updateMergedColumnWidth(7, 8, summaryText1)
  updateMergedColumnWidth(9, 11, summaryText2)

  // 解析合并单元格约束，补齐列宽
  resolveColumnWidths()

  // 应用列宽（设置最小宽度8，最大宽度50）
  sheet.columns = columnWidths.map(width => ({
    width: Math.max(8, Math.min(width + 4, 50))
  }))

  // 通过对话框导出
  exportWithBufferPicker({
    fileName: `发货单_${inv.waybill_no}`,
    generateBuffer: () => workbook.xlsx.writeBuffer(),
  })
}

// 计算提单的单块重（兼容 weight 字段为空的情况）
function getUnitWeight(billInfo: any) {
  if (!billInfo) return 0
  return billInfo.weight || (billInfo.block_num > 0 ? (billInfo.total_weight || 0) / billInfo.block_num : 0)
}

// 计算船运车辆的发运重量
function getVehSendWeight(veh: any, billInfo: any) {
  return veh.send_weight || ((veh.send_num || 0) * getUnitWeight(billInfo))
}

// 计算车运提单的发运重量
function getBillSendWeight(bill: any) {
  return bill.weight || ((bill.num || 0) * getUnitWeight(bill.bill_id))
}

// 判断是否为船运（有 vehicles 的提单）
const isVesselInvoice = computed(() => {
  return invoiceDetail.value?.bills?.some((bill: any) => bill.vehicles && bill.vehicles.length > 0) ?? false
})

// 船运：展平并按 inner_waybill_no 排序的行数据
const sortedVesselRows = computed(() => {
  if (!isVesselInvoice.value || !invoiceDetail.value?.bills) return []
  const rows: { billInfo: any; veh: any; innerWaybillNo: string }[] = []
  invoiceDetail.value.bills.forEach((bill: any) => {
    const billInfo = bill.bill_id || {}
    if (bill.vehicles && bill.vehicles.length > 0) {
      bill.vehicles.forEach((veh: any) => {
        rows.push({ billInfo, veh, innerWaybillNo: veh.inner_waybill_no || '' })
      })
    }
  })
  rows.sort((a, b) => a.innerWaybillNo.localeCompare(b.innerWaybillNo))

  // 标记每行所属的车辆颜色组
  let currentInnerNo = ''
  let colorIndex = 0
  return rows.map((row) => {
    if (row.innerWaybillNo !== currentInnerNo) {
      if (currentInnerNo !== '') colorIndex++
      currentInnerNo = row.innerWaybillNo
    }
    return { ...row, colorIndex }
  })
})

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
        totalWeight += getVehSendWeight(veh, bill.bill_id)
      })
    }
    else {
      totalNum += bill.num || 0
      totalWeight += getBillSendWeight(bill)
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

        <div v-if="!isOperatorOnly" class="flex items-center gap-2">
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
          {{ companyName }}发货单
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
              <TableHead class="max-w-[240px]">牌号</TableHead>
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
            <!-- 船运：按 inner_waybill_no 排序，交替背景 -->
            <template v-if="isVesselInvoice">
              <TableRow
                v-for="(row, idx) in sortedVesselRows"
                :key="idx"
                :class="row.colorIndex % 2 === 0 ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'bg-orange-50/50 dark:bg-orange-950/20'"
              >
                <TableCell>{{ row.billInfo?.bill_no }}</TableCell>
                <TableCell>{{ getOrderDisplay(row.billInfo) }}</TableCell>
                <TableCell class="max-w-[240px] break-words whitespace-normal">{{ row.billInfo?.brand_no }}</TableCell>
                <TableCell class="text-right">{{ formatDim(row.billInfo?.thickness) }}</TableCell>
                <TableCell class="text-right">{{ formatDim(row.billInfo?.width) }}</TableCell>
                <TableCell class="text-right">{{ formatDim(row.billInfo?.len) }}</TableCell>
                <TableCell class="text-right">{{ formatNumber(row.billInfo?.weight) }}</TableCell>
                <TableCell class="text-right">{{ row.veh.send_num }}</TableCell>
                <TableCell class="text-right">{{ formatNumber(getVehSendWeight(row.veh, row.billInfo)) }}</TableCell>
                <TableCell>{{ row.billInfo?.ship_warehouse }}</TableCell>
                <TableCell>{{ row.billInfo?.contract_no }}</TableCell>
                <TableCell>{{ row.veh.veh_name }}</TableCell>
              </TableRow>
            </template>
            <!-- 车运：按原顺序 -->
            <template v-else>
              <TableRow v-for="(bill, index) in invoiceDetail.bills" :key="index">
                <TableCell>{{ bill.bill_id?.bill_no }}</TableCell>
                <TableCell>{{ getOrderDisplay(bill.bill_id) }}</TableCell>
                <TableCell class="max-w-[240px] break-words whitespace-normal">{{ bill.bill_id?.brand_no }}</TableCell>
                <TableCell class="text-right">{{ formatDim(bill.bill_id?.thickness) }}</TableCell>
                <TableCell class="text-right">{{ formatDim(bill.bill_id?.width) }}</TableCell>
                <TableCell class="text-right">{{ formatDim(bill.bill_id?.len) }}</TableCell>
                <TableCell class="text-right">{{ formatNumber(bill.bill_id?.weight) }}</TableCell>
                <TableCell class="text-right">{{ bill.num || 0 }}</TableCell>
                <TableCell class="text-right">{{ formatNumber(getBillSendWeight(bill)) }}</TableCell>
                <TableCell>{{ bill.bill_id?.ship_warehouse }}</TableCell>
                <TableCell>{{ bill.bill_id?.contract_no }}</TableCell>
                <TableCell>-</TableCell>
              </TableRow>
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

    <!-- 导出对话框 -->
    <ExportDialog
      v-model:open="showExportDialog"
      :default-file-name="exportFileName"
      @confirm="confirmExport"
    />
  </BasicPage>
</template>