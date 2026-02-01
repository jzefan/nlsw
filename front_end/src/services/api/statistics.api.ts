import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface StatisticsQueryParams {
  fName?: string[]
  fDate1: string // ISO string
  fDate2: string // ISO string
  fMonths?: string[]
}

export interface StatisticsData {
  name: string
  settledWDS: number
  notSettledWDS: number
  notNeedWDS: number
  settledWZT: number
  notSettledWZT: number
  notNeedWZT: number
  totalWeight: number
  totalPrice: number
  settledPDS: number
  notSettledPDS: number
  settledPZT: number
  notSettledPZT: number
}

export interface CustomerDetailData {
  order: string
  bill_no: string
  name: string
  veh_ves_name: string
  ship_to: string
  coll_price: string
  price: string
  tot_price: string
  send_num: number
  send_weight: string
  ship_date: string
  inv_no: string
  warehouse: string
  spec: string
  brand_no: string
  contract_no: string
}

export interface ChartDataPoint {
  month: string
  [key: string]: string | number
}

export async function getStatisticsData(params: StatisticsQueryParams) {
  const response = await axiosInstance.get<{ ok: boolean, names: string[], stat_data: StatisticsData[] }>('/statistics/customer/data', {
    params,
  })
  return response.data
}

export async function getCustomerDetail(params: StatisticsQueryParams) {
  return response.data
}

export interface DashboardStats {
  totalTonnage: number
  totalInvoiceTonnage: number
  totalPaymentTonnage: number
  billingNameCount: number
  monthlyTrend: { date: string, weight: number }[]
  top5BillingNames: { name: string, value: number }[]
  top5Vehicles: { name: string, value: number }[]
  allVehicles: { name: string, value: number }[]
}

export async function getDashboardStatistics(startDate?: string, endDate?: string) {
  const response = await axiosInstance.get<{ ok: boolean, data: DashboardStats }>('/statistics/dashboard', {
    params: { startDate, endDate },
  })
  return response.data
}
export async function getCustomerChartData(params: StatisticsQueryParams) {
  const response = await axiosInstance.get<{ ok: boolean, chart_data: ChartDataPoint[] }>('/statistics/customer/chart', {
    params,
  })
  return response.data
}