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
function setupLayouts(routes: RouteRecordRaw[], parentLayout?: string | boolean): RouteRecordRaw[] {
  return routes.map((route) => {
    const layoutName = (route.meta?.layout as string | boolean | undefined) ?? parentLayout

    // 如果布局为 false，不包装布局，但仍需递归处理子路由
    if (layoutName === false || layoutName === 'false') {
      if (route.children) {
        route.children = setupLayouts(route.children, false)
      }
      return route
    }

    // 递归处理子路由
    if (route.children) {
      route.children = setupLayouts(route.children, layoutName)
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

  // 路由切换后把「主内容区」滚回顶部。
  // 注意：侧栏与主内容区都是内部 overflow-auto 容器，而这里的 scrollBehavior 最终只会调用
  // window.scrollTo，够不到它们；真正的主内容回滚由 layouts/default.vue 里 watch(route.fullPath) 完成。
  // 不要给布局加 :key="route" 来「强制刷新」——那会把整个布局连侧栏一起重建，
  // 侧栏的滚动位置与折叠状态都会丢失（用户每点一次菜单都要从头找）。
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash }
    return { el: '[data-slot="sidebar-inset"]', top: 0, left: 0, behavior: 'smooth' }
  },
})

createRouterGuard(router)

export default router

if (import.meta.hot) {
  handleHotUpdate(router)
}
