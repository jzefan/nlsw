<script setup lang="ts">
import { onMounted } from 'vue'

const router = useRouter()

/** 「考勤统计」已并入「考勤台账」的「统计汇总」视图；保留旧地址，避免历史书签与外部链接失效。 */
onMounted(() => {
  void router.replace('/attendance/ledger?view=stats')
})
</script>

<template>
  <div class="py-16 text-center text-sm text-muted-foreground">正在打开考勤台账…</div>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
