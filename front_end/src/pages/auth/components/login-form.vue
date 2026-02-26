<script lang="ts" setup>
import { ArrowRightLeft } from 'lucide-vue-next'
import { useAuth } from '@/composables/use-auth'
import { useAuthStore } from '@/stores/auth'
import { useAxios } from '@/composables/use-axios'
import AuthTitle from './auth-title.vue'

const route = useRoute()
const { login, phoneLogin, loading, error } = useAuth()
const authStore = useAuthStore()
const { axiosInstance } = useAxios()

const isSessionExpired = computed(() => route.query.expired === '1')
const isStandalone = computed(() => authStore.isStandalone)

// 登录方式：username | phone（默认手机号登录）
const loginMethod = ref<'username' | 'phone'>('phone')

const tenantCode = ref('')
const userid = ref('')
const phone = ref('')
const password = ref('')

// Fetch deploy mode on mount
onMounted(async () => {
  try {
    const res = await axiosInstance.get('/deploy-info')
    if (res.data.deployMode) {
      authStore.setDeployMode(res.data.deployMode)
    }
    if (res.data.standaloneCompany) {
      authStore.setStandaloneCompany(res.data.standaloneCompany)
    }
  } catch (e) {
    // Default to saas if fetch fails
  }
})

async function handleLogin() {
  if (loginMethod.value === 'phone') {
    // 手机号登录
    if (!phone.value || !password.value) {
      return
    }
    await phoneLogin(phone.value, password.value)
  } else {
    // 用户名登录
    if (!userid.value || !password.value) {
      return
    }
    await login(userid.value, password.value, isStandalone.value ? '' : tenantCode.value)
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    handleLogin()
  }
}

// 切换登录方式时清空输入
watch(loginMethod, () => {
  userid.value = ''
  phone.value = ''
  password.value = ''
  tenantCode.value = ''
})
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

      <!-- 手机号登录表单 -->
      <template v-if="loginMethod === 'phone'">
        <div class="grid gap-2">
          <UiLabel for="phone">手机号</UiLabel>
          <UiInput
            id="phone"
            v-model="phone"
            type="tel"
            placeholder="请输入手机号"
            required
            @keydown="handleKeydown"
          />
        </div>
      </template>

      <!-- 用户名登录表单 -->
      <template v-if="loginMethod === 'username'">
        <div v-if="!isStandalone" class="grid gap-2">
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
          <UiLabel for="userid">用户名</UiLabel>
          <UiInput
            id="userid"
            v-model="userid"
            type="text"
            placeholder="请输入用户名"
            required
            @keydown="handleKeydown"
          />
        </div>
      </template>

      <!-- 密码 -->
      <div class="grid gap-2">
        <UiLabel for="password">密码</UiLabel>
        <UiInput
          id="password"
          v-model="password"
          type="password"
          required
          placeholder="请输入密码"
          @keydown="handleKeydown"
        />
      </div>

      <UiButton
        class="w-full mt-2"
        :disabled="loading || !password || (loginMethod === 'username' ? !userid : !phone)"
        @click="handleLogin"
      >
        <UiSpinner v-if="loading" class="mr-2" />
        {{ loading ? '登录中...' : '登录' }}
      </UiButton>

      <!-- 切换登录方式 -->
      <button
        v-if="!isStandalone"
        type="button"
        class="mx-auto flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary transition-colors"
        @click="loginMethod = loginMethod === 'phone' ? 'username' : 'phone'"
      >
        <ArrowRightLeft class="w-3.5 h-3.5" />
        {{ loginMethod === 'phone' ? '使用用户名登录' : '使用手机号登录' }}
      </button>
    </UiCardContent>
  </UiCard>
</template>
