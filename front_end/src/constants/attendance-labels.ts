import type { AttendanceRequestKind } from '@/services/api/attendance.api'

/** 考勤申请类型的展示名；申请/审批列表与顶部面包屑共用同一份。 */
export const attendanceKindLabels: Record<AttendanceRequestKind, string> = {
  leave: '请假',
  overtime: '加班',
  fieldwork: '出差',
  appeal: '考勤申述',
}

/**
 * 考勤申述的类型（＝申述的是哪一类考勤异常）。
 * 取值与后端 utils/attendance-ledger-actual.js 的 APPEAL_TYPES、以及台账「导入考勤记录」的次数口径一致：
 * 前四类批准后会核减台账对应次数，旷工在台账里没有计数列，只作留痕。
 */
export const appealTypeLabels: Record<string, string> = {
  lateWithin10: '迟到（10 分钟以内）',
  lateOver10: '迟到（10 分钟以上）',
  earlyLeave: '早退',
  noClockRecord: '无打卡记录',
  absence: '旷工',
}

export function appealLabel(type?: string | null) {
  return type ? appealTypeLabels[type] ?? type : ''
}

/** 请假类型的展示名；台账、工资条明细等考勤相关界面共用同一份口径。 */
export const leaveTypeLabels: Record<string, string> = {
  personal: '事假', sick: '病假', annual: '年假', marriage: '婚假', maternity: '产假',
  paternity: '陪产假', bereavement: '丧假', parental: '育儿假', compensatory: '调休', other: '其他',
}

/** 审批环节的展示名；申请详情时间线与审批列表共用同一份。 */
export const approvalRoleLabels: Record<string, string> = {
  manager: '直属经理',
  general_manager: '总经理',
  general_manager_delegate: '代理审批人',
}

/** 需要单独列出来的请假类型顺序（其余类型合并展示）。 */
export const keyLeaveTypes = ['personal', 'sick', 'annual'] as const

export function leaveLabel(type: string) {
  return leaveTypeLabels[type] ?? type
}
