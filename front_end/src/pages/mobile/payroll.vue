<script setup lang="ts">
import HubGroup from './components/hub-group.vue'
import HubShell from './components/hub-shell.vue'
import { useModuleHub } from './composables/use-module-hub'

const { payrollGroups } = useModuleHub()

const tabs = [
  { label: '考勤', to: '/mobile/attendance' },
  { label: '工资', to: '/mobile/payroll' },
]
</script>

<template>
  <HubShell title="考勤与工资" :tabs="tabs" active-path="/mobile/payroll">
    <HubGroup
      v-for="group in payrollGroups"
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
