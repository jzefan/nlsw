<script setup lang="ts">
import { checkPaymentQR, getPaymentQRUrl } from '@/services/api/order.api'

const open = defineModel<boolean>('open', { default: false })

const qrExists = ref(false)
const qrUrl = ref('')
const loading = ref(false)

watch(open, async (val) => {
  if (val) {
    loading.value = true
    try {
      const res = await checkPaymentQR()
      qrExists.value = res.exists
      if (res.exists) {
        qrUrl.value = `${getPaymentQRUrl()}?t=${Date.now()}`
      }
    }
    catch {
      qrExists.value = false
    }
    finally {
      loading.value = false
    }
  }
})
</script>

<template>
  <UiDialog v-model:open="open">
    <UiDialogContent class="sm:max-w-md">
      <UiDialogHeader>
        <UiDialogTitle>支付方式</UiDialogTitle>
        <UiDialogDescription>
          请使用微信或支付宝扫描下方二维码进行支付
        </UiDialogDescription>
      </UiDialogHeader>

      <div class="py-4">
        <div v-if="loading" class="text-center text-muted-foreground py-8">
          加载中...
        </div>
        <div v-else-if="qrExists" class="flex justify-center">
          <img
            :src="qrUrl"
            alt="收款二维码"
            class="max-w-[280px] max-h-[280px] rounded border"
          >
        </div>
        <div v-else class="text-center text-muted-foreground py-8">
          平台尚未设置收款二维码，请联系管理员。
        </div>
      </div>

      <UiDialogFooter>
        <UiButton variant="outline" @click="open = false">
          关闭
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
