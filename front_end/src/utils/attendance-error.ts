export const ATTENDANCE_CALENDAR_UNCONFIRMED = 'ATTENDANCE_CALENDAR_UNCONFIRMED'

export function unconfirmedCalendarMessage(error: unknown) {
  const value = error as { response?: { data?: { code?: unknown, error?: unknown } } }
  if (value?.response?.data?.code !== ATTENDANCE_CALENDAR_UNCONFIRMED) return ''
  return typeof value.response.data.error === 'string' ? value.response.data.error : '请先确认所选年份的工作日历'
}
