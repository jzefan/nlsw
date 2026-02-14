<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import * as z from 'zod'

import type { DrayageForklift } from '@/services/api/financial.api'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { getDrayageForkliftByMonth, upsertDrayageForklift } from '@/services/api/financial.api'

const props = defineProps<{
  open: boolean
  editData?: DrayageForklift | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'success'): void
}>()

const formSchema = toTypedSchema(z.object({
  month: z.string().min(1, '请选择月份'),
  drayage: z.number({ coerce: true }).min(0, '请输入有效的金额'),
  forklift: z.number({ coerce: true }).min(0, '请输入有效的金额'),
}))

const { handleSubmit, resetForm, setValues } = useForm({
  validationSchema: formSchema,
  initialValues: {
    month: '',
    drayage: 0,
    forklift: 0,
  },
})

const isEdit = ref(false)

watch(() => props.open, (newVal) => {
  if (newVal) {
    if (props.editData) {
      isEdit.value = true
      setValues({
        month: props.editData.month,
        drayage: props.editData.drayage,
        forklift: props.editData.forklift,
      })
    }
    else {
      isEdit.value = false
      resetForm()
      // Default to current month
      const now = new Date()
      const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      setValues({ month: monthStr, drayage: 0, forklift: 0 })
    }
  }
})

// Check if month exists when adding
async function checkMonthExists(month: string) {
  if (isEdit.value && month === props.editData?.month)
    return false

  try {
    const res = await getDrayageForkliftByMonth(month)
    return res.ok && !!res.data
  }
  catch {
    return false
  }
}

const onSubmit = handleSubmit(async (values) => {
  try {
    if (!isEdit.value) {
      const exists = await checkMonthExists(values.month)
      if (exists) {
        toast.error(`记录已存在！月份: ${values.month}`)
        return
      }
    }

    const res = await upsertDrayageForklift(values)
    if (res.ok) {
      toast.success(isEdit.value ? '更新成功' : '添加成功')
      emit('update:open', false)
      emit('success')
    }
    else {
      toast.error('操作失败')
    }
  }
  catch (error: any) {
    toast.error('操作失败', { description: error.message })
  }
})
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ isEdit ? '修改' : '新增' }}短驳叉车应收款</DialogTitle>
        <DialogDescription>
          请输入月份及对应的应收款金额。
        </DialogDescription>
      </DialogHeader>

      <form class="space-y-4 py-4" @submit="onSubmit">
        <FormField v-slot="{ componentField }" name="month">
          <FormItem>
            <FormLabel>月份</FormLabel>
            <FormControl>
              <Input type="month" v-bind="componentField" :disabled="isEdit" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="drayage">
          <FormItem>
            <FormLabel>短驳应收款</FormLabel>
            <FormControl>
              <Input type="number" step="0.01" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <FormField v-slot="{ componentField }" name="forklift">
          <FormItem>
            <FormLabel>叉车应收款</FormLabel>
            <FormControl>
              <Input type="number" step="0.01" v-bind="componentField" />
            </FormControl>
            <FormMessage />
          </FormItem>
        </FormField>

        <DialogFooter>
          <Button type="button" variant="secondary" @click="$emit('update:open', false)">
            取消
          </Button>
          <Button type="submit">
            确定
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
