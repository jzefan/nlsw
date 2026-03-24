<script setup lang="ts">
import { toast } from 'vue-sonner'
import SettingsLayout from './components/settings-layout.vue'
import { getTenantSettings, updateTenantSettings } from '@/services/api/user.api'

const loading = ref(false)
const saving = ref(false)
const drayageRate = ref(0)

onMounted(async () => {
  loading.value = true
  try {
    const result = await getTenantSettings()
    if (result.ok) {
      drayageRate.value = result.settings?.drayageRate || 0
    }
  } catch (e: any) {
    toast.error('加载设置失败', { description: e.message })
  } finally {
    loading.value = false
  }
})

async function handleSubmit() {
  saving.value = true
  try {
    const result = await updateTenantSettings({ drayageRate: drayageRate.value })
    if (result.ok) {
      toast.success('设置已保存')
    } else {
      toast.error('保存失败', { description: result.message })
    }
  } catch (e: any) {
    toast.error('保存失败', { description: e.message })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <SettingsLayout>
    <div>
      <h3 class="text-lg font-medium">
        租户设置
      </h3>
      <p class="text-sm text-muted-foreground">
        管理租户的业务配置
      </p>
    </div>
    <UiSeparator class="my-4" />
    <form class="space-y-6 max-w-md" @submit.prevent="handleSubmit">
      <div class="space-y-2">
        <label class="text-sm font-medium">车运到船应收单价（元/吨）</label>
        <UiInput
          v-model.number="drayageRate"
          type="number"
          step="0.01"
          min="0"
          placeholder="0 表示使用原有计算逻辑"
          :disabled="loading"
        />
        <p class="text-xs text-muted-foreground">
          设置后，船运下内部车辆的应收将按此固定单价计算。设为 0 则使用原有逻辑。
        </p>
      </div>

      <UiButton type="submit" :disabled="loading || saving">
        {{ saving ? '保存中...' : '保存设置' }}
      </UiButton>
    </form>
  </SettingsLayout>
</template>
