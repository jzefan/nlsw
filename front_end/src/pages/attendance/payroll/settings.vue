<script setup lang="ts">
import { computed, onMounted } from 'vue'

import PayrollStandardSettings from '@/pages/attendance/components/PayrollStandardSettings.vue'
import { useAuthStore } from '@/stores/auth'
import { canEditPayroll, canViewCompanyPayroll } from '@/utils/payroll'

const authStore = useAuthStore()
const router = useRouter()
/** 财务可编辑；总经理、董事长只读查看全公司薪资标准。 */
const canEdit = computed(() => canEditPayroll(authStore.user))
const canView = computed(() => canViewCompanyPayroll(authStore.user))

/** 原来「薪资设置」是「工资管理」的页签，直接进地址的普通员工仍然引导回自己的入口。 */
onMounted(() => {
  if (!canView.value) void router.replace('/attendance/payroll/my')
})
</script>

<template>
  <main class="space-y-4 p-4 md:p-0">
    <div>
      <h1 class="text-lg font-semibold">薪资设置</h1>
      <p class="mt-1 text-xs text-muted-foreground">{{ canEdit ? '维护固定项与社保公积金基数、比例，录入工资条时自动带出' : '薪资标准仅供授权人员查看' }}</p>
    </div>

    <div v-if="!canView" class="rounded-md border p-8 text-center text-sm text-muted-foreground">无权查看薪资设置</div>
    <PayrollStandardSettings v-else :can-edit="canEdit" />
  </main>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
