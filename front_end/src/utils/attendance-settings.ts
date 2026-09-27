/**
 * 考勤设置页的三个视图。左侧菜单（app-sidebar）与页面内的可见性判定、地址参数
 * 都取自这里，避免出现「菜单能点、进了页面却说无权」。
 */
export type AttendanceSettingsView = 'people' | 'payroll' | 'calendar'

export interface AttendanceSettingsRoles {
  isOwner: boolean
  isAppAdmin: boolean
  attendanceRoles: string[]
  payrollRoles: string[]
}

export const ATTENDANCE_SETTINGS_VIEWS: { value: AttendanceSettingsView, label: string, url: string }[] = [
  { value: 'people', label: '员工资料', url: '/attendance/settings?tab=people' },
  { value: 'payroll', label: '薪资权限', url: '/attendance/settings?tab=payroll' },
  { value: 'calendar', label: '工作日历设置', url: '/attendance/settings?tab=calendar' },
]

/** 员工资料只有主账号能改；薪资权限给管理员与薪资总经理；工作日历给主账号与考勤管理员。 */
export function canViewAttendanceSettingsView(view: AttendanceSettingsView, roles: AttendanceSettingsRoles): boolean {
  if (roles.isOwner) return true
  if (view === 'people') return false
  if (view === 'payroll') return roles.isAppAdmin || roles.payrollRoles.includes('general_manager')
  return roles.attendanceRoles.includes('attendance_admin')
}

export function visibleAttendanceSettingsViews(roles: AttendanceSettingsRoles) {
  return ATTENDANCE_SETTINGS_VIEWS.filter(item => canViewAttendanceSettingsView(item.value, roles))
}

/** 能进设置页不等于有可配项（如只挂了考勤总经理角色），页面据此给引导而不是空白。 */
export function canSeeAttendanceSettings(roles: AttendanceSettingsRoles): boolean {
  return canViewAttendanceSettingsView('people', roles)
    || canViewAttendanceSettingsView('payroll', roles)
    || canViewAttendanceSettingsView('calendar', roles)
    || roles.attendanceRoles.includes('general_manager')
}
