<script setup lang="ts">
import { Plus, RefreshCw } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'vue-sonner'

import type { ShipmentBatch } from '@/services/api/data-process.api'

import { BasicPage } from '@/components/global-layout'
import { getShipmentBatches } from '@/services/api/data-process.api'

const router = useRouter()
const loading = ref(false)
const batches = ref<ShipmentBatch[]>([])
const total = ref(0)
const page = ref(1)
const limit = ref(20)

async function loadData() {
  loading.value = true
  try {
    const result = await getShipmentBatches({
      productType: 'round-steel',
      page: page.value,
      limit: limit.value,
    })
    if (result.ok) {
      batches.value = result.data
      total.value = result.total
    }
  }
  catch (e: any) {
    toast.error('加载数据失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}

function formatDate(date: string | undefined) {
  if (!date)
    return ''
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatWeight(num: number | undefined) {
  if (num === undefined || num === null)
    return ''
  return num.toFixed(2)
}

function handlePageChange(newPage: number) {
  page.value = newPage
  loadData()
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <BasicPage title="圆钢数据处理" description="已保存的批次记录">
    <template #actions>
      <div class="flex items-center gap-2">
        <UiButton variant="outline" size="sm" @click="loadData">
          <RefreshCw class="w-4 h-4 sm:mr-1" />
          <span class="hidden sm:inline">刷新</span>
        </UiButton>
        <UiButton size="sm" @click="router.push('/data-process/round-steel-create')">
          <Plus class="w-4 h-4 sm:mr-1" />
          <span>新建</span>
        </UiButton>
      </div>
    </template>

    <!-- 桌面端表格 -->
    <div class="hidden lg:block border rounded-lg overflow-x-auto">
      <table class="text-sm w-full">
        <thead class="bg-muted/50">
          <tr>
            <th class="p-2 text-left whitespace-nowrap">
              批次号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              创建人
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              创建时间
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              条数
            </th>
            <th class="p-2 text-right whitespace-nowrap">
              总重量
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              装车单号
            </th>
            <th class="p-2 text-left whitespace-nowrap">
              车号
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="batch in batches"
            :key="batch.batchId"
            class="border-t hover:bg-muted/30"
          >
            <td class="p-2 font-mono text-xs">
              {{ batch.batchId.slice(-8) }}
            </td>
            <td class="p-2">
              {{ batch.createdBy }}
            </td>
            <td class="p-2">
              {{ formatDate(batch.createdAt) }}
            </td>
            <td class="p-2 text-right">
              {{ batch.rowCount }}
            </td>
            <td class="p-2 text-right">
              {{ formatWeight(batch.totalWeight) }}
            </td>
            <td class="p-2">
              {{ batch.loadingListNos.join(', ') }}
            </td>
            <td class="p-2">
              {{ batch.vehicleNos.join(', ') }}
            </td>
          </tr>
          <tr v-if="batches.length === 0 && !loading">
            <td colspan="7" class="p-8 text-center text-muted-foreground">
              暂无数据，点击"新建"开始处理圆钢数据
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 移动端卡片视图 -->
    <div class="lg:hidden space-y-2">
      <div
        v-for="batch in batches"
        :key="batch.batchId"
        class="border rounded-lg p-3"
      >
        <div class="flex items-center justify-between mb-2">
          <span class="font-mono text-xs text-muted-foreground">{{ batch.batchId.slice(-8) }}</span>
          <span class="text-xs text-muted-foreground">{{ formatDate(batch.createdAt) }}</span>
        </div>
        <div class="text-sm space-y-1">
          <div class="flex justify-between">
            <span class="text-muted-foreground">创建人:</span>
            <span>{{ batch.createdBy }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">条数:</span>
            <span>{{ batch.rowCount }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-muted-foreground">总重量:</span>
            <span>{{ formatWeight(batch.totalWeight) }}</span>
          </div>
          <div v-if="batch.loadingListNos.length > 0">
            <span class="text-muted-foreground">装车单号:</span>
            <span class="ml-1">{{ batch.loadingListNos.join(', ') }}</span>
          </div>
          <div v-if="batch.vehicleNos.length > 0">
            <span class="text-muted-foreground">车号:</span>
            <span class="ml-1">{{ batch.vehicleNos.join(', ') }}</span>
          </div>
        </div>
      </div>

      <div v-if="batches.length === 0 && !loading" class="border rounded-lg p-8 text-center text-muted-foreground">
        暂无数据，点击"新建"开始处理圆钢数据
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > limit" class="mt-4 flex flex-col sm:flex-row items-center justify-between gap-2">
      <div class="text-xs sm:text-sm text-muted-foreground">
        共 {{ total }} 条
      </div>
      <div class="flex items-center gap-2">
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page <= 1"
          @click="handlePageChange(page - 1)"
        >
          上一页
        </UiButton>
        <span class="text-xs sm:text-sm">{{ page }} / {{ Math.ceil(total / limit) || 1 }}</span>
        <UiButton
          variant="outline"
          size="sm"
          :disabled="page >= Math.ceil(total / limit)"
          @click="handlePageChange(page + 1)"
        >
          下一页
        </UiButton>
      </div>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
