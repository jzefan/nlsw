import type { RouteRecordRaw } from 'vue-router'

import { createRouter, createWebHistory } from 'vue-router'
import { handleHotUpdate, routes } from 'vue-router/auto-routes'

import { createRouterGuard } from './guard'

// 布局组件映射
const layouts: Record<string, () => Promise<any>> = {
  default: () => import('@/layouts/default.vue'),
  blank: () => import('@/layouts/blank.vue'),
  marketing: () => import('@/layouts/marketing.vue'),
}

// 递归处理路由，为每个路由添加布局
function setupLayouts(routes: RouteRecordRaw[]): RouteRecordRaw[] {
  return routes.map((route) => {
    const layoutName = route.meta?.layout

    // 如果布局为 false，不包装布局，但仍需递归处理子路由
    if (layoutName === false || layoutName === 'false') {
      if (route.children) {
        route.children = setupLayouts(route.children)
      }
      return route
    }

    // 递归处理子路由
    if (route.children) {
      route.children = setupLayouts(route.children)
      // 有子路由的情况，不再包装（子路由会各自处理布局）
      return route
    }

    // 如果没有指定布局，使用默认布局包装
    if (layoutName === undefined) {
      const layoutComponent = layouts.default
      const { name, ...routeWithoutName } = route
      return {
        path: route.path,
        component: layoutComponent,
        children: [{ ...routeWithoutName, path: '', name }],
        meta: route.meta,
      }
    }

    // 如果指定了布局名称
    if (typeof layoutName === 'string' && layouts[layoutName]) {
      const layoutComponent = layouts[layoutName]
      const { name, ...routeWithoutName } = route
      return {
        path: route.path,
        component: layoutComponent,
        children: [{ ...routeWithoutName, path: '', name }],
        meta: route.meta,
      }
    }

    return route
  })
}

const router = createRouter({
  history: createWebHistory(),
  routes: setupLayouts(routes as RouteRecordRaw[]),

  scrollBehavior() {
    return { left: 0, top: 0, behavior: 'smooth' }
  },
})

createRouterGuard(router)

export default router

if (import.meta.hot) {
  handleHotUpdate(router)
}
