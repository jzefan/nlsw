<script setup lang="ts">
import ConfirmDialog from '@/components/confirm-dialog.vue'
import { useConfirmDialog } from '@/composables/use-confirm-dialog'

const { state, handleConfirm, handleCancel } = useConfirmDialog()
</script>

<template>
  <ConfirmDialog
    v-model:open="state.open"
    :confirm-button-text="state.confirmButtonText"
    :cancel-button-text="state.cancelButtonText"
    :destructive="state.destructive"
    @confirm="handleConfirm"
    @cancel="handleCancel"
  >
    <template #title>
      {{ state.title }}
    </template>
    <template #description>
      <p class="whitespace-pre-line">
        {{ state.description }}
      </p>
    </template>
  </ConfirmDialog>
</template>
