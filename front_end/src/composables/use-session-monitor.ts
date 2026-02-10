import { useAxios } from '@/composables/use-axios'
import { useAuthStore } from '@/stores/auth'

const SESSION_CHECK_INTERVAL = 5 * 60 * 1000 // 5 分钟

export function useSessionMonitor() {
  const router = useRouter()
  const authStore = useAuthStore()
  const { axiosInstance } = useAxios()

  let timer: ReturnType<typeof setInterval> | null = null

  async function checkSession() {
    if (!authStore.isLogin) return

    try {
      const response = await axiosInstance.get('/me')
      if (!response.data.ok) {
        handleSessionExpired()
      }
    }
    catch {
      handleSessionExpired()
    }
  }

  function handleSessionExpired() {
    if (!authStore.isLogin) return

    authStore.clearUser()

    const currentPath = router.currentRoute.value.fullPath
    if (currentPath.startsWith('/auth/')) return

    router.push({
      path: '/auth/sign-in',
      query: { redirect: currentPath, expired: '1' },
    })
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      checkSession()
    }
  }

  function start() {
    stop()
    timer = setInterval(checkSession, SESSION_CHECK_INTERVAL)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }

  onMounted(start)
  onUnmounted(stop)
}
