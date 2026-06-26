export type HardcodedCreateFieldKey = 'summary' | 'description' | 'assignee' | 'priority' | 'duedate'

interface HardcodedCreateFieldBase {
  key: HardcodedCreateFieldKey
  label: string
  required: boolean
}

interface HardcodedCreateTextFieldDefinition extends HardcodedCreateFieldBase {
  type: 'text' | 'textarea' | 'date'
  defaultValue?: string
}

interface HardcodedCreateSelectFieldDefinition extends HardcodedCreateFieldBase {
  type: 'single-select'
  defaultValue?: string
}

export type HardcodedCreateFieldDefinition
  = | HardcodedCreateTextFieldDefinition
    | HardcodedCreateSelectFieldDefinition

export interface CreateFieldOption {
  value: string
  label: string
}
