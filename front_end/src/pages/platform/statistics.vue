<script setup lang="ts">
import { BarChart3, Building2, FileText, Receipt, Users } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { getPlatformStats } from '@/services/api/platform.api'
import type { PlatformStats, TenantDistribution } from '@/services/api/platform.api'

const loading = ref(false)
const stats = ref<PlatformStats | null>(null)

async function loadStats() {
  loading.value = true
  try {
    const res = await getPlatformStats()
    if (res.ok) {
      stats.value = res.data
    }
  }
  catch (e: any) {
    toast.error('获取统计数据失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStats()
})
</script>

<template>
  <BasicPage title="平台统计报告" description="查看平台汇总数据">
    <template #actions>
      <UiButton variant="outline" size="sm" :disabled="loading" @click="loadStats">
        <BarChart3 class="w-4 h-4 mr-1" />
        刷新
      </UiButton>
    </template>

    <div v-if="loading && !stats" class="py-12 text-center text-muted-foreground">
      加载中...
    </div>

    <template v-if="stats">
      <!-- 统计卡片 -->
      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Building2 class="w-4 h-4" />
            活跃公司
          </div>
          <div class="text-2xl font-bold">
            {{ stats.activeTenants }}
          </div>
        </div>
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Building2 class="w-4 h-4 text-destructive" />
            暂停公司
          </div>
          <div class="text-2xl font-bold">
            {{ stats.suspendedTenants }}
          </div>
        </div>
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Users class="w-4 h-4" />
            总用户数
          </div>
          <div class="text-2xl font-bold">
            {{ stats.totalUsers }}
          </div>
        </div>
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <FileText class="w-4 h-4" />
            总提单数
          </div>
          <div class="text-2xl font-bold">
            {{ stats.totalBills }}
          </div>
        </div>
        <div class="border rounded-lg p-4">
          <div class="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <Receipt class="w-4 h-4" />
            总运单数
          </div>
          <div class="text-2xl font-bold">
            {{ stats.totalInvoices }}
          </div>
        </div>
      </div>

      <!-- 公司分布表格 -->
      <h3 class="text-base font-medium mb-3">
        公司业务分布
      </h3>
      <div class="border rounded-lg overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="bg-muted/50">
            <tr>
              <th class="p-2 text-left">
                公司名称
              </th>
              <th class="p-2 text-left">
                编码
              </th>
              <th class="p-2 text-right">
                提单数
              </th>
              <th class="p-2 text-right">
                运单数
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in stats.distribution" :key="item.tenantId" class="border-t hover:bg-muted/30">
              <td class="p-2">
                {{ item.tenantName }}
              </td>
              <td class="p-2 text-muted-foreground">
                {{ item.tenantCode }}
              </td>
              <td class="p-2 text-right">
                {{ item.billCount }}
              </td>
              <td class="p-2 text-right">
                {{ item.invoiceCount }}
              </td>
            </tr>
            <tr v-if="stats.distribution.length === 0">
              <td colspan="4" class="p-8 text-center text-muted-foreground">
                暂无数据
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
  requiresPlatformUser: true
</route>
