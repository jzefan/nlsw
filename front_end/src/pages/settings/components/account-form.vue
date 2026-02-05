<script setup lang="ts">
import { toast } from 'vue-sonner'

import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

const loading = ref(false)
const password = ref('')
const confirmPassword = ref('')

// 密码验证
const passwordError = computed(() => {
  if (password.value && password.value.length < 2) {
    return '密码长度至少2位'
  }
  return ''
})

const confirmError = computed(() => {
  if (confirmPassword.value && confirmPassword.value !== password.value) {
    return '两次输入的密码不一致'
  }
  return ''
})

const canSubmit = computed(() => {
  return password.value.length >= 2
    && confirmPassword.value === password.value
    && !loading.value
})

async function handleSubmit() {
  if (!canSubmit.value)
    return

  loading.value = true
  try {
    const response = await axiosInstance.post('/account/password', {
      password: password.value,
      confirmPassword: confirmPassword.value,
    })

    if (response.data.ok !== false) {
      toast.success('密码修改成功')
      password.value = ''
      confirmPassword.value = ''
    }
    else {
      toast.error('密码修改失败', { description: response.data.msg })
    }
  }
  catch (e: any) {
    toast.error('密码修改失败', { description: e.message })
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div>
    <h3 class="text-lg font-medium">
      密码修改
    </h3>
    <p class="text-sm text-muted-foreground">
      修改您的账号密码
    </p>
  </div>
  <UiSeparator class="my-4" />
  <form class="space-y-6 max-w-md" @submit.prevent="handleSubmit">
    <div class="space-y-2">
      <label class="text-sm font-medium">新密码</label>
      <UiInput
        v-model="password"
        type="password"
        placeholder="请输入新密码"
      />
      <p v-if="passwordError" class="text-xs text-destructive">
        {{ passwordError }}
      </p>
    </div>

    <div class="space-y-2">
      <label class="text-sm font-medium">确认密码</label>
      <UiInput
        v-model="confirmPassword"
        type="password"
        placeholder="请再次输入新密码"
      />
      <p v-if="confirmError" class="text-xs text-destructive">
        {{ confirmError }}
      </p>
    </div>

    <UiButton type="submit" :disabled="!canSubmit">
      {{ loading ? '保存中...' : '修改密码' }}
    </UiButton>
  </form>
</template>
