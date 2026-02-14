import type { AxiosError } from 'axios'

import axios from 'axios'

import env from '@/utils/env'

// 防止多个 401 响应同时触发重复跳转
let isRedirecting = false

// 创建一个单例 axios 实例
const axiosInstance = axios.create({
  baseURL: env.VITE_SERVER_API_URL + env.VITE_SERVER_API_PREFIX,
  timeout: env.VITE_SERVER_API_TIMEOUT,
  withCredentials: true, // 允许跨域携带 cookie，用于 session 认证
})

axiosInstance.interceptors.request.use((config) => {
  return config
}, (error) => {
  return Promise.reject(error)
})

axiosInstance.interceptors.response.use((response) => {
  return response
}, async (error: AxiosError) => {
  // 401 未认证错误处理（session 过期）
  if (error.response?.status === 401) {
    const url = error.config?.url || ''
    if (!url.includes('/login') && !url.includes('/me') && !isRedirecting) {
      isRedirecting = true

      // 懒加载 router 和 store，避免循环依赖
      const [{ default: router }, { useAuthStore }, { default: pinia }] = await Promise.all([
        import('@/router'),
        import('@/stores/auth'),
        import('@/plugins/pinia/setup'),
      ])

      const authStore = useAuthStore(pinia)
      authStore.clearUser()

      const currentPath = router.currentRoute.value.fullPath
      const redirect = currentPath.startsWith('/auth/') ? undefined : currentPath

      router.push({
        path: '/auth/sign-in',
        query: redirect ? { redirect } : undefined,
      }).finally(() => {
        isRedirecting = false
      })
    }
  }
  return Promise.reject(error)
})

export function useAxios() {
  return {
    axiosInstance,
  }
}
