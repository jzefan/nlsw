<script setup lang="ts">
import type { AttendanceRequestKind } from '@/services/api/attendance.api'

import RequestList from './components/RequestList.vue'

const route = useRoute()
const kindOptions: AttendanceRequestKind[] = ['leave', 'overtime', 'fieldwork']
// 侧栏「我的申请」下的请假/加班/外勤入口用 ?type= 区分；未带参数（如旧书签）时展示全部类型
const type = computed<AttendanceRequestKind | ''>(() => {
  const value = String(route.query.type ?? '')
  return kindOptions.includes(value as AttendanceRequestKind) ? value as AttendanceRequestKind : ''
})
</script>

<template><RequestList view="mine" :type="type" /></template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
