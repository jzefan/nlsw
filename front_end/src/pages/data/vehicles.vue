<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { Pencil, Trash2 } from 'lucide-vue-next'
import { h } from 'vue'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select as UiSelect, SelectContent as UiSelectContent, SelectItem as UiSelectItem, SelectTrigger as UiSelectTrigger, SelectValue as UiSelectValue } from '@/components/ui/select'
import { Item, ItemContent, ItemDescription, ItemFooter, ItemTitle } from '@/components/ui/item'
import SearchableCombobox from '@/components/searchable-combobox.vue'
import { deleteVehicle, getVehicles } from '@/services/api/data-dict.api'
import { useAxios } from '@/composables/use-axios'

import DataDictPage from './components/DataDictPage.vue'
import VehicleDialog from './components/VehicleDialog.vue'
import { useDataDict } from './composables/use-data-dict'

// 筛选条件
const filterCategory = ref('')
const filterType = ref('')
const filterBoss = ref('')

const {
  data, loading, total, page, limit, searchTerm,
  Modal, dialogOpen, editingItem,
  loadData, openAdd, openEdit, handleDelete, onPageChange,
} = useDataDict({
  getList: getVehicles,
  delete: deleteVehicle,
  extraParams: () => {
    const params: Record<string, any> = {}
    if (filterCategory.value && filterCategory.value !== 'all') params.category = filterCategory.value
    if (filterType.value && filterType.value !== 'all') params.type = filterType.value
    if (filterBoss.value) params.boss = filterBoss.value
    return params
  },
})

// 承运单位列表（从后端获取完整去重列表）
const { axiosInstance } = useAxios()
const allBossList = ref<string[]>([])

onMounted(async () => {
  try {
    const res = await axiosInstance.get<{ ok: boolean; data: string[] }>('/vehicles/boss-list')
    if (res.data.ok) allBossList.value = res.data.data
  } catch { /* ignore */ }
})

async function searchBossList(search: string, limit: number, page: number) {
  let filtered = allBossList.value
  if (search) filtered = filtered.filter(b => b.toLowerCase().includes(search.toLowerCase()))
  const start = (page - 1) * limit
  return { ok: true, data: filtered.slice(start, start + limit).map(b => ({ name: b })), total: filtered.length }
}

// 筛选变化时重新加载
watch([filterCategory, filterType, filterBoss], () => {
  page.value = 1
  loadData()
})

const columns: ColumnDef<any>[] = [
  { accessorKey: 'name', header: '车船号' },
  { accessorKey: 'veh_type', header: '类型' },
  { accessorKey: 'veh_category', header: '分类' },
  {
    accessorKey: 'boss',
    header: '承运单位',
    size: 240,
    cell: ({ row }) => {
      const boss = row.original.boss as string
      if (!boss) return ''
      const tags = boss.split(/[,，]/).map(s => s.trim()).filter(Boolean)
      return h('div', { class: 'flex flex-wrap gap-1 max-w-[240px]' },
        tags.map(tag => h(Badge, { variant: 'outline', class: 'bg-muted' }, () => tag)),
      )
    },
  },
  {
    id: 'contact',
    header: '联系人',
    cell: ({ row }) => h('div', [
      h('div', row.original.contact_name || ''),
      h('div', { class: 'text-xs text-muted-foreground' }, row.original.phone || ''),
    ]),
  },
  {
    id: 'actions',
    meta: { fixedWidth: '120px' },
    header: () => h('div', { class: 'text-center' }, '操作'),
    cell: ({ row }) => h('div', { class: 'flex items-center justify-end gap-2' }, [
      h(Button, {
        variant: 'outline',
        size: 'sm',
        class: 'h-8 px-2',
        onClick: () => openEdit(row.original),
      }, () => [h(Pencil, { class: 'size-3.5 mr-1' }), '修改']),
      h(Button, {
        variant: 'destructive',
        size: 'sm',
        class: 'h-8 px-2',
        onClick: () => handleDelete(row.original),
      }, () => [h(Trash2, { class: 'size-3.5 mr-1' }), '删除']),
    ]),
  },
]
</script>

<template>
  <DataDictPage
    title="车船号"
    :data="data"
    :columns="columns"
    :loading="loading"
    :total="total"
    :page="page"
    :limit="limit"
    @update:page="onPageChange"
    @refresh="loadData"
    @add="openAdd"
  >
    <template #filter>
      <div class="flex items-center gap-2 mr-2 flex-wrap">
        <Input v-model="searchTerm" placeholder="搜索车船号..." class="w-40" />
        <UiSelect v-model="filterCategory">
          <UiSelectTrigger class="w-24">
            <UiSelectValue placeholder="分类" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="all">全部分类</UiSelectItem>
            <UiSelectItem value="自有">自有</UiSelectItem>
            <UiSelectItem value="外挂">外挂</UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <UiSelect v-model="filterType">
          <UiSelectTrigger class="w-24">
            <UiSelectValue placeholder="类型" />
          </UiSelectTrigger>
          <UiSelectContent>
            <UiSelectItem value="all">全部类型</UiSelectItem>
            <UiSelectItem value="车">车</UiSelectItem>
            <UiSelectItem value="船">船</UiSelectItem>
          </UiSelectContent>
        </UiSelect>
        <SearchableCombobox
          v-model="filterBoss"
          :search-fn="searchBossList"
          placeholder="承运单位"
          class="w-36"
        />
      </div>
    </template>

    <template #mobile-card="{ item }">
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>
            {{ item.name }}
            <Badge v-if="item.veh_type" variant="outline" class="text-[10px]">{{ item.veh_type }}</Badge>
            <Badge v-if="item.veh_category" variant="secondary" class="text-[10px]">{{ item.veh_category }}</Badge>
          </ItemTitle>
          <ItemDescription v-if="item.contact_name || item.phone">
            {{ item.contact_name }}<span v-if="item.phone" class="ml-1">{{ item.phone }}</span>
          </ItemDescription>
          <ItemFooter v-if="item.boss" class="pt-1">
            <div class="flex flex-wrap gap-1">
              <Badge v-for="tag in item.boss.split(/[,，]/).map((s: string) => s.trim()).filter(Boolean)" :key="tag" variant="outline" class="bg-muted text-[10px]">{{ tag }}</Badge>
            </div>
          </ItemFooter>
        </ItemContent>
        <div class="flex items-center gap-1 shrink-0 self-start">
          <Button variant="ghost" size="icon" class="size-7" @click="openEdit(item)">
            <Pencil class="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon" class="size-7 text-destructive" @click="handleDelete(item)">
            <Trash2 class="size-3.5" />
          </Button>
        </div>
      </Item>
    </template>

    <template #dialog>
      <component :is="Modal.Root" v-model:open="dialogOpen">
        <component :is="Modal.Content" class="max-h-[90vh] overflow-y-auto w-[95vw] sm:w-[50vw] sm:max-w-[50vw]">
          <VehicleDialog
            v-if="dialogOpen"
            :item="editingItem"
            @close="dialogOpen = false"
            @refresh="loadData"
          />
        </component>
      </component>
    </template>
  </DataDictPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
