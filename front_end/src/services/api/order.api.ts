import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

// ---- Types ----

export interface OrderItem {
  _id: string
  tenantId: string
  tenantName: string
  tenantCode: string
  orderNo: string
  plan: string
  amount: number
  startDate?: string
  endDate?: string
  status: 'pending' | 'paid' | 'cancelled' | 'refunded'
  paymentMethod: string
  paidAt?: string
  notes: string
  creator: string
  createDate: string
}

export interface CreateOrderData {
  tenantId: string
  plan?: string
  amount?: number
  startDate?: string
  endDate?: string
  status?: string
  paymentMethod?: string
  paidAt?: string
  notes?: string
}

export interface UpdateOrderData {
  orderId: string
  plan?: string
  amount?: number
  startDate?: string
  endDate?: string
  status?: string
  paymentMethod?: string
  paidAt?: string
  notes?: string
}

// ---- Order API ----

export async function getOrders(params?: { page?: number; limit?: number; tenantId?: string; status?: string }) {
  const response = await axiosInstance.get<{
    ok: boolean
    data: OrderItem[]
    total: number
    page: number
    totalPages: number
  }>('/platform/orders', { params })
  return response.data
}

export async function createOrder(data: CreateOrderData) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string; data?: OrderItem }>(
    '/platform/orders',
    data,
  )
  return response.data
}

export async function updateOrder(data: UpdateOrderData) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string; data?: OrderItem }>(
    '/platform/orders/update',
    data,
  )
  return response.data
}

export async function deleteOrder(orderId: string) {
  const response = await axiosInstance.post<{ ok: boolean; msg?: string }>(
    '/platform/orders/delete',
    { orderId },
  )
  return response.data
}

// ---- Payment QR API ----

export async function uploadPaymentQR(file: File) {
  const formData = new FormData()
  formData.append('qrImage', file)
  const response = await axiosInstance.post<{ ok: boolean; msg?: string }>(
    '/platform/payment-qr',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  )
  return response.data
}

export async function checkPaymentQR() {
  const response = await axiosInstance.get<{ ok: boolean; exists: boolean }>('/payment-qr/check')
  return response.data
}

export function getPaymentQRUrl() {
  return `${axiosInstance.defaults.baseURL}/payment-qr`
}
