<script setup lang="ts">
import { X } from 'lucide-vue-next'

import { useSubscriptionReminder } from '@/composables/use-subscription-reminder'

const emit = defineEmits<{
  openPayment: []
}>()

const { showBanner, canDismissBanner, urgency, reminderText, dismissBanner } = useSubscriptionReminder()

// Force re-evaluate banner visibility after dismiss
const dismissed = ref(false)

function handleDismiss() {
  dismissBanner()
  dismissed.value = true
}

const visible = computed(() => {
  if (dismissed.value && canDismissBanner.value) return false
  return showBanner.value
})

const bannerClass = computed(() => {
  switch (urgency.value) {
    case 'high':
      return 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/50 dark:border-red-800 dark:text-red-200'
    case 'medium':
      return 'bg-orange-50 border-orange-200 text-orange-800 dark:bg-orange-950/50 dark:border-orange-800 dark:text-orange-200'
    default:
      return 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-200'
  }
})
</script>

<template>
  <div
    v-if="visible"
    :class="['flex items-center justify-between gap-2 px-4 py-1.5 text-xs border-b', bannerClass]"
  >
    <div class="flex items-center gap-2 flex-1 min-w-0">
      <span class="truncate">{{ reminderText }}</span>
      <button
        class="shrink-0 underline underline-offset-2 hover:opacity-80"
        @click="emit('openPayment')"
      >
        查看支付方式
      </button>
    </div>
    <button
      v-if="canDismissBanner"
      class="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"
      @click="handleDismiss"
    >
      <X class="w-3.5 h-3.5" />
    </button>
  </div>
</template>
