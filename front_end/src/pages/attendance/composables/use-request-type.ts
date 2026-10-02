import type { AttendanceRequestKind } from '@/services/api/attendance.api'

const KIND_OPTIONS: AttendanceRequestKind[] = ['leave', 'overtime', 'fieldwork', 'appeal']

/**
 * 侧栏把「我的申请」「待我审批」按类型拆成请假/加班/出差/考勤申述四个入口，用 ?type= 区分。
 * 未带参数（旧书签、直接进地址）或参数非法时回落到「全部类型」，两个页面共用这一份口径。
 */
export function useAttendanceRequestType() {
  const route = useRoute()
  return computed<AttendanceRequestKind | ''>(() => {
    const value = String(route.query.type ?? '')
    return KIND_OPTIONS.includes(value as AttendanceRequestKind) ? value as AttendanceRequestKind : ''
  })
}
