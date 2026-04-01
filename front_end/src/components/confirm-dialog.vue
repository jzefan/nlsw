<script lang='ts' setup>
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmDialogProps {
  isLoading?: boolean
  disabled?: boolean
  cancelButtonText?: string
  confirmButtonText?: string
  destructive?: boolean
}

const {
  isLoading = false,
  disabled = false,
  destructive = false,
  cancelButtonText = '取消',
  confirmButtonText = '确认',
} = defineProps<ConfirmDialogProps>()

const emits = defineEmits<{
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

const openModel = defineModel<boolean>('open', {
  default: false,
})

function handleConfirm() {
  emits('confirm')
  openModel.value = false
}

function handleCancel() {
  emits('cancel')
  openModel.value = false
}
</script>

<template>
  <AlertDialog v-model:open="openModel">
    <AlertDialogContent>
      <AlertDialogHeader class="text-start">
        <AlertDialogTitle>
          <slot name="title" />
        </AlertDialogTitle>
        <AlertDialogDescription as-child>
          <slot name="description" />
        </AlertDialogDescription>
      </AlertDialogHeader>

      <slot />

      <AlertDialogFooter>
        <AlertDialogCancel :disabled="isLoading" @click="handleCancel">
          {{ cancelButtonText }}
        </AlertDialogCancel>

        <UiButton
          :variant="destructive ? 'destructive' : 'default'"
          :disabled="disabled || isLoading"
          @click="handleConfirm"
        >
          {{ confirmButtonText }}
        </UiButton>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
