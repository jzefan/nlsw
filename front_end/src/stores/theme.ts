import { defineStore } from 'pinia'
import { useDebounceFn } from '@vueuse/core'

import type { ContentLayout, Radius, Theme } from '@/constants/themes'
import { useAxios } from '@/composables/use-axios'

export const useThemeStore = defineStore('system-config', () => {
  const radius = ref(0.5)
  function setRadius(newRadius: Radius) {
    radius.value = newRadius
    debouncedSave()
  }
  const theme = ref<Theme>('zinc')
  function setTheme(newTheme: Theme) {
    theme.value = newTheme
    debouncedSave()
  }

  const contentLayout = ref<ContentLayout>('centered')
  function setContentLayout(newContentLayout: ContentLayout) {
    contentLayout.value = newContentLayout
    debouncedSave()
  }

  // 从服务器偏好初始化（仅当有有效值时覆盖）
  function hydrateFromServer(prefs: Record<string, unknown> | undefined) {
    if (!prefs) return
    if (prefs.theme && typeof prefs.theme === 'string') {
      theme.value = prefs.theme as Theme
    }
    if (typeof prefs.radius === 'number' && prefs.radius >= 0) {
      radius.value = prefs.radius as Radius
    }
    if (prefs.contentLayout && typeof prefs.contentLayout === 'string') {
      contentLayout.value = prefs.contentLayout as ContentLayout
    }
  }

  // debounce 1s 保存到服务端
  const debouncedSave = useDebounceFn(() => {
    const { axiosInstance } = useAxios()
    axiosInstance.post('/user/preferences', {
      theme: theme.value,
      radius: radius.value,
      contentLayout: contentLayout.value,
    }).catch(() => {
      // 静默失败，不影响前端体验
    })
  }, 1000)

  return {
    radius,
    setRadius,

    theme,
    setTheme,

    contentLayout,
    setContentLayout,

    hydrateFromServer,
  }
}, {
  persist: true,
})
