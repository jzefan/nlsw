<script lang="ts" setup>
import { useAuth } from '@/composables/use-auth'
import AuthTitle from './auth-title.vue'

const route = useRoute()
const { login, loading, error } = useAuth()

const isSessionExpired = computed(() => route.query.expired === '1')

const tenantCode = ref('')
const userid = ref('')
const password = ref('')

async function handleLogin() {
  if (!userid.value || !password.value) {
    return
  }
  await login(userid.value, password.value, tenantCode.value)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleLogin()
  }
}
</script>

<template>
  <UiCard class="w-full sm:w-[400px] p-4">
    <UiCardContent class="grid gap-6 pt-6">
      <!-- 图标和系统标题 -->
      <AuthTitle class="mb-4" />

      <div v-if="isSessionExpired && !error" class="text-sm text-amber-600 bg-amber-50 p-2 rounded">
        登录已过期，请重新登录
      </div>

      <div v-if="error" class="text-sm text-red-500 bg-red-50 p-2 rounded">
        {{ error }}
      </div>

      <div class="grid gap-2">
        <UiLabel for="tenantCode">
          公司代码
          <span class="text-xs text-gray-500">(平台管理员可留空)</span>
        </UiLabel>
        <UiInput
          id="tenantCode"
          v-model="tenantCode"
          type="text"
          placeholder="请输入公司代码"
          @keydown="handleKeydown"
          style="text-transform: uppercase"
        />
      </div>

      <div class="grid gap-2">
        <UiLabel for="userid"> 用户名 </UiLabel>
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

      <UiButton class="w-full my-4" :disabled="loading || !userid || !password" @click="handleLogin">
        <UiSpinner v-if="loading" class="mr-2" />
        {{ loading ? '登录中...' : '登录' }}
      </UiButton>
    </UiCardContent>
  </UiCard>
</template>
