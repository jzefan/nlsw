<script setup lang="ts">
import RequestList from './components/RequestList.vue'
</script>

<template><RequestList view="history" /></template>

<route lang="yaml">
meta:
  auth: true
  attendance: true
</route>
