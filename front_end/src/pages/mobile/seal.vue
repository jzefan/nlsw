<script setup lang="ts">
import HubGroup from './components/hub-group.vue'
import HubShell from './components/hub-shell.vue'
import { useModuleHub } from './composables/use-module-hub'

const { sealGroups } = useModuleHub()
</script>

<template>
  <HubShell title="用章">
    <HubGroup
      v-for="group in sealGroups"
      :key="group.label ?? 'main'"
      :label="group.label"
      :items="group.items"
    />
  </HubShell>
</template>

<route lang="yaml">
meta:
  auth: true
  seal: true
</route>
