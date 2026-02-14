import type { DisplayMode, SettleRecord } from '@/pages/settle/ticket-types'

import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface GetMoneyListParams {
  display_mode: DisplayMode
  selfOwned: string
}

export interface GetMoneyListResponse {
  ok: boolean
  settles: SettleRecord[]
  message?: string
}

export interface UpdateMoneyData {
  _id: string
  return_money_date: Date
  return_person: string
  status: string
}

export interface UpdateMoneyRequest {
  settles: UpdateMoneyData[]
}

export interface UpdateMoneyResponse {
  ok: boolean
  message?: string
}

export interface RealPriceData {
  sno: string
  price: number
}

export interface RealPriceResponse {
  ok: boolean
  message?: string
}

/**
 * 获取回款列表
 */
export async function getMoneyList(params: GetMoneyListParams) {
  const response = await axiosInstance.get<GetMoneyListResponse>('/money/list', { params })
  return response.data
}

/**
 * 更新回款状态（回款或回款取消）
 */
export async function updateMoney(data: UpdateMoneyData[]) {
  const response = await axiosInstance.post<UpdateMoneyResponse>('/money/update', data)
  return response.data
}

/**
 * 更新实收价格
 */
export async function updateRealPrice(data: RealPriceData) {
  const response = await axiosInstance.post<RealPriceResponse>('/money/real-price', data)
  return response.data
}
