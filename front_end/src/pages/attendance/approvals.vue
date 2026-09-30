<script setup lang="ts">
import RequestList from './components/RequestList.vue'
import { useAttendanceRequestType } from './composables/use-request-type'

// 侧栏「待我审批」下的请假/加班/出差入口用 ?type= 区分；未带参数（如旧书签）时展示全部类型
const type = useAttendanceRequestType()
</script>

<template><RequestList view="inbox" :type="type" /></template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
