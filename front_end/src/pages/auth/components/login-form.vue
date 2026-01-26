<script lang="ts" setup>
import { useAuth } from '@/composables/use-auth'

const { login, loading, error } = useAuth()

const userid = ref('')
const password = ref('')

async function handleLogin() {
  if (!userid.value || !password.value) {
    return
  }
  await login(userid.value, password.value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <UiCard class="w-full max-w-sm">
    <UiCardHeader>
      <UiCardTitle class="text-2xl">
        登录
      </UiCardTitle>
      <UiCardDescription>
        请输入用户名和密码登录系统
      </UiCardDescription>
    </UiCardHeader>
    <UiCardContent class="grid gap-4">
      <div v-if="error" class="text-sm text-red-500 bg-red-50 p-2 rounded">
        {{ error }}
      </div>

      <div class="grid gap-2">
        <UiLabel for="userid">
          用户名
        </UiLabel>
        <UiInput
          id="userid"
          v-model="userid"
          type="text"
          placeholder="请输入用户名"
          required
          @keydown="handleKeydown"
        />
      </div>
      <div class="grid gap-2">
        <UiLabel for="password">
          密码
        </UiLabel>
        <UiInput
          id="password"
          v-model="password"
          type="password"
          required
          placeholder="请输入密码"
          @keydown="handleKeydown"
        />
      </div>

      <UiButton class="w-full" :disabled="loading || !userid || !password" @click="handleLogin">
        <UiSpinner v-if="loading" class="mr-2" />
        {{ loading ? '登录中...' : '登录' }}
      </UiButton>
    </UiCardContent>
  </UiCard>
</template>
