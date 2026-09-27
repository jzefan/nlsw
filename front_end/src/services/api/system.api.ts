import { useAxios } from '@/composables/use-axios'

export interface ServerVersion {
  /** 进程启动后后端源码又被改过 → 当前进程跑的是旧代码，需要重启 */
  stale: boolean
  bootedAt: string
  newestSourceAt: string | null
  sourceFileCount: number
  checkedAt: string
}

export async function getServerVersion() {
  const { axiosInstance } = useAxios()
  const response = await axiosInstance.get<{ ok: boolean, data?: ServerVersion }>('/server-version')
  return response.data
}
