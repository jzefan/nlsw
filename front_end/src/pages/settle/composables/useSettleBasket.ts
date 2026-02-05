import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

export interface SettleBasketItem {
  _id: string
  send_num: number
  send_weight: number
  [key: string]: any
}

export interface SettleBasketOptions<T extends SettleBasketItem> {
  /**
   * 比较两个item是否相同的函数
   */
  isSameItem: (item1: T, item2: T) => boolean
  /**
   * 获取item价格的函数
   */
  getPrice?: (item: T) => number
  /**
   * 从所有items中刷新basket items的函数
   */
  allItems?: () => T[]
}

export function useSettleBasket<T extends SettleBasketItem>(
  options: SettleBasketOptions<T>,
) {
  const { isSameItem, getPrice, allItems } = options

  // 结算篮状态
  const basketItems = ref<T[]>([]) as Ref<T[]>
  const showBasket = ref(false)

  // 飞行动画状态
  const basketButtonRef = ref<any>(null)
  const flyingItems = ref<{ id: string, x: number, y: number, targetX: number, targetY: number }[]>([])

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

  // 检查item是否在结算篮中
  function isInBasket(item: T): boolean {
    return basketItems.value.some(b => isSameItem(b, item))
  }

  // 添加到结算篮（带动画）
  function addToBasket(selectedItems: T[]) {
    if (selectedItems.length === 0) {
      toast.warning('请先选择要添加到结算篮的提单')
      return false
    }

    // 检查是否有已在结算篮中的提单
    const newItems = selectedItems.filter(
      item => !basketItems.value.some(b => isSameItem(b, item)),
    )

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

      // 获取选中行的位置并创建飞行动画
      // 尝试两种选择器：bg-blue-50 (客户结算) 和 bg-blue-100 (车船结算)
      let selectedRows = document.querySelectorAll('tr.bg-blue-50')
      if (selectedRows.length === 0) {
        selectedRows = document.querySelectorAll('tr.bg-blue-100')
      }
      const maxAnimations = Math.min(selectedRows.length, 5)

      selectedRows.forEach((row, index) => {
        if (index >= maxAnimations)
          return
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

      // 动画结束后清理
      setTimeout(() => {
        flyingItems.value = []
      }, 600)
    }

    basketItems.value = [...basketItems.value, ...newItems]
    toast.success(`已添加 ${newItems.length} 条提单到结算篮`)
    return true
  }

  // 从结算篮移除
  function removeFromBasket(item: T) {
    basketItems.value = basketItems.value.filter(b => !isSameItem(b, item))
  }

  // 清空结算篮
  function clearBasket() {
    basketItems.value = []
    toast.success('结算篮已清空')
  }

  // 刷新结算篮中的数据
  function refreshBasketItems() {
    if (basketItems.value.length === 0 || !allItems)
      return

    const allItemsData = allItems()
    basketItems.value = basketItems.value.map((basketItem) => {
      const updatedItem = allItemsData.find(item => isSameItem(item, basketItem))
      return updatedItem || basketItem
    })
  }

  return {
    // State
    basketItems,
    showBasket,
    basketButtonRef,
    flyingItems,

    // Computed
    basketStatistics,

    // Methods
    isInBasket,
    addToBasket,
    removeFromBasket,
    clearBasket,
    refreshBasketItems,
  }
}
