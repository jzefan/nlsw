<script setup lang="ts">
import Loading from '@/components/loading.vue'
import { Toaster } from '@/components/ui/sonner'
import { useSessionMonitor } from '@/composables/use-session-monitor'
import { useSystemTheme } from '@/composables/use-system-theme'

useSystemTheme()
useSessionMonitor()
</script>

<template>
  <Toaster position="top-center" />

  <Suspense>
    <router-view v-slot="{ Component, route }">
      <component :is="Component" :key="route" />
    </router-view>

    <template #fallback>
      <Loading />
    </template>
  </Suspense>
</template>
