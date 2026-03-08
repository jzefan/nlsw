<script setup lang="ts">
import { Plus, Save, Trash2, Upload, X } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import * as XLSX from 'xlsx'

import type { PlanCreateData } from '@/services/api/plan.api'

import { formatNumber } from '@/utils/format'

import { BasicPage } from '@/components/global-layout'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import {
  checkPlanExists,
  createPlans,

  searchCompanies,
  searchDestinations,
} from '@/services/api/plan.api'

// 订单数据
const orders = ref<PlanCreateData[]>([])
const loading = ref(false)

// 表单数据
const form = ref({
  orderNo: '',
  orderWeight: '',
  customerName: '',
  customerCode: '',
  destination: '',
  transportMode: '船运',
  consignee: '',
  dsClient: '',
  contractNo: '',
  salesman: '',
  receivingCharge: '',
  consigner: '',
  entryTime: '',
})

// 运输方式选项
const transportModes = ['船运', '汽运', '船运+汽运', '火车']

// 文件输入引用
const fileInput = ref<HTMLInputElement>()

// 验证订单号
async function validateOrderNo() {
  const orderNo = form.value.orderNo.trim()
  if (orderNo.length !== 11) {
    toast.warning(`订单号长度必须为11位，当前长度为${orderNo.length}位`)
    return false
  }

  try {
    // 从订单号解析日期
    const year = `20${orderNo.substr(3, 2)}`
    const month = orderNo.substr(5, 2)
    form.value.entryTime = `${year}-${month}`

    // 检查是否已存在
    const result = await checkPlanExists(orderNo)
    if (result.exist) {
      toast.warning(`订单号 ${orderNo} 已存在`)
      return false
    }
    return true
  }
  catch (e) {
    console.error('验证订单号失败', e)
    return false
  }
}

// 添加单条记录
async function addOne() {
  const orderNo = form.value.orderNo.trim()
  const orderWeight = Number.parseFloat(form.value.orderWeight)
  const customerName = form.value.customerName

  if (!orderNo) {
    toast.warning('请输入订单号')
    return
  }
  if (orderNo.length !== 11) {
    toast.warning(`订单号长度必须为11位，当前长度为${orderNo.length}位`)
    return
  }
  if (!orderWeight || Number.isNaN(orderWeight)) {
    toast.warning('请输入订单量')
    return
  }
  if (!customerName) {
    toast.warning('请选择客户名称')
    return
  }

  // 检查是否已添加
  if (orders.value.some(o => o.orderNo === orderNo)) {
    toast.warning('订单号已添加')
    return
  }

  orders.value.push({
    orderNo,
    orderWeight,
    customerName,
    customerCode: form.value.customerCode,
    destination: form.value.destination,
    transportMode: form.value.transportMode,
    consignee: form.value.consignee,
    dsClient: form.value.dsClient,
    contractNo: form.value.contractNo,
    salesman: form.value.salesman,
    receivingCharge: form.value.receivingCharge ? Number.parseFloat(form.value.receivingCharge) : undefined,
    consigner: form.value.consigner,
  })

  // 清空部分表单
  form.value.orderNo = ''
  form.value.orderWeight = ''
}

// 删除记录
function removeOrder(index: number) {
  orders.value.splice(index, 1)
}

// 清空所有
function clearAll() {
  orders.value = []
  form.value = {
    orderNo: '',
    orderWeight: '',
    customerName: '',
    customerCode: '',
    destination: '',
    transportMode: '船运',
    consignee: '',
    dsClient: '',
    contractNo: '',
    salesman: '',
    receivingCharge: '',
    consigner: '',
    entryTime: '',
  }
}

// 导入 Excel
function triggerFileInput() {
  fileInput.value?.click()
}

async function handleFileChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file)
    return

  loading.value = true
  try {
    const data = await readExcelFile(file)
    if (data.length > 0) {
      orders.value.push(...data)
      toast.success(`成功导入 ${data.length} 条记录`)
    }
    else {
      toast.warning('未找到有效数据')
    }
  }
  catch (e: any) {
    toast.error('导入失败', { description: e.message })
  }
  finally {
    loading.value = false
    target.value = ''
  }
}

// 读取 Excel 文件
function readExcelFile(file: File): Promise<PlanCreateData[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[sheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]

        // 查找表头
        const headerMap: Record<string, string> = {
          订单号: 'orderNo',
          订单: 'orderNo',
          订单量: 'orderWeight',
          客户代码: 'customerCode',
          流向: 'destination',
          发货目的地: 'destination',
          客户名称: 'customerName',
          下游客户: 'dsClient',
          运输方式: 'transportMode',
          南钢业务员: 'salesman',
          客户业务员: 'salesman',
          业务员: 'consigner',
          订单状态: 'status',
          合同号: 'contractNo',
          运价: 'receivingCharge',
          接单价: 'receivingCharge',
          收货人: 'consignee',
        }

        let headerRow = -1
        let headers: string[] = []

        for (let i = 0; i < Math.min(jsonData.length, 20); i++) {
          const row = jsonData[i]
          if (row && row.some((cell: any) => cell && cell.toString().includes('订单号'))) {
            headerRow = i
            headers = row.map((cell: any) => cell?.toString() || '')
            break
          }
        }

        if (headerRow === -1) {
          reject(new Error('未找到表头'))
          return
        }

        const result: PlanCreateData[] = []
        for (let i = headerRow + 1; i < jsonData.length; i++) {
          const row = jsonData[i]
          if (!row || row.every((cell: any) => !cell))
            continue

          const item: any = {}
          headers.forEach((header, idx) => {
            const key = headerMap[header]
            if (key && row[idx] !== undefined) {
              item[key] = row[idx]?.toString().trim() || ''
            }
          })

          if (item.orderNo && item.orderWeight) {
            result.push({
              orderNo: item.orderNo,
              orderWeight: Number.parseFloat(item.orderWeight) || 0,
              customerName: item.customerName || '',
              customerCode: item.customerCode || '',
              destination: item.destination || '',
              transportMode: item.transportMode || '船运',
              consignee: item.consignee || '',
              dsClient: item.dsClient || '',
              contractNo: item.contractNo || '',
              salesman: item.salesman || '',
              receivingCharge: item.receivingCharge ? Number.parseFloat(item.receivingCharge) : undefined,
              consigner: item.consigner || '',
            })
          }
        }

        resolve(result)
      }
      catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error('读取文件失败'))
    reader.readAsBinaryString(file)
  })
}

// 保存
async function save() {
  if (orders.value.length === 0) {
    toast.warning('请先添加或导入数据')
    return
  }

  loading.value = true
  try {
    const result = await createPlans(orders.value)
    if (result.ok) {
      toast.success('保存成功')
      clearAll()
    }
    else {
      toast.error('保存失败', { description: result.response })
    }
  }
  catch (e: any) {
    toast.error('保存失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

// 计算总重量
const totalWeight = computed(() => {
  return orders.value.reduce((sum, o) => sum + (o.orderWeight || 0), 0)
})

</script>

<template>
  <BasicPage title="新建计划" description="创建新的订单计划">
    <template #actions>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" @click="triggerFileInput">
          <Upload class="w-4 h-4 mr-1" />
          导入 Excel
        </UiButton>
        <UiButton size="sm" :disabled="orders.length === 0 || loading" @click="save">
          <Save class="w-4 h-4 mr-1" />
          保存
        </UiButton>
      </div>
    </template>

    <!-- 隐藏的文件输入 -->
    <input
      ref="fileInput"
      type="file"
      accept=".xlsx,.xls"
      class="hidden"
      @change="handleFileChange"
    >

    <!-- 输入表单 -->
    <div class="mb-4 p-3 border rounded-lg bg-muted/50">
      <div class="grid grid-cols-2 md:grid-cols-4 gap-2">
        <UiInput
          v-model="form.orderNo"
          placeholder="订单号 (11位) *"
          @blur="validateOrderNo"
        />
        <UiInput v-model="form.orderWeight" type="number" step="0.01" placeholder="订单量 *" />
        <SearchableCombobox v-model="form.customerName" :search-fn="searchCompanies" placeholder="客户名称 *" />
        <UiInput v-model="form.customerCode" placeholder="客户代码" />
        <SearchableCombobox v-model="form.destination" :search-fn="searchDestinations" placeholder="目的地" />
        <UiSelect v-model="form.transportMode">
          <UiSelectTrigger class="w-full">
            <UiSelectValue placeholder="运输方式" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem v-for="m in transportModes" :key="m" :value="m">
              {{ m }}
            </UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiInput v-model="form.consignee" placeholder="收货人" />
        <UiInput v-model="form.dsClient" placeholder="下游客户" />
        <UiInput v-model="form.contractNo" placeholder="合同号" />
        <UiInput v-model="form.salesman" placeholder="客户业务员" />
        <UiInput v-model="form.receivingCharge" type="number" step="0.01" placeholder="接单价" />
        <UiInput v-model="form.consigner" placeholder="业务员" />
      </div>
      <div class="mt-3 flex gap-2">
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

    <!-- 数据表格 -->
    <div class="border rounded-lg overflow-auto">
      <table class="w-full text-sm min-w-[1024px]">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left w-10 whitespace-nowrap">
              操作
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              订单号
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              订单量
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              客户名称
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              客户代码
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              目的地
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              运输方式
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              收货人
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              下游客户
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              客户业务员
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              业务员
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              合同号
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              接单价
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(order, index) in orders" :key="order.orderNo" class="border-t hover:bg-muted/30">
            <td class="p-2">
              <UiButton variant="ghost" size="icon" class="h-6 w-6 text-red-500" @click="removeOrder(index)">
                <Trash2 class="w-4 h-4" />
              </UiButton>
            </td>
            <td class="p-2 font-mono">
              {{ order.orderNo }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(order.orderWeight, 2) }}
            </td>
            <td class="p-2">
              {{ order.customerName }}
            </td>
            <td class="p-2">
              {{ order.customerCode }}
            </td>
            <td class="p-2">
              {{ order.destination }}
            </td>
            <td class="p-2">
              {{ order.transportMode }}
            </td>
            <td class="p-2">
              {{ order.consignee }}
            </td>
            <td class="p-2">
              {{ order.dsClient }}
            </td>
            <td class="p-2">
              {{ order.salesman }}
            </td>
            <td class="p-2">
              {{ order.consigner }}
            </td>
            <td class="p-2">
              {{ order.contractNo }}
            </td>
            <td class="p-2 text-right">
              {{ formatNumber(order.receivingCharge, 2) }}
            </td>
          </tr>
          <tr v-if="orders.length === 0">
            <td colspan="13" class="p-8 text-center text-muted-foreground">
              暂无数据，请手动输入或导入 Excel
            </td>
          </tr>
        </tbody>
        <tfoot v-if="orders.length > 0" class="bg-muted/50">
          <tr>
            <td colspan="2" class="p-2 font-medium">
              合计: {{ orders.length }} 条
            </td>
            <td class="p-2 text-right font-medium">
              {{ formatNumber(totalWeight, 2) }}
            </td>
            <td colspan="10" />
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
