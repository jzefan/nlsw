<script setup lang="ts">
import { useRouter } from 'vue-router'

import Loading from '@/components/loading.vue'

const router = useRouter()

// 等待组件挂载后再跳转，确保 auth guard 已完成检查
onMounted(() => {
  router.push('/dashboard')
})
</script>

<template>
  <div class="flex items-center justify-center w-screen h-screen">
    <Loading />
  </div>
</template>

<route lang="yaml">
meta:
  layout: false
  auth: true
</route>
