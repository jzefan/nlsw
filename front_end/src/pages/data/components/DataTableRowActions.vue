<script setup lang="ts">
import { Ellipsis, Pencil, Trash2 } from 'lucide-vue-next'

const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'delete'): void
}>()
</script>

<template>
  <UiDropdownMenu>
    <UiDropdownMenuTrigger as-child>
      <UiButton
        variant="ghost"
        class="flex h-8 w-8 p-0 data-[state=open]:bg-muted"
      >
        <Ellipsis class="size-4" />
        <span class="sr-only">打开菜单</span>
      </UiButton>
    </UiDropdownMenuTrigger>
    <UiDropdownMenuContent align="end">
      <UiDropdownMenuItem @click="$emit('edit')">
        <Pencil class="mr-2 size-4" />
        修改
      </UiDropdownMenuItem>
      <UiDropdownMenuItem class="text-destructive focus:text-destructive" @click="$emit('delete')">
        <Trash2 class="mr-2 size-4" />
        删除
      </UiDropdownMenuItem>
    </UiDropdownMenuContent>
  </UiDropdownMenu>
</template>
