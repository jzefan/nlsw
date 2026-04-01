<script setup lang="ts">
import { AlertCircle, CheckCircle, FileSpreadsheet, Keyboard, Loader2, Plus, Save, Trash2, Upload, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

import type { BillCreateData } from '@/services/api/bill.api'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { createBills, searchBrands, searchSaleDeps, searchWarehouses } from '@/services/api/bill.api'
import { searchCompanies } from '@/services/api/plan.api'
import { useAuthStore } from '@/stores/auth'
import { formatDim, formatNumber } from '@/utils/format'

// 模式: 'import' 或 'manual'
const mode = ref<'import' | 'manual'>('import')
const authStore = useAuthStore()

// 导入类型: 'normal' 或 'switch_warehouse'
const importType = ref<'normal' | 'switch_warehouse'>('normal')

// 提单数据
const bills = ref<(BillCreateData & { _error?: string })[]>([])
const loading = ref(false)
const filterMode = ref<'all' | 'errors' | 'valid'>('all')

// 文件输入引用
const fileInputNormal = ref<HTMLInputElement>()
const fileInputSwitch = ref<HTMLInputElement>()

// 手工录入表单数据
const form = ref({
  billNo: '',
  orderNo: '',
  orderItemNo: '',
  billingName: '',
  sizeType: '定尺',
  brandNo: '',
  salesDep: '',
  shipWarehouse: '',
  contractNo: '',
  productType: '',
  thickness: '',
  width: '',
  len: '',
  weight: '',
  blockNum: '',
  totalWeight: '',
})

// 尺寸类型选项
const sizeTypes = ['定尺', '乱尺']

// 自动计算开关
const useFormula = ref(true)

// 单重输入框是否禁用
const weightDisabled = computed(() => useFormula.value)

function isFormulaSizeType(sizeType?: string) {
  const normalized = sizeType?.trim()
  return normalized === '定尺' || normalized === '双定尺'
}

function formatImportReasons(reasons: string[]) {
  return Array.from(new Set(reasons.filter(Boolean))).join('；')
}

function normalizeHeaderText(value: any) {
  return value?.toString().replace(/\s+/g, ' ').trim() || ''
}

function normalizeCarrierCompanyName(name?: string) {
  return (name || '').replace(/物流系统\s*$/, '').trim()
}

const clampTwoLinesClass = 'overflow-hidden break-all [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]'

function getExpectedCarrierName() {
  return authStore.isStandalone
    ? normalizeCarrierCompanyName(authStore.standaloneCompany)
    : (authStore.tenant?.name || '')
}

function shouldSkipImportedBillByCarrier(bill: BillCreateData) {
  const expectedCarrierName = getExpectedCarrierName()
  if (!bill.carrier)
    return true
  if (!expectedCarrierName)
    return false
  return !bill.carrier.includes(expectedCarrierName)
}

function buildWorksheetMatrix(worksheet: XLSX.WorkSheet) {
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1')
  const rows: string[][] = []

  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = worksheet[XLSX.utils.encode_cell({ r, c })]
      row.push(normalizeHeaderText(cell?.w ?? cell?.v ?? ''))
    }
    rows.push(row)
  }

  const merges = worksheet['!merges'] || []
  merges.forEach((merge) => {
    const value = rows[merge.s.r]?.[merge.s.c] || ''
    for (let r = merge.s.r; r <= merge.e.r; r++) {
      for (let c = merge.s.c; c <= merge.e.c; c++) {
        if (!rows[r][c]) {
          rows[r][c] = value
        }
      }
    }
  })

  return rows
}

function mapHeaderToKey(header: string, headerMap: Record<string, string>) {
  let key = headerMap[header]
  if (!key && header) {
    if (header.includes('一级承运')) key = 'carrier1'
    else if (header.includes('二级承运')) key = 'carrier2'
    else if (header.includes('承运')) key = 'carrier'
    else if (header.includes('尺寸信息') && header.includes('订单')) key = 'sizeTypeOrder'
    else if (header.includes('尺寸信息') && header.includes('提单')) key = 'sizeTypeBill'
    else if (header.includes('定尺信息') && header.includes('订单')) key = 'sizeTypeOrder'
    else if (header.includes('定尺信息')) key = 'sizeTypeFallback'
    else if (header.includes('尺寸信息')) key = 'sizeTypeFallback'
  }
  return key
}

function buildHeaderCandidates(row1: string[], row2?: string[]) {
  const maxLen = Math.max(row1.length, row2?.length || 0)
  const singleRow = Array.from({ length: maxLen }, (_, idx) => normalizeHeaderText(row1[idx] || ''))

  if (!row2) {
    return [{ headers: singleRow, rowSpan: 1 }]
  }

  const mergedRows = Array.from({ length: maxLen }, (_, idx) => {
    const parts = [normalizeHeaderText(row1[idx] || ''), normalizeHeaderText(row2[idx] || '')].filter(Boolean)
    return Array.from(new Set(parts)).join(' ')
  })

  return [
    { headers: mergedRows, rowSpan: 2 },
    { headers: singleRow, rowSpan: 1 },
  ]
}

// 计算单块重量
function calculateWeight() {
  if (!useFormula.value) return

  const t = Number.parseFloat(form.value.thickness) || 0
  const w = Number.parseFloat(form.value.width) || 0
  const l = Number.parseFloat(form.value.len) || 0

  if (t > 0 && w > 0 && l > 0) {
    // 公式: 长 × 宽 × 厚 × 7.85 × 10⁻⁹ (转换为吨)
    const weight = l * w * t * 7.85 * 1e-9
    form.value.weight = weight.toFixed(3)
    calculateTotalWeight()
  }
}

// 计算总重量
function calculateTotalWeight() {
  const weight = Number.parseFloat(form.value.weight) || 0
  const blockNum = Number.parseInt(form.value.blockNum) || 0

  if (weight > 0 && blockNum > 0) {
    form.value.totalWeight = (weight * blockNum).toFixed(3)
  }
}

// 监听尺寸变化
watch(
  () => [form.value.thickness, form.value.width, form.value.len],
  () => {
    calculateWeight()
  },
)

watch(
  () => form.value.blockNum,
  () => {
    calculateTotalWeight()
  },
)

// 验证订单号
function validateOrderNo() {
  const orderNo = form.value.orderNo.trim()
  if (orderNo && orderNo.length !== 11) {
    toast.warning(`订单号长度必须为11位，当前长度为${orderNo.length}位`)
    return false
  }
  return true
}

// 验证单条数据
function validateBill(bill: BillCreateData): string | null {
  const expectedCarrierName = getExpectedCarrierName()

  if (!bill.billNo) return '缺少提单号'
  if (!bill.orderNo) return '缺少订单号'
  if (bill.orderNo.length !== 11) return `订单号长度必须为11位，当前${bill.orderNo.length}位`
  if (!bill.orderItemNo) return '缺少项次号'
  if (!bill.billingName) return '缺少开单名称'
  if (!bill.carrier) return '缺少承运单位'
  if (!expectedCarrierName) return '未获取到当前公司名称，无法校验承运单位'
  if (!bill.carrier.includes(expectedCarrierName)) return `承运单位未包含${expectedCarrierName}`
  if (!bill.totalWeight || bill.totalWeight <= 0) return '总重量必须大于0'
  return null
}

// 添加单条记录（手工录入）
function addOne() {
  const billNo = form.value.billNo.trim()
  const orderNo = form.value.orderNo.trim()
  const orderItemNo = form.value.orderItemNo.trim()
  const billingName = form.value.billingName
  const totalWeight = Number.parseFloat(form.value.totalWeight)

  if (!billNo) {
    toast.warning('请输入提单号')
    return
  }
  if (!orderNo) {
    toast.warning('请输入订单号')
    return
  }
  if (orderNo.length !== 11) {
    toast.warning('订单号长度必须为11位')
    return
  }
  if (!orderItemNo) {
    toast.warning('请输入订单项次号')
    return
  }
  if (!billingName) {
    toast.warning('请选择开单名称')
    return
  }
  if (!totalWeight || Number.isNaN(totalWeight) || totalWeight <= 0) {
    toast.warning('请输入有效的总重量')
    return
  }

  // 检查是否已添加
  if (bills.value.some((b) => b.orderNo === orderNo && b.orderItemNo === orderItemNo && b.billNo === billNo)) {
    toast.warning('该提单已添加')
    return
  }

  bills.value.push({
    billNo,
    orderNo,
    orderItemNo,
    billingName,
    sizeType: form.value.sizeType,
    brandNo: form.value.brandNo,
    salesDep: form.value.salesDep,
    shipWarehouse: form.value.shipWarehouse,
    contractNo: form.value.contractNo,
    productType: form.value.productType,
    thickness: form.value.thickness ? Number.parseFloat(form.value.thickness) : undefined,
    width: form.value.width ? Number.parseFloat(form.value.width) : undefined,
    len: form.value.len ? Number.parseFloat(form.value.len) : undefined,
    weight: form.value.weight ? Number.parseFloat(form.value.weight) : undefined,
    blockNum: form.value.blockNum ? Number.parseInt(form.value.blockNum) : undefined,
    totalWeight,
  })

  // 清空部分表单
  form.value.billNo = ''
  form.value.orderItemNo = ''
  form.value.thickness = ''
  form.value.width = ''
  form.value.len = ''
  form.value.weight = ''
  form.value.blockNum = ''
  form.value.totalWeight = ''
}

// 删除记录
function removeBill(index: number) {
  bills.value.splice(index, 1)
}

// 清空所有
function clearAll() {
  bills.value = []
  filterMode.value = 'all'
}

// 触发文件输入
function triggerNormalImport() {
  importType.value = 'normal'
  fileInputNormal.value?.click()
}

function triggerSwitchImport() {
  importType.value = 'switch_warehouse'
  fileInputSwitch.value?.click()
}

// 处理文件选择
async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  loading.value = true
  try {
    const data = await readExcelFile(file)
    if (data.length > 0) {
      // 合并相同提单号+订单号+项次号的记录（累加数量和重量）
      let processedData = mergeDuplicates(data)
      // 转外库模式：没有仓库信息的默认设为"转外库"
      if (importType.value === 'switch_warehouse') {
        processedData = processedData.map((row) => ({
          ...row,
          shipWarehouse: row.shipWarehouse || '转外库',
        }))
      }

      const filteredCarrierCount = processedData.filter((bill) => shouldSkipImportedBillByCarrier(bill)).length
      processedData = processedData.filter((bill) => !shouldSkipImportedBillByCarrier(bill))

      if (processedData.length === 0) {
        bills.value = []
        if (filteredCarrierCount > 0) {
          toast.warning('导入后无可展示数据', {
            description: `${filteredCarrierCount} 条记录因缺少承运单位或承运单位不包含当前公司名称，已被自动过滤`,
          })
        } else {
          toast.warning('导入失败', {
            description: '文件中没有可导入的有效数据，请检查必填列和行数据内容',
          })
        }
        return
      }

      // 验证数据并标记错误
      bills.value = processedData.map((bill) => {
        const error = validateBill(bill)
        return { ...bill, _error: error || undefined }
      })

      const errorCount = bills.value.filter((b) => b._error).length
      if (errorCount > 0) {
        toast.warning(`导入 ${processedData.length} 条记录，其中 ${errorCount} 条有问题`, {
          description: filteredCarrierCount > 0 ? `${filteredCarrierCount} 条记录因缺少承运单位或承运单位不包含当前公司名称，已自动过滤` : undefined,
        })
      } else {
        toast.success(`导入 ${processedData.length} 条记录，数据验证通过`, {
          description: filteredCarrierCount > 0 ? `${filteredCarrierCount} 条记录因缺少承运单位或承运单位不包含当前公司名称，已自动过滤` : undefined,
        })
      }
    } else {
      toast.warning('导入失败', {
        description: '文件中没有可导入的有效数据，请检查必填列和行数据内容',
      })
    }
  } catch (e: any) {
    toast.error('导入失败', { description: e.message })
  } finally {
    loading.value = false
    target.value = ''
  }
}

// 合并相同提单号+订单号+项次号的记录
function mergeDuplicates(data: BillCreateData[]): BillCreateData[] {
  const merged: BillCreateData[] = []

  for (const row of data) {
    const existing = merged.find(
      (m) => m.billNo === row.billNo && m.orderNo === row.orderNo && m.orderItemNo === row.orderItemNo,
    )

    if (existing) {
      // 累加数量和重量
      existing.blockNum = (existing.blockNum || 0) + (row.blockNum || 0)
      existing.totalWeight = (existing.totalWeight || 0) + (row.totalWeight || 0)
    } else {
      merged.push({ ...row })
    }
  }

  // 累加后仅定尺/双定尺保留单重和块数，其它类型只保留总重
  for (const bill of merged) {
    if (!isFormulaSizeType(bill.sizeType)) {
      bill.weight = undefined
      bill.blockNum = undefined
      continue
    }

    if (bill.thickness && bill.thickness > 0 && bill.width && bill.width > 0 && bill.len && bill.len > 0) {
      bill.weight = bill.len * bill.width * bill.thickness * 7.85 * 1e-9
    }

    if ((!bill.blockNum || bill.blockNum <= 0) && bill.totalWeight && bill.totalWeight > 0 && bill.weight && bill.weight > 0) {
      bill.blockNum = Math.round(bill.totalWeight / bill.weight)
    }
  }

  return merged
}

// 读取 Excel 文件
function readExcelFile(file: File): Promise<BillCreateData[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = buildWorksheetMatrix(worksheet)

        // 表头映射（与旧系统 bill_import_create_01.js 保持一致）
        const headerMap: Record<string, string> = {
          提单号: 'billNo',
          移拨码单号: 'billNo',
          入库单号: 'billNo',
          发货通知单号: 'billNo',
          订单项次号: 'orderWithItem',
          '订单编号-项次': 'orderWithItem',
          订单编号: 'orderWithItem',
          '订单号-项次': 'orderWithItem',
          订单号: 'orderWithItem',
          牌号: 'brandNo',
          标准全名: 'brandNo',
          标准号: 'brandNo',
          标准名: 'brandNo',
          钢号: 'brandNo',
          长度: 'len',
          长: 'len',
          宽度: 'width',
          宽: 'width',
          厚度: 'thickness',
          厚: 'thickness',
          尺寸: 'sizeType',
          单重: 'weight',
          发运数: 'blockNum',
          块数: 'blockNum',
          '数量(块)': 'blockNum',
          '数量（块）': 'blockNum',
          支数: 'blockNum',
          计划出货重量: 'totalWeight',
          发货重量: 'totalWeight',
          可发货重量: 'totalWeight',
          计划重量: 'totalWeight',
          '重量（T）': 'totalWeight',
          '重量(T)': 'totalWeight',
          重量: 'totalWeight',
          发货库别: 'shipWarehouse',
          发货仓库: 'shipWarehouse',
          仓库: 'shipWarehouse',
          始发库: 'shipWarehouse',
          销售部门: 'salesDep',
          销售组别: 'salesDep',
          客户名称: 'billingName',
          客户: 'billingName',
          客户信息: 'billingName',
          客户编号: 'billingName',
          现有货主: 'billingName',
          现在货主: 'billingName',
          开单名称: 'billingName',
          发货单位: 'billingName',
          合同号: 'contractNo',
          合同: 'contractNo',
          客户采购案号: 'contractNo',
          收货地址: 'shippingAddress',
          订单项次: 'orderItemNo',
          项次: 'orderItemNo',
          项次号: 'orderItemNo',
          规格: 'dimensions',
          产品型态: 'productType',
          货物来源: 'sources',
          '尺寸信息（订单）': 'sizeTypeOrder',
          '尺寸信息（提单）': 'sizeTypeBill',
          '定尺信息（订单）': 'sizeTypeOrder',
          定尺信息: 'sizeTypeFallback',
          尺寸信息: 'sizeTypeFallback',
          承运单位: 'carrier',
          一级承运单位: 'carrier1',
          一级承运: 'carrier1',
          二级承运单位: 'carrier2',
          二级承运: 'carrier2',
          承运: 'carrier',
        }

        let headerRow = -1
        let headerRowSpan = 1
        let headers: string[] = []

        // 查找表头行
        for (let i = 0; i < Math.min(jsonData.length, 50); i++) {
          const row = jsonData[i]
          if (!row) continue

          const rowText = row.join(' ')
          if (!rowText.includes('订单') && !rowText.includes('提单')) {
            continue
          }

          const candidates = buildHeaderCandidates(row, jsonData[i + 1])
          const requiredColumns = [
            { label: '客户名称', keys: ['billingName'] },
            { label: '订单号', keys: ['orderWithItem'] },
            { label: '提单号', keys: ['billNo'] },
            { label: '订单项次号', keys: ['orderItemNo', 'orderWithItem'] },
            { label: '厚度', keys: ['thickness', 'dimensions'] },
            { label: '宽度', keys: ['width', 'dimensions'] },
            { label: '长度', keys: ['len', 'dimensions'] },
            { label: '重量', keys: ['totalWeight'] },
          ]

          for (const candidate of candidates) {
            const mappedHeaderKeys = new Set<string>()
            candidate.headers.forEach((header) => {
              const key = mapHeaderToKey(header, headerMap)
              if (key) mappedHeaderKeys.add(key)
            })

            const missingColumns = requiredColumns
              .filter((column) => !column.keys.some((key) => mappedHeaderKeys.has(key)))
              .map((column) => column.label)

            if (missingColumns.length === 0) {
              headerRow = i
              headerRowSpan = candidate.rowSpan
              headers = candidate.headers
              break
            }
          }

          if (headerRow >= 0) {
            break
          }
        }

        if (headerRow === -1) {
          reject(new Error('未识别到可用表头，请确认文件包含客户名称、订单号、提单号、订单项次号、厚度、宽度、长度、重量等列'))
          return
        }

        const result: BillCreateData[] = []
        const skippedReasons: string[] = []
        for (let i = headerRow + headerRowSpan; i < jsonData.length; i++) {
          const row = jsonData[i]
          if (!row || row.every((cell: any) => !cell)) continue

          const item: any = {}
          headers.forEach((header, idx) => {
            const key = mapHeaderToKey(header, headerMap)
            if (key && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
              item[key] = row[idx]?.toString().trim()
            }
          })

          // 处理订单号/项次号字段（所有订单相关列都映射到 orderWithItem）
          if (item.orderWithItem) {
            const val = item.orderWithItem
            const parts = val.split('-')
            if (parts.length === 2) {
              // 格式: 订单号-项次号
              item.orderNo = parts[0]
              if (!item.orderItemNo) item.orderItemNo = parts[1]
            } else if (val.length > 11) {
              // 格式: 订单号+项次号（无分隔符）
              item.orderNo = val.substring(0, 11)
              if (!item.orderItemNo) item.orderItemNo = val.substring(11)
            } else {
              // 纯订单号
              item.orderNo = val
            }
          }

          // 如果有规格字段，解析出厚度/宽度/长度
          if (item.dimensions && !item.thickness && !item.width && !item.len) {
            const dims = item.dimensions.replace(/≠/, '').split('*')
            if (dims.length >= 1) item.thickness = dims[0]
            if (dims.length >= 2) item.width = dims[1]
            if (dims.length >= 3) item.len = dims[2]
          }

          // 验证必填字段
          if (item.orderNo && item.billNo && item.billingName) {
            const thickness = Number.parseFloat(item.thickness) || 0
            const width = Number.parseFloat(item.width) || 0
            const len = Number.parseFloat(item.len) || 0
            let weight = Number.parseFloat(item.weight) || 0
            let blockNum = Number.parseInt(item.blockNum) || 0
            let totalWeight = Number.parseFloat(item.totalWeight) || 0

            // 尺寸信息：优先 sizeType（尺寸列）> 订单 > 提单 > 通用 > 根据尺寸推断
            const sizeType = item.sizeType || item.sizeTypeOrder || item.sizeTypeBill || item.sizeTypeFallback || ''
            const finalSizeType = sizeType || (thickness > 0 && width > 0 && len > 0 && totalWeight > 0 ? '定尺' : '')
            const shouldUseFormula = isFormulaSizeType(finalSizeType)

            // 只有定尺/双定尺才根据尺寸计算单重
            if (shouldUseFormula && !weight && thickness > 0 && width > 0 && len > 0) {
              weight = len * width * thickness * 7.85 * 1e-9
            }

            // 只有定尺/双定尺才由单重和块数反算总重
            if (shouldUseFormula && !totalWeight && weight > 0 && blockNum > 0) {
              totalWeight = weight * blockNum
            }

            // 只有定尺/双定尺才根据总重和单重推算块数
            if (!blockNum && shouldUseFormula && totalWeight > 0 && weight > 0) {
              blockNum = Math.round(totalWeight / weight)
            }

            if (!shouldUseFormula) {
              weight = 0
              blockNum = 0
            }

            result.push({
              billNo: item.billNo,
              orderNo: item.orderNo,
              orderItemNo: item.orderItemNo || '10',
              billingName: item.billingName,
              sizeType: finalSizeType,
              brandNo: item.brandNo,
              salesDep: item.salesDep,
              shipWarehouse: item.shipWarehouse,
              contractNo: item.contractNo,
              productType: item.productType,
              shippingAddress: item.shippingAddress,
              carrier: item.carrier || item.carrier2 || item.carrier1 || undefined,
              thickness: thickness || undefined,
              width: width || undefined,
              len: len || undefined,
              weight: shouldUseFormula ? (weight || undefined) : undefined,
              blockNum: shouldUseFormula ? (blockNum || undefined) : undefined,
              totalWeight: totalWeight || 0,
            })
          } else {
            const missingFields: string[] = []
            if (!item.billingName) missingFields.push('客户名称')
            if (!item.orderNo && !item.orderWithItem) missingFields.push('订单号')
            if (!item.billNo) missingFields.push('提单号')
            skippedReasons.push(`第 ${i + 1} 行缺少${missingFields.join('、')}`)
          }
        }

        if (result.length === 0) {
          const reason = formatImportReasons(skippedReasons)
          reject(new Error(reason || '文件中没有解析出有效数据，请检查表头和内容格式'))
          return
        }

        resolve(result)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsBinaryString(file)
  })
}

// 保存
async function save() {
  const validBills = bills.value.filter((b) => !b._error)
  if (validBills.length === 0) {
    toast.warning('没有可保存的正确数据')
    return
  }

  loading.value = true
  try {
    // 移除 _error 字段，只保存正确的数据
    const dataToSave = validBills.map(({ _error, ...rest }) => rest)
    const result = await createBills(dataToSave)
    if (result.ok) {
      const msg =
        result.noUpdatedData?.length > 0
          ? `保存成功，新建 ${result.count} 条，${result.noUpdatedData.length} 条已存在未更新`
          : `保存成功，共 ${result.count} 条`
      toast.success(msg)
      // 保留错误数据供用户查看，清除已保存的正确数据
      const errorBills = bills.value.filter((b) => b._error)
      if (errorBills.length > 0) {
        bills.value = errorBills
      } else {
        clearAll()
      }
    } else {
      toast.error('保存失败', { description: result.response })
    }
  } catch (e: any) {
    toast.error('保存失败', { description: e.message })
  } finally {
    loading.value = false
  }
}

// 计算统计
const totalWeight = computed(() => {
  return bills.value.reduce((sum, b) => sum + (b.totalWeight || 0), 0)
})

const errorCount = computed(() => {
  return bills.value.filter((b) => b._error).length
})

const validCount = computed(() => {
  return bills.value.filter((b) => !b._error).length
})

const visibleBills = computed(() => {
  return bills.value
    .map((bill, index) => ({ bill, index }))
    .filter(({ bill }) => {
      if (filterMode.value === 'errors')
        return !!bill._error
      if (filterMode.value === 'valid')
        return !bill._error
      return true
    })
})

// 切换到手工录入模式
function switchToManual() {
  mode.value = 'manual'
}

// 切换到导入模式
function switchToImport() {
  mode.value = 'import'
}
</script>

<template>
  <BasicPage title="新建提单" :description="mode === 'import' ? '导入Excel创建提单' : '手工录入提单'">
    <template #actions>
      <div class="flex items-center gap-2">
        <template v-if="mode === 'import'">
          <UiButton variant="outline" size="sm" @click="switchToManual">
            <Keyboard class="w-4 h-4 mr-1" />
            手工录入
          </UiButton>
        </template>
        <template v-else>
          <UiButton variant="outline" size="sm" @click="switchToImport">
            <FileSpreadsheet class="w-4 h-4 mr-1" />
            返回导入
          </UiButton>
        </template>
        <UiButton size="sm" :disabled="validCount === 0 || loading" @click="save">
          <Save class="w-4 h-4 mr-1" />
          {{ errorCount > 0 ? `保存正确数据 (${validCount})` : '保存' }}
        </UiButton>
      </div>
    </template>

    <!-- 隐藏的文件输入 -->
    <input ref="fileInputNormal" type="file" accept=".xlsx,.xls" class="hidden" @change="handleFileChange" />
    <input ref="fileInputSwitch" type="file" accept=".xlsx,.xls" class="hidden" @change="handleFileChange" />

    <!-- 导入模式 -->
    <template v-if="mode === 'import'">
      <!-- 导入按钮区域 -->
      <div v-if="bills.length === 0" class="mb-4 p-6 border-2 border-dashed rounded-lg bg-muted/30">
        <div class="text-center">
          <Loader2 v-if="loading" class="w-12 h-12 mx-auto text-primary mb-4 animate-spin" />
          <FileSpreadsheet v-else class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 class="text-lg font-medium mb-2">导入 Excel 文件</h3>
          <p class="text-sm text-muted-foreground mb-4">
            {{ loading ? '正在读取 Excel 数据，请稍候...' : '选择导入方式，支持 .xlsx 和 .xls 格式' }}
          </p>
          <div class="flex justify-center gap-4">
            <UiButton variant="default" :disabled="loading" @click="triggerNormalImport">
              <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
              <Upload v-else class="w-4 h-4 mr-2" />
              {{ loading ? '读取中...' : '发货/异储文件' }}
            </UiButton>
            <UiButton variant="outline" :disabled="loading" @click="triggerSwitchImport">
              <Loader2 v-if="loading" class="w-4 h-4 mr-2 animate-spin" />
              <Upload v-else class="w-4 h-4 mr-2" />
              {{ loading ? '读取中...' : '厂内/转外库文件' }}
            </UiButton>
          </div>
          <p class="text-xs text-muted-foreground mt-4">
            自动合并相同订单，如果转外库导入：excel中的发货仓库如果为空，则默认设为"转外库"
          </p>
          <p class="text-xs text-muted-foreground mt-2">
            导入的Excel文件列至少包含客户名称、订单号、提单号、订单项次号、厚度、宽度、长度、重量等基本信息
          </p>
        </div>
      </div>

      <!-- 导入后的操作区 -->
      <div v-else class="mb-4 flex items-center gap-4">
        <UiButton variant="outline" size="sm" :disabled="loading" @click="triggerNormalImport">
          <Loader2 v-if="loading" class="w-4 h-4 mr-1 animate-spin" />
          <Upload v-else class="w-4 h-4 mr-1" />
          {{ loading ? '读取中...' : '重新导入' }}
        </UiButton>
        <UiButton variant="outline" size="sm" :disabled="loading" @click="triggerSwitchImport">
          <Loader2 v-if="loading" class="w-4 h-4 mr-1 animate-spin" />
          <Upload v-else class="w-4 h-4 mr-1" />
          {{ loading ? '读取中...' : '转外库导入' }}
        </UiButton>
        <UiButton variant="ghost" size="sm" :disabled="loading" @click="clearAll">
          <X class="w-4 h-4 mr-1" />
          清空
        </UiButton>
      </div>
    </template>

    <div
      v-if="mode === 'import' && loading"
      class="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary"
    >
      <Loader2 class="w-4 h-4 animate-spin" />
      <span>正在读取 Excel 数据，请勿重复操作。</span>
    </div>

    <!-- 手工录入模式 -->
    <template v-if="mode === 'manual'">
      <div class="mb-4 p-3 border rounded-lg bg-muted/50">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <UiInput v-model="form.billNo" placeholder="提单号 *" />
          <UiInput v-model="form.orderNo" placeholder="订单号 (11位) *" @blur="validateOrderNo" />
          <UiInput v-model="form.orderItemNo" placeholder="项次号 *" />
          <SearchableCombobox v-model="form.billingName" :search-fn="searchCompanies" placeholder="开单名称 *" />
          <SearchableCombobox v-model="form.brandNo" :search-fn="searchBrands" placeholder="牌号" />
          <SearchableCombobox v-model="form.salesDep" :search-fn="searchSaleDeps" placeholder="销售部门" />
          <SearchableCombobox v-model="form.shipWarehouse" :search-fn="searchWarehouses" placeholder="发货仓库" />
          <UiInput v-model="form.contractNo" placeholder="合同号" />
          <UiInput v-model="form.productType" placeholder="产品型态" />
          <UiSelect v-model="form.sizeType">
            <UiSelectTrigger class="w-full">
              <UiSelectValue placeholder="尺寸类型" />
            </UiSelectTrigger>
            <UiSelectContent>
              <UiSelectItem v-for="s in sizeTypes" :key="s" :value="s">
                {{ s }}
              </UiSelectItem>
            </UiSelectContent>
          </UiSelect>
          <UiInput v-model="form.blockNum" type="number" min="0" placeholder="块数" />
          <UiInput v-model="form.totalWeight" type="number" min="0" step="0.0001" placeholder="总重量 *" />
        </div>
        <!-- 尺寸和重量单独一行 -->
        <div class="mt-2 flex flex-wrap items-center gap-2">
          <UiInput v-model="form.thickness" type="number" min="0" step="0.01" placeholder="厚度" class="w-32" />
          <span class="text-muted-foreground">×</span>
          <UiInput v-model="form.width" type="number" min="0" step="0.01" placeholder="宽度" class="w-32" />
          <span class="text-muted-foreground">×</span>
          <UiInput v-model="form.len" type="number" min="0" step="0.01" placeholder="长度" class="w-32" />
          <span class="text-muted-foreground">=</span>
          <input
            v-model="form.weight"
            type="number"
            min="0"
            step="0.0001"
            placeholder="单重"
            :disabled="weightDisabled"
            class="w-32 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          />
          <label class="flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer select-none">
            <input v-model="useFormula" type="checkbox" class="h-4 w-4 rounded border-gray-300" />
            自动计算
          </label>
        </div>
        <div class="mt-3 flex items-center justify-end gap-2">
          <UiButton size="sm" @click="addOne">
            <Plus class="w-4 h-4 mr-1" />
            添加
          </UiButton>
          <UiButton variant="outline" size="sm" @click="clearAll">
            <X class="w-4 h-4 mr-1" />
            清空
          </UiButton>
        </div>
      </div>
    </template>

    <!-- 数据验证状态 -->
    <div v-if="bills.length > 0" class="mb-3">
      <div
        v-if="errorCount > 0"
        class="p-3 border rounded-lg bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 flex items-center gap-2"
      >
        <AlertCircle class="w-5 h-5" />
        <span
          >{{ errorCount }} 条数据有问题（标红行），{{
            validCount > 0 ? `${validCount} 条正确数据可以保存` : '无可保存数据'
          }}</span
        >
        <div class="ml-auto flex items-center gap-2">
          <UiButton
            v-if="validCount > 0"
            variant="outline"
            size="sm"
            @click="filterMode = filterMode === 'valid' ? 'all' : 'valid'"
          >
            {{ filterMode === 'valid' ? '显示全部数据' : '显示正确数据' }}
          </UiButton>
          <UiButton variant="outline" size="sm" @click="filterMode = filterMode === 'errors' ? 'all' : 'errors'">
            {{ filterMode === 'errors' ? '显示全部数据' : '显示错误数据' }}
          </UiButton>
        </div>
      </div>
      <div
        v-else
        class="p-3 border rounded-lg bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 flex items-center gap-2"
      >
        <CheckCircle class="w-5 h-5" />
        <span>共 {{ validCount }} 条数据，验证通过，可以保存</span>
      </div>
    </div>

    <!-- 数据表格 -->
    <div v-if="bills.length > 0" class="border rounded-lg overflow-x-auto overflow-y-auto">
      <table class="w-full text-sm min-w-[1600px] table-auto">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10 whitespace-nowrap">操作</th>
            <th class="p-2 text-left whitespace-nowrap">状态</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[120px]">提单号</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[120px]">订单号</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[80px]">项次</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[180px]">开单名称</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[180px]">牌号</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[120px]">销售部门</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[140px]">仓库</th>
            <th class="p-2 text-right whitespace-nowrap">厚</th>
            <th class="p-2 text-right whitespace-nowrap">宽</th>
            <th class="p-2 text-right whitespace-nowrap">长</th>
            <th class="p-2 text-right whitespace-nowrap">单重</th>
            <th class="p-2 text-right whitespace-nowrap">块数</th>
            <th class="p-2 text-right whitespace-nowrap">总重量</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[110px]">尺寸类型</th>
            <th class="p-2 text-left whitespace-nowrap min-w-[220px]">承运单位</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="({ bill, index }) in visibleBills"
            :key="`${bill.orderNo}-${bill.orderItemNo}-${bill.billNo}-${index}`"
            class="border-t hover:bg-muted/30"
            :class="{ 'bg-red-50 dark:bg-red-950/30': bill._error }"
          >
            <td class="p-2">
              <UiButton variant="ghost" size="icon" class="h-6 w-6 text-red-500" @click="removeBill(index)">
                <Trash2 class="w-4 h-4" />
              </UiButton>
            </td>
            <td class="p-2">
              <div v-if="bill._error" class="flex max-w-[220px] items-start gap-1 text-red-600 text-xs" :title="bill._error">
                <AlertCircle class="w-4 h-4 shrink-0 mt-0.5" />
                <div :class="clampTwoLinesClass" class="max-w-[190px]">{{ bill._error }}</div>
              </div>
              <span v-else class="text-green-600">
                <CheckCircle class="w-4 h-4 inline" />
              </span>
            </td>
            <td class="p-2 font-mono"><div :class="clampTwoLinesClass">{{ bill.billNo }}</div></td>
            <td class="p-2 font-mono"><div :class="clampTwoLinesClass">{{ bill.orderNo }}</div></td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.orderItemNo }}</div></td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.billingName }}</div></td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.brandNo }}</div></td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.salesDep }}</div></td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.shipWarehouse }}</div></td>
            <td class="p-2 text-right">{{ formatDim(bill.thickness) }}</td>
            <td class="p-2 text-right">{{ formatDim(bill.width) }}</td>
            <td class="p-2 text-right">{{ formatDim(bill.len) }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.weight, 3) }}</td>
            <td class="p-2 text-right">{{ bill.blockNum }}</td>
            <td class="p-2 text-right font-medium">{{ formatNumber(bill.totalWeight, 3) }}</td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.sizeType }}</div></td>
            <td class="p-2"><div :class="clampTwoLinesClass">{{ bill.carrier }}</div></td>
          </tr>
        </tbody>
        <tfoot class="bg-muted/50">
          <tr>
            <td colspan="16" class="p-2 font-medium">合计: {{ visibleBills.length }} 条</td>
            <td class="p-2 text-right font-medium">
              {{ formatNumber(visibleBills.reduce((sum, item) => sum + (item.bill.totalWeight || 0), 0), 3) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
