/**
 * 应用常量配置
 * 统一管理环境变量和常量
 */

export const APP_CONFIG = {
  // 公司名称
  companyName: import.meta.env.VITE_COMPANY_NAME || '军铁物流',

  // 公司全称
  companyFullName: import.meta.env.VITE_COMPANY_FULL_NAME || '南京军铁储运有限公司',

  // 系统名称
  systemName: import.meta.env.VITE_SYSTEM_NAME || '军铁物流系统',

  // API 基础 URL
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:1080',
} as const

// 导出单独的常量（可选，方便直接引用）
export const COMPANY_NAME = APP_CONFIG.companyName
export const COMPANY_FULL_NAME = APP_CONFIG.companyFullName
export const SYSTEM_NAME = APP_CONFIG.systemName
export const API_BASE_URL = APP_CONFIG.apiBaseUrl
