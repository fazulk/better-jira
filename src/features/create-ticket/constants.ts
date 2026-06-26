import type { HardcodedCreateFieldDefinition } from './types'

export const priorityConfig: Record<string, { bg: string }> = {
  Highest: { bg: 'bg-rose-400' },
  High: { bg: 'bg-orange-400' },
  Medium: { bg: 'bg-amber-400' },
  Low: { bg: 'bg-sky-400' },
  Lowest: { bg: 'bg-slate-400' },
}

export const avatarColors = [
  'bg-white/[0.045] text-slate-300 border-white/[0.08]',
  'bg-white/[0.035] text-slate-400 border-white/[0.08]',
  'bg-surface-3 text-slate-300 border-white/[0.08]',
]

export const HARDCODED_CREATE_FIELDS: HardcodedCreateFieldDefinition[] = [
  { key: 'summary', label: 'Title', required: true, type: 'text', defaultValue: '' },
  { key: 'description', label: 'Description', required: false, type: 'textarea', defaultValue: '' },
  { key: 'priority', label: 'Priority', required: false, type: 'single-select', defaultValue: '' },
  { key: 'assignee', label: 'Assignee', required: false, type: 'single-select', defaultValue: '' },
  { key: 'duedate', label: 'Due Date', required: false, type: 'date', defaultValue: '' },
]
