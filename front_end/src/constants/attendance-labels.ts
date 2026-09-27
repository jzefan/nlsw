/** 请假类型的展示名；台账、工资条明细等考勤相关界面共用同一份口径。 */
export const leaveTypeLabels: Record<string, string> = {
  personal: '事假', sick: '病假', annual: '年假', marriage: '婚假', maternity: '产假',
  paternity: '陪产假', bereavement: '丧假', parental: '育儿假', compensatory: '调休', other: '其他',
}

/** 需要单独列出来的请假类型顺序（其余类型合并展示）。 */
export const keyLeaveTypes = ['personal', 'sick', 'annual'] as const

export function leaveLabel(type: string) {
  return leaveTypeLabels[type] ?? type
}
