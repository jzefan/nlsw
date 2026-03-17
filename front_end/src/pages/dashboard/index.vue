<script lang="ts" setup>
import { useDevice } from '@/composables/use-device'
import { BasicPage } from '@/components/global-layout'

import OverviewContent from './components/overview-content.vue'
import DashboardMobile from './components/dashboard-mobile.vue'

const { isMobile } = useDevice()
</script>

<route lang="yaml">
meta:
  auth: true
</route>

<template>
  <!-- 移动端：完整独立页面 -->
  <DashboardMobile v-if="isMobile" />

  <!-- 桌面端：原有工作台 -->
  <BasicPage
    v-else
    title="工作台"
    description="欢迎使用物流管理系统"
    sticky
  >
    <OverviewContent />
  </BasicPage>
</template>
