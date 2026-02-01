import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface VesselFixedCost {
  _id?: string
  name: string
  ic: number
  hc: number
  pcc: number
  aux: number
  fittings: number
  repair: number
  annual_survey: number
  salary: number
  oil: number
  toll: number
  fine: number
  other: number
  total: number
  month: string // YYYY-MM
  vv_type: 'che' | 'chuan'
}

export interface VesselFixedCostQueryParams {
  name?: string
  startDate?: string
  endDate?: string
  type?: 'che' | 'chuan'
}

export async function getVesselFixedCosts(params?: VesselFixedCostQueryParams) {
  const response = await axiosInstance.get<{ ok: boolean, data: VesselFixedCost[] }>('/vessel_fixed_costs', { params })
  return response.data
}

export async function getVesselFixedCost(name: string, month: string) {
  const response = await axiosInstance.get<{ ok: boolean, data: VesselFixedCost }>('/vessel_fixed_costs/detail', { 
    params: { name, month } 
  })
  return response.data
}

export async function upsertVesselFixedCost(data: Partial<VesselFixedCost>) {
  const response = await axiosInstance.post<{ ok: boolean }>('/vessel_fixed_costs', data)
  return response.data
}

export async function deleteVesselFixedCost(name: string, month: string) {
  const response = await axiosInstance.post<{ ok: boolean }>('/vessel_fixed_costs/delete', { name, month })
  return response.data
}
