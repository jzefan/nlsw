import type { AxiosError } from 'axios'

import axios from 'axios'

import env from '@/utils/env'

// 创建一个单例 axios 实例
const axiosInstance = axios.create({
  baseURL: env.VITE_SERVER_API_URL + env.VITE_SERVER_API_PREFIX,
  timeout: env.VITE_SERVER_API_TIMEOUT,
  withCredentials: true, // 允许跨域携带 cookie，用于 session 认证
  paramsSerializer: {
    indexes: null, // 数组参数不带索引: fOrder=v1&fOrder=v2（避免 qs arrayLimit=20 导致超过20项被解析为对象）
  },
})

axiosInstance.interceptors.request.use((config) => {
  return config
}, (error) => {
  return Promise.reject(error)
})

axiosInstance.interceptors.response.use((response) => {
  return response
}, (error: AxiosError) => {
  // 401 未认证错误处理（session 过期或未登录）
  if (error.response?.status === 401) {
    const url = error.config?.url || ''
    if (!url.includes('/login') && !url.includes('/me')) {
      const currentPath = window.location.pathname + window.location.search
      const redirect = encodeURIComponent(currentPath)
      window.location.href = `/auth/sign-in?redirect=${redirect}&expired=1`
    }
  }
  return Promise.reject(error)
})

export function useAxios() {
  return {
    axiosInstance,
  }
}
