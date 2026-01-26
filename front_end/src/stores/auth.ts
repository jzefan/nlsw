import { defineStore } from 'pinia'

export interface User {
  userid: string
  name: string
  title?: string
  privilege: string
}

export const useAuthStore = defineStore('user', () => {
  const isLogin = ref(false)
  const user = ref<User | null>(null)

  function setUser(userData: User | null) {
    user.value = userData
    isLogin.value = !!userData
  }

  function clearUser() {
    user.value = null
    isLogin.value = false
  }

  return {
    isLogin,
    user,
    setUser,
    clearUser,
  }
})
