import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'
import { getBasket, getPublicBaskets, saveBasket } from '@/services/api/settle.api'

export interface SettleBasketItem {
  _id: string
  send_num: number
  send_weight: number
  [key: string]: any
}

export interface SettleBasketOptions<T extends SettleBasketItem> {
  /** 篮类型 */
  basketType: 'vessel' | 'bill'
  /** 比较两个item是否相同的函数 */
  isSameItem: (item1: T, item2: T) => boolean
  /** 获取item价格的函数 */
  getPrice?: (item: T) => number
  /** 从所有items中刷新basket items的函数 */
  allItems?: () => T[]
}

export function useSettleBasket<T extends SettleBasketItem>(options: SettleBasketOptions<T>) {
  const { basketType, isSameItem, getPrice, allItems } = options

  // 结算篮状态
  const basketItems = ref<T[]>([]) as Ref<T[]>
  const showBasket = ref(false)
  const basketLoaded = ref(false)
  const isPublic = ref(false)

  // 公开篮状态（查看其他用户的公开篮）
  const publicItems = ref<T[]>([]) as Ref<T[]>
  const showPublicBaskets = ref(false)
  const publicBasketOwners = ref<Array<{ userId: string; count: number; updatedAt: string }>>([])

  // 飞行动画状态
  const basketButtonRef = ref<any>(null)
  const flyingItems = ref<{ id: string; x: number; y: number; targetX: number; targetY: number }[]>([])

  // 防抖保存
  let saveTimer: ReturnType<typeof setTimeout> | null = null

  function debouncedSave() {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveBasket(basketType, basketItems.value, isPublic.value).catch((err: any) => {
        console.error('自动保存结算篮失败:', err)
      })
    }, 500)
  }

  // 结算篮统计
  const basketStatistics = computed(() => {
    let totalNum = 0
    let totalWeight = 0
    let totalAmount = 0

    basketItems.value.forEach((item) => {
      totalNum += item.send_num || 0
      totalWeight += item.send_weight || 0
      if (getPrice) {
        const price = getPrice(item)
        if (price > 0) {
          totalAmount += price * item.send_weight
        }
      }
    })

    return {
      count: basketItems.value.length,
      totalNum,
      totalWeight,
      totalAmount,
    }
  })

  // 公开篮统计
  const publicStatistics = computed(() => {
    let totalNum = 0
    let totalWeight = 0
    let totalAmount = 0

    publicItems.value.forEach((item) => {
      totalNum += item.send_num || 0
      totalWeight += item.send_weight || 0
      if (getPrice) {
        const price = getPrice(item)
        if (price > 0) {
          totalAmount += price * item.send_weight
        }
      }
    })

    return {
      count: publicItems.value.length,
      totalNum,
      totalWeight,
      totalAmount,
    }
  })

  // 从服务器加载结算篮
  async function loadBasket() {
    try {
      const res = await getBasket(basketType)
      if (res.ok && res.data) {
        basketItems.value = res.data.items as T[]
        isPublic.value = res.data.isPublic
      }
    } catch (err: any) {
      console.error('加载结算篮失败:', err)
    } finally {
      basketLoaded.value = true
    }
  }

  // 加载其他用户的公开篮
  async function loadPublicBaskets() {
    try {
      const res = await getPublicBaskets(basketType)
      if (res.ok && res.data) {
        publicItems.value = res.data.items as T[]
        publicBasketOwners.value = res.data.baskets
      }
    } catch (err: any) {
      console.error('加载公开结算篮失败:', err)
    }
  }

  // 检查item是否在结算篮中
  function isInBasket(item: T): boolean {
    return basketItems.value.some((b) => isSameItem(b, item))
  }

  // 添加到结算篮（带动画）
  function addToBasket(selectedItems: T[]) {
    if (selectedItems.length === 0) {
      toast.warning('请先选择要添加到结算篮的提单')
      return false
    }

    // 检查是否有已在结算篮中的提单
    const newItems = selectedItems.filter((item) => !basketItems.value.some((b) => isSameItem(b, item)))

    if (newItems.length === 0) {
      toast.info('选中的提单已在结算篮中')
      return false
    }

    // 获取结算篮按钮位置并创建飞行动画
    const basketBtn = basketButtonRef.value?.$el || basketButtonRef.value
    if (basketBtn) {
      const btnRect = (basketBtn as HTMLElement).getBoundingClientRect()
      const targetX = btnRect.left + btnRect.width / 2
      const targetY = btnRect.top + btnRect.height / 2

      let selectedRows = document.querySelectorAll('tr.bg-blue-50')
      if (selectedRows.length === 0) {
        selectedRows = document.querySelectorAll('tr.bg-blue-100')
      }
      const maxAnimations = Math.min(selectedRows.length, 5)

      selectedRows.forEach((row, index) => {
        if (index >= maxAnimations) return
        const rowRect = row.getBoundingClientRect()
        const startX = rowRect.left + rowRect.width / 2
        const startY = rowRect.top + rowRect.height / 2

        flyingItems.value.push({
          id: `fly-${Date.now()}-${index}`,
          x: startX,
          y: startY,
          targetX,
          targetY,
        })
      })

      setTimeout(() => {
        flyingItems.value = []
      }, 600)
    }

    basketItems.value = [...basketItems.value, ...newItems]
    toast.success(`已添加 ${newItems.length} 条提单到结算篮`)
    debouncedSave()
    return true
  }

  // 从结算篮移除
  function removeFromBasket(item: T) {
    basketItems.value = basketItems.value.filter((b) => !isSameItem(b, item))
    debouncedSave()
  }

  // 清空结算篮
  function clearBasket() {
    basketItems.value = []
    toast.success('结算篮已清空')
    debouncedSave()
  }

  // 刷新结算篮中的数据（仅更新显示，不触发保存）
  function refreshBasketItems() {
    if (basketItems.value.length === 0 || !allItems) return

    const allItemsData = allItems()
    basketItems.value = basketItems.value.map((basketItem) => {
      const updatedItem = allItemsData.find((item) => isSameItem(item, basketItem))
      return updatedItem || basketItem
    })
  }

  // 切换公开状态
  function togglePublic(value: boolean) {
    isPublic.value = value
    debouncedSave()
    toast.success(value ? '结算篮已设为公开' : '结算篮已设为私有')
  }

  return {
    // State
    basketItems,
    showBasket,
    basketButtonRef,
    flyingItems,
    basketLoaded,
    isPublic,

    // 公开篮状态
    publicItems,
    showPublicBaskets,
    publicBasketOwners,

    // Computed
    basketStatistics,
    publicStatistics,

    // Methods
    isInBasket,
    addToBasket,
    removeFromBasket,
    clearBasket,
    refreshBasketItems,
    loadBasket,
    debouncedSave,
    togglePublic,
    loadPublicBaskets,
  }
}
