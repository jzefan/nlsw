<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import * as z from 'zod'

import { FormField } from '@/components/ui/form'
import { useModal } from '@/composables/use-modal'

const props = defineProps<{
  item?: any
  title: string
  apiAdd: (data: any) => Promise<any>
  apiUpdate: (data: any) => Promise<any>
}>()

const emit = defineEmits(['close', 'refresh'])

const { Modal } = useModal()

const formSchema = toTypedSchema(z.object({
  name: z.string().min(1, 'Name is required'),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
}))

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: props.item?.name || '',
    contact_name: props.item?.contact_name || '',
    phone: props.item?.phone || '',
    address: props.item?.address || '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  try {
    if (props.item) {
      await props.apiUpdate(values)
      toast.success('更新成功')
    }
    else {
      await props.apiAdd(values)
      toast.success('添加成功')
    }
    emit('refresh')
    emit('close')
  }
  catch (e: any) {
    toast.error('操作失败', { description: e.message || '未知错误' })
  }
})
</script>

<template>
  <component :is="Modal.Header">
    <component :is="Modal.Title">
      {{ item ? '修改' : '新增' }}{{ title }}
    </component>
  </component>

  <form class="space-y-4 py-4" @submit="onSubmit">
    <FormField v-slot="{ componentField }" name="name">
      <UiFormItem>
        <UiFormLabel>名称</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" :disabled="!!item" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="contact_name">
      <UiFormItem>
        <UiFormLabel>联系人</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="phone">
      <UiFormItem>
        <UiFormLabel>电话</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="address">
      <UiFormItem>
        <UiFormLabel>地址</UiFormLabel>
        <UiFormControl>
          <UiInput v-bind="componentField" />
        </UiFormControl>
        <UiFormMessage />
      </UiFormItem>
    </FormField>

    <div class="flex justify-end gap-2">
      <UiButton type="button" variant="outline" @click="$emit('close')">
        取消
      </UiButton>
      <UiButton type="submit" :disabled="isSubmitting">
        保存
      </UiButton>
    </div>
  </form>
</template>
