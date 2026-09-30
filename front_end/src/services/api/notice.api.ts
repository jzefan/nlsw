import { useAxios } from '@/composables/use-axios'

const { axiosInstance } = useAxios()

export interface NoticeItem {
  _id: string
  kind: 'seal_approved' | 'seal_returned' | 'seal_overdue' | 'seal_overdue_escalate' | 'general'
    | 'attendance_pending' | 'attendance_approved' | 'attendance_rejected' | string
  title: string
  body: string
  link?: string
  readAt?: string | null
  createdAt: string
  meta?: Record<string, unknown>
}

export interface NoticeResponse<T = unknown> {
  ok: boolean
  data?: T
  count?: number
  unreadCount?: number
  error?: string
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export async function getNotices(params: { unreadOnly?: boolean; page?: number; limit?: number } = {}) {
  const { data } = await axiosInstance.get<NoticeResponse<NoticeItem[]>>('/notices', { params })
  return data
}

export async function getUnreadNoticeCount() {
  const { data } = await axiosInstance.get<NoticeResponse>('/notices/unread-count')
  return data.count || 0
}

export async function markNoticeAsRead(id: string) {
  const { data } = await axiosInstance.post<NoticeResponse<NoticeItem>>(`/notices/${id}/read`)
  return data
}

export async function markAllNoticesAsRead() {
  const { data } = await axiosInstance.post<NoticeResponse>('/notices/read-all')
  return data
}
