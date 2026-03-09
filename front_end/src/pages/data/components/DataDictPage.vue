<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { ChevronLeft, ChevronRight, Plus, RefreshCw } from 'lucide-vue-next'
import { computed, reactive, toRef } from 'vue'

import DataTable from '@/components/data-table/data-table.vue'
import { generateVueTable } from '@/components/data-table/use-generate-vue-table'
import { BasicPage } from '@/components/global-layout'

const props = defineProps<{
  title: string
  description?: string
  data: any[]
  columns: ColumnDef<any, any>[]
  loading: boolean
  total: number
  page: number
  limit: number
}>()

const emit = defineEmits<{
  (e: 'update:page', page: number): void
  (e: 'refresh'): void
  (e: 'add'): void
}>()

const serverPagination = computed(() => ({
  page: props.page,
  pageSize: props.limit,
  total: props.total,
  onPageChange: (p: number) => emit('update:page', p),
  onPageSizeChange: () => {},
}))

const tableProps = reactive({
  data: toRef(props, 'data'),
  columns: toRef(props, 'columns'),
  serverPagination,
})

const table = generateVueTable(tableProps)

const totalPages = computed(() => Math.ceil(props.total / props.limit) || 1)

</script>

<template>
  <BasicPage :title="title" :description="description || ''">
    <template #actions>
      <slot name="filter" />
      <UiButton variant="outline" size="sm" class="shrink-0" @click="$emit('refresh')">
        <RefreshCw class="w-4 h-4 sm:mr-1" />
        <span class="hidden sm:inline">刷新</span>
      </UiButton>
      <UiButton size="sm" class="shrink-0" @click="$emit('add')">
        <Plus class="w-4 h-4 sm:mr-1" />
        <span class="hidden sm:inline">新增</span>
      </UiButton>
    </template>

    <!-- 桌面端表格 -->
    <div class="hidden md:block border rounded-lg overflow-hidden">
      <DataTable
        :data="data"
        :columns="columns"
        :loading="loading"
        :table="table"
        :server-pagination="serverPagination"
      />
    </div>

    <!-- 移动端卡片列表 -->
    <div class="md:hidden">
      <!-- 统计 -->
      <div class="text-xs text-muted-foreground mb-2">
        共 {{ total }} 条
      </div>

      <!-- 加载中 -->
      <div v-if="loading" class="border rounded-lg p-8 text-center text-muted-foreground">
        加载中...
      </div>

      <!-- 空状态 -->
      <div v-else-if="data.length === 0" class="border rounded-lg p-8 text-center text-muted-foreground">
        暂无数据
      </div>

      <!-- 卡片列表 -->
      <div v-else class="space-y-2">
        <slot name="mobile-card" v-for="(item, index) in data" :key="item._id || item.name || index" :item="item" :index="index" />
      </div>

      <!-- 分页 -->
      <div v-if="total > limit" class="flex items-center justify-between mt-3">
        <span class="text-xs text-muted-foreground">{{ page }} / {{ totalPages }}</span>
        <div class="flex items-center gap-2">
          <UiButton
            variant="outline"
            size="sm"
            :disabled="page <= 1"
            @click="$emit('update:page', page - 1)"
          >
            <ChevronLeft class="w-4 h-4" />
          </UiButton>
          <UiButton
            variant="outline"
            size="sm"
            :disabled="page >= totalPages"
            @click="$emit('update:page', page + 1)"
          >
            <ChevronRight class="w-4 h-4" />
          </UiButton>
        </div>
      </div>
    </div>

    <slot name="dialog" />
  </BasicPage>
</template>
