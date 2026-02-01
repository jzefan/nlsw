<script lang="ts" setup>
import { toast } from 'vue-sonner'

import { BasicPage } from '@/components/global-layout'
import { Button } from '@/components/ui/button'

import OverviewContent from './components/overview-content.vue'
</script>

<route lang="yaml">
meta:
  auth: true
</route>

<template>
  <BasicPage
    title="工作台"
    description="欢迎使用物流管理系统"
    sticky
  >
    <OverviewContent />
  </BasicPage>
</template>
