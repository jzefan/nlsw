<script setup lang="ts">
import { Truck } from 'lucide-vue-next'
import { SYSTEM_NAME } from '@/config/constants'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const title = computed(() =>
  authStore.isStandalone ? authStore.standaloneSystemTitle : SYSTEM_NAME,
)
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <!-- 蓝色圆形图标 -->
    <div class="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center">
      <Truck class="w-10 h-10 text-white" />
    </div>
    <!-- 系统标题 -->
    <h1 class="text-2xl font-bold text-foreground">
      {{ title }}
    </h1>
  </div>
</template>
