<script setup lang="ts">
import HubGroup from './components/hub-group.vue'
import HubShell from './components/hub-shell.vue'
import { useModuleHub } from './composables/use-module-hub'

const { attendanceGroups } = useModuleHub()

/** 考勤与工资是同一个后台开关下的两块内容，用胶囊按钮并列，页内不再互相跳转。 */
const tabs = [
  { label: '考勤', to: '/mobile/attendance' },
  { label: '工资', to: '/mobile/payroll' },
]
</script>

<template>
  <HubShell title="考勤与工资" :tabs="tabs" active-path="/mobile/attendance">
    <HubGroup
      v-for="group in attendanceGroups"
      :key="group.label ?? 'main'"
      :label="group.label"
      :items="group.items"
    />
  </HubShell>
</template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
