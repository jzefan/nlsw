<script lang='ts' setup>
import { FolderOpenIcon } from 'lucide-vue-next'

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
</script>

<template>
  <Empty>
    <EmptyHeader>
      <EmptyMedia variant="icon">
        <FolderOpenIcon />
      </EmptyMedia>
      <EmptyTitle>未找到结果</EmptyTitle>
      <EmptyDescription>
        请尝试使用不同的搜索词或检查拼写是否正确。
      </EmptyDescription>
    </EmptyHeader>
  </Empty>
</template>
