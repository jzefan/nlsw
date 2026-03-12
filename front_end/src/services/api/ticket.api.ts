import type {
  DeleteSettleRequest,
  SettleRecord,
  TicketData,
  TicketFilterParams,
} from '@/pages/settle/ticket-types'

import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

// 获取结算列表
export async function getSettleList(params: Partial<TicketFilterParams>) {
  const response = await axiosInstance.get<{
    ok: boolean
    settles: SettleRecord[]
  }>('/ticket/settles', { params })
  return response.data
}

// 开票/开票取消
export async function updateTicket(data: TicketData[]) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/ticket/update',
    data,
  )
  return response.data
}

// 删除结算
export async function deleteSettle(data: DeleteSettleRequest) {
  const response = await axiosInstance.post<{ ok: boolean, message?: string }>(
    '/ticket/delete',
    data,
  )
  return response.data
}

// 获取结算明细
export interface SettleDetailResponse {
  ok: boolean
  settle: SettleRecord
  bills: any[]
  settle_bills: any[]
  shipDateMap?: Record<string, string>
  message?: string
}

export async function getSettleDetail(serialNumber: string) {
  const response = await axiosInstance.get<SettleDetailResponse>('/ticket/detail', {
    params: { serial_number: serialNumber },
  })
  return response.data
}
