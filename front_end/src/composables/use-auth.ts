import { storeToRefs } from 'pinia'

import { useAuthStore } from '@/stores/auth'
import { useAxios } from '@/composables/use-axios'

export function useAuth() {
  const router = useRouter()
  const { axiosInstance } = useAxios()

  const authStore = useAuthStore()
  const { isLogin, user } = storeToRefs(authStore)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function logout() {
    try {
      await axiosInstance.get('/logout')
    }
    catch (e) {
      console.error('Logout error:', e)
    }
    finally {
      authStore.clearUser()
      router.push({ path: '/auth/sign-in' })
    }
  }

  function toHome() {
    router.push({ path: '/dashboard' })
  }

  async function login(userid: string, password: string) {
    loading.value = true
    error.value = null

    try {
      const response = await axiosInstance.post('/login', {
        userid,
        password,
      }, {
        headers: {
          'Accept': 'application/json',
        },
      })

      if (response.data.ok) {
        authStore.setUser(response.data.user)

        const redirect = router.currentRoute.value.query.redirect as string
        if (!redirect || redirect.startsWith('//')) {
          toHome()
        }
        else {
          router.push(redirect)
        }
      }
      else {
        error.value = response.data.msg || '登录失败'
      }
    }
    catch (e: any) {
      console.error('Login error:', e)
      error.value = e.response?.data?.msg || '网络错误，请稍后重试'
    }
    finally {
      loading.value = false
    }
  }

  // 检查当前登录状态（用于页面刷新时恢复状态）
  async function checkAuth() {
    try {
      const response = await axiosInstance.get('/me')
      if (response.data.ok) {
        authStore.setUser(response.data.user)
        return true
      }
    }
    catch (e) {
      authStore.clearUser()
    }
    return false
  }

  return {
    loading,
    error,
    user,
    isLogin,
    logout,
    login,
    checkAuth,
  }
}
