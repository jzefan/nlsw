<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { Pencil, Trash2 } from 'lucide-vue-next'
import { h } from 'vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { addWarehouse, deleteWarehouse, getWarehouses, updateWarehouse } from '@/services/api/data-dict.api'

import BaseContactDialog from './components/BaseContactDialog.vue'
import DataDictPage from './components/DataDictPage.vue'
import { useDataDict } from './composables/use-data-dict'

const {
  data, loading, total, page, limit, searchTerm,
  Modal, dialogOpen, editingItem,
  loadData, openAdd, openEdit, handleDelete, onPageChange,
} = useDataDict({
  getList: getWarehouses,
  delete: deleteWarehouse,
})

const columns: ColumnDef<any>[] = [
  { accessorKey: 'name', header: '仓库名称' },
  {
    id: 'contact',
    header: '联系信息',
    cell: ({ row }) => h('div', [
      h('div', [
        row.original.contact_name || '',
        row.original.phone ? h('span', { class: 'text-xs text-muted-foreground ml-2' }, row.original.phone) : null,
      ]),
      row.original.address ? h('div', { class: 'text-xs text-muted-foreground' }, row.original.address) : null,
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
    title="仓库"
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
      <div class="flex items-center gap-2 mr-2">
        <Input v-model="searchTerm" placeholder="搜索仓库..." class="flex-1 min-w-0 sm:w-64 sm:flex-initial" />
      </div>
    </template>

    <template #mobile-card="{ item }">
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>{{ item.name }}</ItemTitle>
          <ItemDescription v-if="item.contact_name || item.phone || item.address">
            <span v-if="item.contact_name || item.phone">{{ item.contact_name }}<span v-if="item.phone" class="ml-1">{{ item.phone }}</span></span>
            <span v-if="item.address" class="block">{{ item.address }}</span>
          </ItemDescription>
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
        <component :is="Modal.Content">
          <BaseContactDialog
            v-if="dialogOpen"
            :item="editingItem"
            title="仓库"
            :api-add="addWarehouse"
            :api-update="updateWarehouse"
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
