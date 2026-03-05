<script setup lang="ts">
import { FileSpreadsheet, Plus } from 'lucide-vue-next'
import { useRouter } from 'vue-router'

import { BasicPage } from '@/components/global-layout'

const router = useRouter()
</script>

<template>
  <BasicPage title="板材数据处理" description="板材数据处理记录">
    <template #actions>
      <UiButton size="sm" @click="router.push('/data-process/plate-create')">
        <Plus class="w-4 h-4 sm:mr-1" />
        <span>新建</span>
      </UiButton>
    </template>

    <div class="border rounded-lg p-12 text-center">
      <FileSpreadsheet class="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
      <p class="text-muted-foreground mb-4">
        板材数据处理暂不支持保存，请点击"新建"开始处理
      </p>
      <UiButton @click="router.push('/data-process/plate-create')">
        <Plus class="w-4 h-4 mr-1" />
        新建处理
      </UiButton>
    </div>
  </BasicPage>
</template>

<route lang="yaml">
meta:
  auth: true
</route>
