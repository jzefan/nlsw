import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface SaveShipmentPayload {
  productType: 'round-steel' | 'plate'
  rows: {
    bundleNo: string
    orderNo: string
    orderItemNo: string
    quantity: number
    weight: number
    thickness: number
    width: number
    length: number
    brandNo: string
    fixedLength: number
    customerName: string
    loadingListNo: string
    vehicleNo: string
    contractNo: string
  }[]
}

export interface SaveShipmentResponse {
  ok: boolean
  data?: { batchId: string, count: number }
  error?: string
}

export interface ShipmentListParams {
  batchId?: string
  loadingListNo?: string
  orderNo?: string
  productType?: string
  page?: number
  limit?: number
}

export async function saveShipmentDetail(payload: SaveShipmentPayload): Promise<SaveShipmentResponse> {
  const response = await axiosInstance.post('/data-process/shipment/save', payload)
  return response.data
}

export async function getShipmentDetails(params: ShipmentListParams) {
  const response = await axiosInstance.get('/data-process/shipment/list', { params })
  return response.data
}
