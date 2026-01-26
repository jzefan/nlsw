import type { AxiosError } from 'axios'

import axios from 'axios'

import env from '@/utils/env'

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
}, (error: AxiosError) => {
  // 401 未认证错误处理
  if (error.response?.status === 401) {
    // 检查是否不是登录相关的请求
    const url = error.config?.url || ''
    if (!url.includes('/login') && !url.includes('/me')) {
      // 跳转到登录页面
      window.location.href = '/auth/sign-in'
    }
  }
  return Promise.reject(error)
})

export function useAxios() {
  return {
    axiosInstance,
  }
}
