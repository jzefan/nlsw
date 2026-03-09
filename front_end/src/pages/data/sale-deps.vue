<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'

import { Pencil, Trash2 } from 'lucide-vue-next'
import { h } from 'vue'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Item, ItemContent, ItemTitle } from '@/components/ui/item'
import { addSaleDep, deleteSaleDep, getSaleDeps, updateSaleDep } from '@/services/api/data-dict.api'

import DataDictPage from './components/DataDictPage.vue'
import SimpleNameDialog from './components/SimpleNameDialog.vue'
import { useDataDict } from './composables/use-data-dict'

const {
  data, loading, total, page, limit, searchTerm,
  Modal, dialogOpen, editingItem,
  loadData, openAdd, openEdit, handleDelete, onPageChange,
} = useDataDict({
  getList: getSaleDeps,
  delete: deleteSaleDep,
})

const columns: ColumnDef<any>[] = [
  { accessorKey: 'name', header: '销售部门' },
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
    title="销售部门"
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
        <Input v-model="searchTerm" placeholder="搜索销售部门..." class="flex-1 min-w-0 sm:w-64 sm:flex-initial" />
      </div>
    </template>

    <template #mobile-card="{ item }">
      <Item variant="outline" size="sm">
        <ItemContent>
          <ItemTitle>{{ item.name }}</ItemTitle>
        </ItemContent>
        <div class="flex items-center gap-1 shrink-0">
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
          <SimpleNameDialog
            v-if="dialogOpen"
            :item="editingItem"
            title="销售部门"
            :api-add="addSaleDep"
            :api-update="updateSaleDep"
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
