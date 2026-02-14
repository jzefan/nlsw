<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { Plus, RefreshCw } from 'lucide-vue-next'
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
</script>

<template>
  <BasicPage :title="title" :description="description || ''">
    <template #actions>
      <slot name="filter" />
      <UiButton variant="outline" size="sm" @click="$emit('refresh')">
        <RefreshCw class="w-4 h-4 mr-1" />
        刷新
      </UiButton>
      <UiButton size="sm" @click="$emit('add')">
        <Plus class="w-4 h-4 mr-1" />
        新增
      </UiButton>
    </template>

    <div class="border rounded-lg overflow-hidden">
      <DataTable
        :data="data"
        :columns="columns"
        :loading="loading"
        :table="table"
        :server-pagination="serverPagination"
      />
    </div>

    <slot name="dialog" />
  </BasicPage>
</template>
