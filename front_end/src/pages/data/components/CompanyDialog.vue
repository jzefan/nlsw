<script setup lang="ts">
import { toTypedSchema } from '@vee-validate/zod'
import { useForm } from 'vee-validate'
import { toast } from 'vue-sonner'
import * as z from 'zod'

import { FormField } from '@/components/ui/form'
import { useModal } from '@/composables/use-modal'
import { addCompany, updateCompany } from '@/services/api/data-dict.api'

const props = defineProps({
  item: {
    type: Object,
    required: false,
  },
})

const emit = defineEmits(['close', 'refresh'])

const { Modal } = useModal()

const formSchema = toTypedSchema(z.object({
  name: z.string().min(1, 'Name is required'),
  customers: z.string().optional(),
  contact_name: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
}))

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: formSchema,
  initialValues: {
    name: props.item?.name || '',
    customers: props.item?.customers?.join('\n') || '',
    contact_name: props.item?.contact_name || '',
    phone: props.item?.phone || '',
    address: props.item?.address || '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  try {
    const customers = values.customers?.split(/[\n,，]/).map(s => s.trim()).filter(Boolean) || []
    const data = { ...values, customers }

    if (props.item) {
      await updateCompany(data)
      toast.success('更新成功')
    }
    else {
      await addCompany(data)
      toast.success('添加成功')
    }
    emit('refresh')
    emit('close')
  }
  catch (e: any) {
    toast.error('操作失败', { description: e?.message || '未知错误' })
  }
})
</script>

<template>
  <component :is="Modal.Header">
    <component :is="Modal.Title">
      {{ item ? '修改发货单位' : '新增发货单位' }}
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

    <FormField v-slot="{ componentField }" name="customers">
      <UiFormItem>
        <UiFormLabel>现有货主 (每行一个)</UiFormLabel>
        <UiFormControl>
          <UiTextarea v-bind="componentField" rows="4" />
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
