/**
 * 考勤设置页的三个视图。左侧菜单（app-sidebar）与页面内的可见性判定、地址参数
 * 都取自这里，避免出现「菜单能点、进了页面却说无权」。
 */
export type AttendanceSettingsView = 'people' | 'payroll' | 'calendar'

export interface AttendanceSettingsRoles {
  /** 登录名 admin / owner / 一把手 —— 全模块全权（含员工资料、薪资权限、工作日历） */
  isFullPrivilege: boolean
  attendanceRoles: string[]
  payrollRoles: string[]
}

export const ATTENDANCE_SETTINGS_VIEWS: { value: AttendanceSettingsView, label: string, url: string }[] = [
  { value: 'people', label: '员工资料', url: '/attendance/settings?tab=people' },
  { value: 'payroll', label: '薪资权限', url: '/attendance/settings?tab=payroll' },
  { value: 'calendar', label: '工作日历设置', url: '/attendance/settings?tab=calendar' },
]

/**
 * 员工资料与薪资权限：仅全权身份（登录名 admin / owner / 总经理·董事长）；
 * 薪资总经理也可维护薪资权限。老业务的「管理」权限位（privilege admin）不在其中。
 *
 * 工作日历的**写入**后端只给全权身份与考勤管理员（`isMonthAdmin`），
 * 职务一把手是只读视角，所以 calendar 不给 isTopLeader。
 */
export function canViewAttendanceSettingsView(view: AttendanceSettingsView, roles: AttendanceSettingsRoles): boolean {
  if (view === 'calendar') {
    return roles.isFullPrivilege || roles.attendanceRoles.includes('attendance_admin')
  }
  if (roles.isFullPrivilege) return true
  if (view === 'payroll') return roles.payrollRoles.includes('general_manager')
  return false
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
