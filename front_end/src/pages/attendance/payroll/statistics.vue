<script setup lang="ts">
import { computed, onMounted } from 'vue'

import PayrollStatistics from '@/pages/attendance/components/PayrollStatistics.vue'
import { useAuthStore } from '@/stores/auth'
import { canViewCompanyPayroll } from '@/utils/payroll'

const authStore = useAuthStore()
const router = useRouter()
const canView = computed(() => canViewCompanyPayroll(authStore.user))

/** 薪资统计只面向有全公司薪资权限的账号，其他人引导回自己的工资条。 */
onMounted(() => {
  if (!canView.value) void router.replace('/attendance/payroll/my')
})
</script>

<template>
  <main class="space-y-4 p-4 md:p-0">
    <h1 class="text-lg font-semibold">薪资统计</h1>

    <div v-if="!canView" class="rounded-md border p-8 text-center text-sm text-muted-foreground">无权查看薪资统计</div>
    <PayrollStatistics v-else />
  </main>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
