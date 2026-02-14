import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface VesselRevenueParams {
  fDate1: string
  fDate2: string
}

export interface VesselRevenueData {
  month: string
  vhTotal: number
  vhRevenue: number
  vhOwnWeight: number
  vhOwnIncome: number
  vhOwnDeposit: number
  vhOwnProfit: number
  vhNonOwnWeight: number
  vhNonOwnIncome: number
  vhNonOwnDeposit: number
  vhProfit: number
  vhFixedCost: number
  vsTotal: number
  vsRevenue: number
  vsOwnWeight: number
  vsOwnIncome: number
  vsOwnDeposit: number
  vsOwnProfit: number
  vsNonOwnWeight: number
  vsNonOwnIncome: number
  vsNonOwnDeposit: number
  vsProfit: number
  vsFixedCost: number
  drayage: number
  forklift: number
}

export interface VesselAllocationParams {
  fDate1: string
  fDate2: string
  fVehType: '自有' | '外挂'
  fSummary: 'YES' | 'NO'
}

export interface VesselSummaryItem {
  weight: number
  amount: number
  contact: string
}

export interface VesselDetailItem {
  name: string
  ship_from: string
  ship_to: string
  price: number
  single_price: number
  send_num: number
  send_weight: number
  ship_date: string
  charge_cash: number
  charge_oil: number
  delay_day: number
  advance_mode: string
  advance_charge: number
}

export async function getVesselRevenue(params: VesselRevenueParams) {
  const response = await axiosInstance.get<{ ok: boolean, stat_data: VesselRevenueData[] }>('/statistics/vessel/revenue', {
    params,
  })
  return response.data
}

export async function getVesselDetail(params: VesselAllocationParams) {
  const response = await axiosInstance.get<{
    ok: boolean
    summary_data?: Record<string, VesselSummaryItem>
    vessel_detail?: Record<string, VesselDetailItem[]>
    vehNameList?: string[]
  }>('/statistics/vessel/detail', {
    params,
  })
  return response.data
}
