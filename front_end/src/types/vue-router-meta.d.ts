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
  }
}
