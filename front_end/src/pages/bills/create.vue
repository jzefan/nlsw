<script setup lang="ts">
import { AlertCircle, CheckCircle, FileSpreadsheet, Keyboard, Plus, Save, Trash2, Upload, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import {
  createBills,
  searchBrands,
  searchSaleDeps,
  searchWarehouses,
  type BillCreateData,
} from '@/services/api/bill.api'
import { searchCompanies } from '@/services/api/plan.api'

// 模式: 'import' 或 'manual'
const mode = ref<'import' | 'manual'>('import')

// 导入类型: 'normal' 或 'switch_warehouse'
const importType = ref<'normal' | 'switch_warehouse'>('normal')

// 提单数据
const bills = ref<(BillCreateData & { _error?: string })[]>([])
const loading = ref(false)

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
  length: '',
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

// 计算单块重量
function calculateWeight() {
  if (!useFormula.value) return

  const t = Number.parseFloat(form.value.thickness) || 0
  const w = Number.parseFloat(form.value.width) || 0
  const l = Number.parseFloat(form.value.length) || 0

  if (t > 0 && w > 0 && l > 0) {
    // 公式: 长 × 宽 × 厚 × 7.85 × 10⁻⁹ (转换为吨)
    const weight = l * w * t * 7.85 * 1e-9
    form.value.weight = weight.toFixed(4)
    calculateTotalWeight()
  }
}

// 计算总重量
function calculateTotalWeight() {
  const weight = Number.parseFloat(form.value.weight) || 0
  const blockNum = Number.parseInt(form.value.blockNum) || 0

  if (weight > 0 && blockNum > 0) {
    form.value.totalWeight = (weight * blockNum).toFixed(4)
  }
}

// 监听尺寸变化
watch(() => [form.value.thickness, form.value.width, form.value.length], () => {
  calculateWeight()
})

watch(() => form.value.blockNum, () => {
  calculateTotalWeight()
})

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
  if (!bill.billNo) return '缺少提单号'
  if (!bill.orderNo) return '缺少订单号'
  if (bill.orderNo.length !== 11) return `订单号长度必须为11位，当前${bill.orderNo.length}位`
  if (!bill.orderItemNo) return '缺少项次号'
  if (!bill.billingName) return '缺少开单名称'
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
  if (bills.value.some(b => b.orderNo === orderNo && b.orderItemNo === orderItemNo && b.billNo === billNo)) {
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
    length: form.value.length ? Number.parseFloat(form.value.length) : undefined,
    weight: form.value.weight ? Number.parseFloat(form.value.weight) : undefined,
    blockNum: form.value.blockNum ? Number.parseInt(form.value.blockNum) : undefined,
    totalWeight,
  })

  // 清空部分表单
  form.value.billNo = ''
  form.value.orderItemNo = ''
  form.value.thickness = ''
  form.value.width = ''
  form.value.length = ''
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
      // 如果是转外库模式，合并相同订单
      let processedData = data
      if (importType.value === 'switch_warehouse') {
        processedData = mergeAndSetWarehouse(data)
      }

      // 验证数据并标记错误
      bills.value = processedData.map(bill => {
        const error = validateBill(bill)
        return { ...bill, _error: error || undefined }
      })

      const errorCount = bills.value.filter(b => b._error).length
      if (errorCount > 0) {
        toast.warning(`导入 ${data.length} 条记录，其中 ${errorCount} 条有问题`)
      } else {
        toast.success(`导入 ${data.length} 条记录，数据验证通过`)
      }
    } else {
      toast.warning('未找到有效数据')
    }
  } catch (e: any) {
    toast.error('导入失败', { description: e.message })
  } finally {
    loading.value = false
    target.value = ''
  }
}

// 合并相同订单并设置转外库
function mergeAndSetWarehouse(data: BillCreateData[]): BillCreateData[] {
  const merged: BillCreateData[] = []

  for (const row of data) {
    const existing = merged.find(
      m => m.billNo === row.billNo && m.orderNo === row.orderNo && m.orderItemNo === row.orderItemNo
    )

    if (existing) {
      // 合并数量和重量
      existing.blockNum = (existing.blockNum || 0) + (row.blockNum || 0)
      existing.totalWeight = (existing.totalWeight || 0) + (row.totalWeight || 0)
    } else {
      merged.push({
        ...row,
        shipWarehouse: '转外库',
      })
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
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        // 表头映射
        const headerMap: Record<string, string> = {
          '提单号': 'billNo',
          '移拨码单号': 'billNo',
          '入库单号': 'billNo',
          '发货通知单号': 'billNo',
          '订单号': 'orderNo',
          '订单': 'orderNo',
          '订单编号': 'orderNo',
          '订单项次号': 'orderItemNo',
          '项次号': 'orderItemNo',
          '项次': 'orderItemNo',
          '订单编号-项次': 'orderWithItem',
          '订单号-项次': 'orderWithItem',
          '客户名称': 'billingName',
          '开单名称': 'billingName',
          '客户': 'billingName',
          '现有货主': 'billingName',
          '牌号': 'brandNo',
          '标准全名': 'brandNo',
          '标准号': 'brandNo',
          '钢号': 'brandNo',
          '销售部门': 'salesDep',
          '销售组别': 'salesDep',
          '发货库别': 'shipWarehouse',
          '发货仓库': 'shipWarehouse',
          '仓库': 'shipWarehouse',
          '始发库': 'shipWarehouse',
          '合同号': 'contractNo',
          '合同': 'contractNo',
          '客户采购案号': 'contractNo',
          '产品型态': 'productType',
          '产品类型': 'productType',
          '厚度': 'thickness',
          '厚': 'thickness',
          '宽度': 'width',
          '宽': 'width',
          '长度': 'length',
          '长': 'length',
          '单重': 'weight',
          '单块重': 'weight',
          '块数': 'blockNum',
          '发运数': 'blockNum',
          '数量(块)': 'blockNum',
          '数量（块）': 'blockNum',
          '支数': 'blockNum',
          '总重': 'totalWeight',
          '总重量': 'totalWeight',
          '计划出货重量': 'totalWeight',
          '发货重量': 'totalWeight',
          '可发货重量': 'totalWeight',
          '重量': 'totalWeight',
          '重量（T）': 'totalWeight',
          '重量(T)': 'totalWeight',
          '尺寸': 'sizeType',
          '尺寸信息': 'sizeType',
          '规格': 'dimensions',
        }

        let headerRow = -1
        let headers: string[] = []

        // 查找表头行
        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
          const row = jsonData[i]
          if (row && row.some((cell: any) => cell && (cell.toString().includes('订单') || cell.toString().includes('提单')))) {
            headerRow = i
            headers = row.map((cell: any) => cell?.toString().trim() || '')
            break
          }
        }

        if (headerRow === -1) {
          reject(new Error('未找到表头'))
          return
        }

        const result: BillCreateData[] = []
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i]
          if (!row || row.every((cell: any) => !cell)) continue

          const item: any = {}
          headers.forEach((header, idx) => {
            const key = headerMap[header]
            if (key && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
              item[key] = row[idx]?.toString().trim()
            }
          })

          // 处理订单号-项次合并字段
          if (item.orderWithItem && !item.orderNo) {
            const parts = item.orderWithItem.split('-')
            if (parts.length === 2) {
              item.orderNo = parts[0]
              item.orderItemNo = parts[1]
            } else if (item.orderWithItem.length >= 11) {
              item.orderNo = item.orderWithItem.substring(0, 11)
              const sub = item.orderWithItem.substring(11)
              if (sub) {
                item.orderItemNo = sub
              }
            }
          }

          // 验证必填字段
          if (item.orderNo && item.billNo && item.billingName) {
            const thickness = Number.parseFloat(item.thickness) || 0
            const width = Number.parseFloat(item.width) || 0
            const length = Number.parseFloat(item.length) || 0
            let weight = Number.parseFloat(item.weight) || 0
            const blockNum = Number.parseInt(item.blockNum) || 0
            let totalWeight = Number.parseFloat(item.totalWeight) || 0

            // 如果没有单重但有尺寸，计算单重
            if (!weight && thickness > 0 && width > 0 && length > 0) {
              weight = length * width * thickness * 7.85 * 1e-9
            }

            // 如果没有总重但有单重和块数，计算总重
            if (!totalWeight && weight > 0 && blockNum > 0) {
              totalWeight = weight * blockNum
            }

            result.push({
              billNo: item.billNo,
              orderNo: item.orderNo,
              orderItemNo: item.orderItemNo || '10',
              billingName: item.billingName,
              sizeType: item.sizeType || '定尺',
              brandNo: item.brandNo,
              salesDep: item.salesDep,
              shipWarehouse: item.shipWarehouse,
              contractNo: item.contractNo,
              productType: item.productType,
              thickness: thickness || undefined,
              width: width || undefined,
              length: length || undefined,
              weight: weight || undefined,
              blockNum: blockNum || undefined,
              totalWeight: totalWeight || 0,
            })
          }
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
  if (bills.value.length === 0) {
    toast.warning('请先添加或导入数据')
    return
  }

  // 检查是否有错误
  const errorCount = bills.value.filter(b => b._error).length
  if (errorCount > 0) {
    toast.warning(`还有 ${errorCount} 条数据有问题，请先修正`)
    return
  }

  loading.value = true
  try {
    // 移除 _error 字段
    const dataToSave = bills.value.map(({ _error, ...rest }) => rest)
    const result = await createBills(dataToSave)
    if (result.ok) {
      const msg = result.noUpdatedData?.length > 0
        ? `保存成功，新建 ${result.count} 条，${result.noUpdatedData.length} 条已存在未更新`
        : `保存成功，共 ${result.count} 条`
      toast.success(msg)
      clearAll()
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
  return bills.value.filter(b => b._error).length
})

const validCount = computed(() => {
  return bills.value.filter(b => !b._error).length
})

// 格式化数字
function formatNumber(num: number | undefined) {
  if (num === undefined || num === null) return ''
  return num.toFixed(2)
}

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
        <UiButton size="sm" :disabled="bills.length === 0 || errorCount > 0 || loading" @click="save">
          <Save class="w-4 h-4 mr-1" />
          保存
        </UiButton>
      </div>
    </template>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInputNormal"
      type="file"
      accept=".xlsx,.xls"
      class="hidden"
      @change="handleFileChange"
    >
    <input
      ref="fileInputSwitch"
      type="file"
      accept=".xlsx,.xls"
      class="hidden"
      @change="handleFileChange"
    >

    <!-- 导入模式 -->
    <template v-if="mode === 'import'">
      <!-- 导入按钮区域 -->
      <div v-if="bills.length === 0" class="mb-4 p-6 border-2 border-dashed rounded-lg bg-muted/30">
        <div class="text-center">
          <FileSpreadsheet class="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 class="text-lg font-medium mb-2">导入 Excel 文件</h3>
          <p class="text-sm text-muted-foreground mb-4">选择导入方式，支持 .xlsx 和 .xls 格式</p>
          <div class="flex justify-center gap-4">
            <UiButton variant="default" @click="triggerNormalImport">
              <Upload class="w-4 h-4 mr-2" />
              普通导入
            </UiButton>
            <UiButton variant="outline" @click="triggerSwitchImport">
              <Upload class="w-4 h-4 mr-2" />
              转外库导入
            </UiButton>
          </div>
          <p class="text-xs text-muted-foreground mt-4">
            转外库导入：自动合并相同订单，发货仓库设为"转外库"
          </p>
        </div>
      </div>

      <!-- 导入后的操作区 -->
      <div v-else class="mb-4 flex items-center gap-4">
        <UiButton variant="outline" size="sm" @click="triggerNormalImport">
          <Upload class="w-4 h-4 mr-1" />
          重新导入
        </UiButton>
        <UiButton variant="outline" size="sm" @click="triggerSwitchImport">
          <Upload class="w-4 h-4 mr-1" />
          转外库导入
        </UiButton>
        <UiButton variant="ghost" size="sm" @click="clearAll">
          <X class="w-4 h-4 mr-1" />
          清空
        </UiButton>
      </div>
    </template>

    <!-- 手工录入模式 -->
    <template v-else>
      <div class="mb-4 p-3 border rounded-lg bg-muted/50">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
          <UiInput v-model="form.billNo" placeholder="提单号 *" />
          <UiInput
            v-model="form.orderNo"
            placeholder="订单号 (11位) *"
            @blur="validateOrderNo"
          />
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
          <UiInput v-model="form.length" type="number" min="0" step="0.01" placeholder="长度" class="w-32" />
          <span class="text-muted-foreground">×</span>
          <UiInput v-model="form.width" type="number" min="0" step="0.01" placeholder="宽度" class="w-32" />
          <span class="text-muted-foreground">×</span>
          <UiInput v-model="form.thickness" type="number" min="0" step="0.01" placeholder="厚度" class="w-32" />
          <span class="text-muted-foreground">=</span>
          <input
            v-model="form.weight"
            type="number"
            min="0"
            step="0.0001"
            placeholder="单重"
            :disabled="weightDisabled"
            class="w-32 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
          <label class="flex items-center gap-1.5 text-sm whitespace-nowrap cursor-pointer select-none">
            <input
              v-model="useFormula"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300"
            >
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
      <div v-if="errorCount > 0" class="p-3 border rounded-lg bg-red-50 dark:bg-red-950 text-red-800 dark:text-red-200 flex items-center gap-2">
        <AlertCircle class="w-5 h-5" />
        <span>{{ errorCount }} 条数据有问题，请检查下方标红的行</span>
      </div>
      <div v-else class="p-3 border rounded-lg bg-green-50 dark:bg-green-950 text-green-800 dark:text-green-200 flex items-center gap-2">
        <CheckCircle class="w-5 h-5" />
        <span>共 {{ validCount }} 条数据，验证通过，可以保存</span>
      </div>
    </div>

    <!-- 数据表格 -->
    <div v-if="bills.length > 0" class="border rounded-lg overflow-auto">
      <table class="w-full text-sm">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10">操作</th>
            <th class="p-2 text-left">状态</th>
            <th class="p-2 text-left">提单号</th>
            <th class="p-2 text-left">订单号</th>
            <th class="p-2 text-left">项次</th>
            <th class="p-2 text-left">开单名称</th>
            <th class="p-2 text-left">牌号</th>
            <th class="p-2 text-left">销售部门</th>
            <th class="p-2 text-left">仓库</th>
            <th class="p-2 text-right">厚</th>
            <th class="p-2 text-right">宽</th>
            <th class="p-2 text-right">长</th>
            <th class="p-2 text-right">单重</th>
            <th class="p-2 text-right">块数</th>
            <th class="p-2 text-right">总重量</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(bill, index) in bills"
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
              <span v-if="bill._error" class="text-red-600 text-xs" :title="bill._error">
                <AlertCircle class="w-4 h-4 inline" /> {{ bill._error }}
              </span>
              <span v-else class="text-green-600">
                <CheckCircle class="w-4 h-4 inline" />
              </span>
            </td>
            <td class="p-2 font-mono">{{ bill.billNo }}</td>
            <td class="p-2 font-mono">{{ bill.orderNo }}</td>
            <td class="p-2">{{ bill.orderItemNo }}</td>
            <td class="p-2">{{ bill.billingName }}</td>
            <td class="p-2">{{ bill.brandNo }}</td>
            <td class="p-2">{{ bill.salesDep }}</td>
            <td class="p-2">{{ bill.shipWarehouse }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.thickness) }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.width) }}</td>
            <td class="p-2 text-right">{{ formatNumber(bill.length) }}</td>
            <td class="p-2 text-right">{{ bill.weight?.toFixed(4) }}</td>
            <td class="p-2 text-right">{{ bill.blockNum }}</td>
            <td class="p-2 text-right font-medium">{{ formatNumber(bill.totalWeight) }}</td>
          </tr>
        </tbody>
        <tfoot class="bg-muted/50">
          <tr>
            <td colspan="14" class="p-2 font-medium">
              合计: {{ bills.length }} 条
            </td>
            <td class="p-2 text-right font-medium">
              {{ formatNumber(totalWeight) }}
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
