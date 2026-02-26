<script setup lang="ts">
import { FileText, Receipt, RefreshCw } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { getTenantBills, getTenantInvoices, getTenants } from '@/services/api/platform.api'
import type { BillItem, InvoiceItem, TenantItem } from '@/services/api/platform.api'

// Tenant selection
const tenants = ref<TenantItem[]>([])
const selectedTenantId = ref('')
const tenantsLoading = ref(false)

// Tab
const activeTab = ref<'bills' | 'invoices'>('bills')

// Bills
const bills = ref<BillItem[]>([])
const billsTotal = ref(0)
const billsPage = ref(1)
const billsLimit = ref(20)
const billsLoading = ref(false)

// Invoices
const invoices = ref<InvoiceItem[]>([])
const invoicesTotal = ref(0)
const invoicesPage = ref(1)
const invoicesLimit = ref(20)
const invoicesLoading = ref(false)

const billsTotalPages = computed(() => Math.ceil(billsTotal.value / billsLimit.value) || 1)
const invoicesTotalPages = computed(() => Math.ceil(invoicesTotal.value / invoicesLimit.value) || 1)

const selectedTenant = computed(() => tenants.value.find(t => t._id === selectedTenantId.value))

async function loadTenants() {
  tenantsLoading.value = true
  try {
    const res = await getTenants()
    if (res.ok) {
      tenants.value = res.data
    }
  }
  catch (e: any) {
    toast.error('获取公司列表失败', { description: e.message })
  }
  finally {
    tenantsLoading.value = false
  }
}

async function loadBills() {
  if (!selectedTenantId.value || !selectedTenantId.value.trim()) return
  billsLoading.value = true
  try {
    const res = await getTenantBills(selectedTenantId.value, billsPage.value, billsLimit.value)
    if (res.ok) {
      bills.value = res.data
      billsTotal.value = res.total
    }
  }
  catch (e: any) {
    toast.error('获取提单列表失败', { description: e.message })
  }
  finally {
    billsLoading.value = false
  }
}

async function loadInvoices() {
  if (!selectedTenantId.value || !selectedTenantId.value.trim()) return
  invoicesLoading.value = true
  try {
    const res = await getTenantInvoices(selectedTenantId.value, invoicesPage.value, invoicesLimit.value)
    if (res.ok) {
      invoices.value = res.data
      invoicesTotal.value = res.total
    }
  }
  catch (e: any) {
    toast.error('获取运单列表失败', { description: e.message })
  }
  finally {
    invoicesLoading.value = false
  }
}

function onTenantChange() {
  billsPage.value = 1
  invoicesPage.value = 1
  bills.value = []
  invoices.value = []
  billsTotal.value = 0
  invoicesTotal.value = 0
  if (selectedTenantId.value && selectedTenantId.value.trim()) {
    loadBills()
    loadInvoices()
  }
}

function refreshCurrentTab() {
  if (activeTab.value === 'bills') {
    loadBills()
  }
  else {
    loadInvoices()
  }
}

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatNumber(num: number | null | undefined) {
  if (num == null) return '-'
  return num.toLocaleString('zh-CN')
}

// Bills pagination
function billsPrev() {
  if (billsPage.value > 1) {
    billsPage.value--
    loadBills()
  }
}
function billsNext() {
  if (billsPage.value < billsTotalPages.value) {
    billsPage.value++
    loadBills()
  }
}

// Invoices pagination
function invoicesPrev() {
  if (invoicesPage.value > 1) {
    invoicesPage.value--
    loadInvoices()
  }
}
function invoicesNext() {
  if (invoicesPage.value < invoicesTotalPages.value) {
    invoicesPage.value++
    loadInvoices()
  }
}

onMounted(() => {
  loadTenants()
})
</script>

<template>
  <BasicPage title="公司业务查看" description="查看各公司的提单和运单数据">
    <template #actions>
      <UiButton variant="outline" size="sm" :disabled="!selectedTenantId" @click="refreshCurrentTab">
        <RefreshCw class="w-4 h-4 sm:mr-1" />
        <span class="hidden sm:inline">刷新</span>
      </UiButton>
    </template>

    <!-- 公司选择 -->
    <div class="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-2">
      <label class="text-sm font-medium shrink-0">选择公司:</label>
      <UiSelect v-model="selectedTenantId" @update:model-value="onTenantChange">
        <UiSelectTrigger class="w-full sm:w-72">
          <UiSelectValue placeholder="-- 请选择公司 --" />
        </UiSelectTrigger>
        <UiSelectContent>
          <UiSelectItem value=" ">
            -- 请选择公司 --
          </UiSelectItem>
          <UiSelectItem v-for="t in tenants" :key="t._id" :value="t._id">
            {{ t.name }} [{{ t.code }}]
          </UiSelectItem>
        </UiSelectContent>
      </UiSelect>
      <span v-if="selectedTenant" class="text-sm text-muted-foreground">
        提单: {{ billsTotal }} 条 | 运单: {{ invoicesTotal }} 条
      </span>
    </div>

    <!-- 无选择提示 -->
    <div v-if="!selectedTenantId || !selectedTenantId.trim()" class="py-12 text-center text-muted-foreground">
      请选择一个公司查看业务数据
    </div>

    <!-- Tab 切换 -->
    <div v-if="selectedTenantId && selectedTenantId.trim()">
      <div class="flex border-b mb-4">
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'bills' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'bills'"
        >
          <FileText class="w-4 h-4 inline-block mr-1 -mt-0.5" />
          提单
        </button>
        <button
          class="px-4 py-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === 'invoices' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'"
          @click="activeTab = 'invoices'"
        >
          <Receipt class="w-4 h-4 inline-block mr-1 -mt-0.5" />
          运单
        </button>
      </div>

      <!-- 提单 Tab -->
      <div v-if="activeTab === 'bills'">
        <div v-if="billsLoading" class="py-8 text-center text-muted-foreground">
          加载中...
        </div>

        <div v-else class="border rounded-lg overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="p-2 text-left">
                  提单号
                </th>
                <th class="p-2 text-left">
                  订单号
                </th>
                <th class="p-2 text-left">
                  开单名称
                </th>
                <th class="p-2 text-right">
                  金额
                </th>
                <th class="p-2 text-right">
                  重量
                </th>
                <th class="p-2 text-center">
                  状态
                </th>
                <th class="p-2 text-left">
                  创建日期
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="bill in bills" :key="bill._id" class="border-t hover:bg-muted/30">
                <td class="p-2">
                  {{ bill.bill_no || '-' }}
                </td>
                <td class="p-2">
                  {{ bill.order_no || '-' }}
                </td>
                <td class="p-2">
                  {{ bill.billing_name || '-' }}
                </td>
                <td class="p-2 text-right">
                  {{ formatNumber(bill.customer_price) }}
                </td>
                <td class="p-2 text-right">
                  {{ formatNumber(bill.total_weight) }}
                </td>
                <td class="p-2 text-center">
                  <UiBadge variant="secondary">
                    {{ bill.status }}
                  </UiBadge>
                </td>
                <td class="p-2 text-muted-foreground">
                  {{ formatDate(bill.create_date) }}
                </td>
              </tr>
              <tr v-if="bills.length === 0">
                <td colspan="7" class="p-8 text-center text-muted-foreground">
                  暂无数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 提单分页 -->
        <div v-if="billsTotal > 0" class="mt-4 flex items-center justify-between">
          <span class="text-sm text-muted-foreground">共 {{ billsTotal }} 条</span>
          <div class="flex items-center gap-2">
            <UiButton variant="outline" size="sm" :disabled="billsPage <= 1" @click="billsPrev">
              上一页
            </UiButton>
            <span class="text-sm">{{ billsPage }} / {{ billsTotalPages }}</span>
            <UiButton variant="outline" size="sm" :disabled="billsPage >= billsTotalPages" @click="billsNext">
              下一页
            </UiButton>
          </div>
        </div>
      </div>

      <!-- 运单 Tab -->
      <div v-if="activeTab === 'invoices'">
        <div v-if="invoicesLoading" class="py-8 text-center text-muted-foreground">
          加载中...
        </div>

        <div v-else class="border rounded-lg overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-muted/50">
              <tr>
                <th class="p-2 text-left">
                  运单号
                </th>
                <th class="p-2 text-left">
                  车船名
                </th>
                <th class="p-2 text-right">
                  重量
                </th>
                <th class="p-2 text-right">
                  运费
                </th>
                <th class="p-2 text-center">
                  状态
                </th>
                <th class="p-2 text-left">
                  发运日期
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="inv in invoices" :key="inv._id" class="border-t hover:bg-muted/30">
                <td class="p-2">
                  {{ inv.waybill_no || '-' }}
                </td>
                <td class="p-2">
                  {{ inv.vehicle_vessel_name || '-' }}
                </td>
                <td class="p-2 text-right">
                  {{ formatNumber(inv.total_weight) }}
                </td>
                <td class="p-2 text-right">
                  {{ formatNumber(inv.vessel_price) }}
                </td>
                <td class="p-2 text-center">
                  <UiBadge variant="secondary">
                    {{ inv.state || '-' }}
                  </UiBadge>
                </td>
                <td class="p-2 text-muted-foreground">
                  {{ formatDate(inv.ship_date) }}
                </td>
              </tr>
              <tr v-if="invoices.length === 0">
                <td colspan="6" class="p-8 text-center text-muted-foreground">
                  暂无数据
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 运单分页 -->
        <div v-if="invoicesTotal > 0" class="mt-4 flex items-center justify-between">
          <span class="text-sm text-muted-foreground">共 {{ invoicesTotal }} 条</span>
          <div class="flex items-center gap-2">
            <UiButton variant="outline" size="sm" :disabled="invoicesPage <= 1" @click="invoicesPrev">
              上一页
            </UiButton>
            <span class="text-sm">{{ invoicesPage }} / {{ invoicesTotalPages }}</span>
            <UiButton variant="outline" size="sm" :disabled="invoicesPage >= invoicesTotalPages" @click="invoicesNext">
              下一页
            </UiButton>
          </div>
        </div>
      </div>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
  requiresPlatformUser: true
</route>
