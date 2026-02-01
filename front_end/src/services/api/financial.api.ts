import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface DrayageForklift {
  _id?: string
  month: string // YYYY-MM
  drayage: number
  forklift: number
}

export async function getDrayageForklifts() {
  const response = await axiosInstance.get<{ ok: boolean, data: DrayageForklift[] }>('/drayage_forklifts')
  return response.data
}

export async function getDrayageForkliftByMonth(month: string) {
  const response = await axiosInstance.get<{ ok: boolean, data: DrayageForklift }>(`/drayage_forklifts/${month}`)
  return response.data
}

export async function upsertDrayageForklift(data: DrayageForklift) {
  const response = await axiosInstance.post<{ ok: boolean }>('/drayage_forklifts', data)
  return response.data
}

export async function deleteDrayageForklift(month: string) {
  const response = await axiosInstance.delete<{ ok: boolean }>(`/drayage_forklifts/${month}`)
  return response.data
}
