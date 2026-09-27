import { defineStore } from 'pinia'
import { ref } from 'vue'

import { getServerVersion } from '@/services/api/system.api'

/** 两次检查之间的最小间隔，避免切换标签页时反复请求 */
const CHECK_INTERVAL_MS = 30 * 1000

/**
 * 后端是否还在跑旧代码。
 * 后端启动时记录源码时间戳，之后有文件比启动时间新就说明改动没生效（node app.js 没有热加载）。
 */
export const useServerVersionStore = defineStore('server-version', () => {
  const stale = ref(false)
  const bootedAt = ref('')
  const newestSourceAt = ref('')
  const checked = ref(false)
  let lastCheckedAt = 0
  let pending: Promise<void> | null = null

  async function check(force = false) {
    if (pending) return pending
    if (!force && lastCheckedAt && Date.now() - lastCheckedAt < CHECK_INTERVAL_MS) return
    lastCheckedAt = Date.now()
    pending = (async () => {
      try {
        const response = await getServerVersion()
        if (response.ok === false) return
        stale.value = response.data?.stale === true
        bootedAt.value = String(response.data?.bootedAt ?? '')
        newestSourceAt.value = String(response.data?.newestSourceAt ?? '')
        checked.value = true
      }
      catch {
        // 后端不可达时不做判断，避免误报
      }
      finally {
        pending = null
      }
    })()
    return pending
  }

  return { stale, bootedAt, newestSourceAt, checked, check }
})
