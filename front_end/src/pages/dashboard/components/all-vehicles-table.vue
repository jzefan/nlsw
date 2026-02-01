<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'

const props = defineProps<{
  data: { name: string; value: number }[]
}>()

const currentPage = ref(1)
const pageSize = 10

const totalPages = computed(() => Math.ceil(props.data.length / pageSize))

const paginatedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  const end = start + pageSize
  return props.data.slice(start, end)
})

watch(() => props.data, () => {
  currentPage.value = 1
})

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}
</script>

<template>
  <Card class="col-span-1 lg:col-span-3 h-full flex flex-col">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <CardTitle>所有车船配发吨数</CardTitle>
      <div class="flex items-center space-x-2">
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          :disabled="currentPage === 1"
          @click="prevPage"
        >
          <ChevronLeft class="h-4 w-4" />
        </Button>
        <div class="text-sm text-muted-foreground">
          {{ currentPage }} / {{ totalPages || 1 }}
        </div>
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          :disabled="currentPage >= totalPages"
          @click="nextPage"
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
      </div>
    </CardHeader>
    <CardContent class="flex-1 overflow-hidden p-0">
      <div class="h-full overflow-y-auto px-6 pb-6">
        <Table>
          <TableHeader class="sticky top-0 bg-card z-10">
            <TableRow>
              <TableHead>车船名称</TableHead>
              <TableHead class="text-right">配发吨数</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="(item, index) in paginatedData" :key="index">
              <TableCell class="font-medium">{{ item.name }}</TableCell>
              <TableCell class="text-right">{{ item.value.toFixed(3) }} 吨</TableCell>
            </TableRow>
            <TableRow v-if="paginatedData.length === 0">
              <TableCell colspan="2" class="h-24 text-center">
                暂无数据
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </CardContent>
  </Card>
</template>
