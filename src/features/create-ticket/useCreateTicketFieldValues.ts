import { ref } from 'vue'
import type { JiraCreateFieldValue } from '@/types/jira'

export function useCreateTicketFieldValues() {
  const fieldValues = ref<Record<string, JiraCreateFieldValue>>({})

  function updateFieldValue(key: string, value: string) {
    fieldValues.value = {
      ...fieldValues.value,
      [key]: value,
    }
  }

  function getTextValue(key: string): string {
    const value = fieldValues.value[key]
    return typeof value === 'string' ? value : ''
  }

  function getInputValue(event: Event): string {
    const target = event.target
    if (
      target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement
    ) {
      return target.value
    }

    return ''
  }

  return {
    fieldValues,
    getInputValue,
    getTextValue,
    updateFieldValue,
  }
}
