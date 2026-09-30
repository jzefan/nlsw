import 'vue-router'

export {}

declare module 'vue-router' {
  interface RouteMeta {
    // if true, need user login
    auth?: boolean
    // if true, requires owner or platform user role
    requiresOwner?: boolean
    // if true, requires platform user role
    requiresPlatformUser?: boolean
    // if true, require the attendance module feature flag
    attendance?: boolean
    // layout name ('default' | 'blank' | 'marketing') or false for no layout
    layout?: string | boolean
  }
}
