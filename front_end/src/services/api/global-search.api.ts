import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export type GlobalSearchResultType = 'bill' | 'invoice' | 'none'

export interface GlobalBillSearchItem {
  type: 'bill'
  id: string
  bill_no: string
  order_no: string
  billing_name: string
  thickness: number
  width: number
  len: number
  weight: number
  total_weight: number
  create_date?: string | null
}

export interface GlobalInvoiceSearchItem {
  type: 'invoice'
  id: string
  waybill_no: string
  vehicle_vessel_name: string
  ship_name: string
  ship_to?: string
  ship_from?: string
  shipper?: string
  transport_type: '车运' | '船运'
  target_path: '/reports/invoice'
  total_number: number
  total_weight: number
  create_date?: string | null
  ship_date?: string | null
}

export type GlobalSearchItem = GlobalBillSearchItem | GlobalInvoiceSearchItem

export interface GlobalSearchResponse {
  ok: boolean
  resultType: GlobalSearchResultType
  items: GlobalSearchItem[]
  total: number
  page: number
  limit: number
  hasMore: boolean
  error?: string
}

export async function searchGlobalRecords(keyword: string, limit = 8, page = 1) {
  const response = await axiosInstance.get<GlobalSearchResponse>('/search/global', {
    params: {
      keyword,
      limit,
      page,
    },
  })
  return response.data
}
