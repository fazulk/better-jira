import type { LabelColors } from './settingsTypes'

export function normalizeSpaceKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toUpperCase()
  return normalizedValue.length > 0 ? normalizedValue : null
}

export function normalizeSpaceName(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeJiraValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAiValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeAiInstructionValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeLabelColorKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function normalizeLabelColorValue(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(normalizedValue) ? normalizedValue : null
}

export function normalizeLabelColors(value: unknown): LabelColors {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const recordValue: Record<string, unknown> = value
  const normalizedColors: LabelColors = {}

  for (const [label, color] of Object.entries(recordValue)) {
    const normalizedLabel = normalizeLabelColorKey(label)
    const normalizedColor = normalizeLabelColorValue(color)

    if (normalizedLabel && normalizedColor) {
      normalizedColors[normalizedLabel] = normalizedColor
    }
  }

  return normalizedColors
}

export function normalizeSpaceKeyList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }

  const normalizedValues = new Set<string>()

  for (const entry of value) {
    const normalizedEntry = normalizeSpaceKey(entry)
    if (normalizedEntry) {
      normalizedValues.add(normalizedEntry)
    }
  }

  return [...normalizedValues]
}

export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    if (typeof value !== 'string') {
      return []
    }

    const normalizedValue = value.trim()
    return normalizedValue.length > 0 ? [normalizedValue] : []
  }

  const normalizedValues = new Set<string>()

  for (const entry of value) {
    if (typeof entry !== 'string') {
      continue
    }

    const normalizedEntry = entry.trim()
    if (normalizedEntry.length > 0) {
      normalizedValues.add(normalizedEntry)
    }
  }

  return [...normalizedValues]
}

export function normalizeStringListRecord(value: unknown): Record<string, string[]> {
  if (typeof value !== 'object' || value === null) {
    return {}
  }

  const recordValue: Record<string, unknown> = value
  const normalizedRecord: Record<string, string[]> = {}

  for (const [key, entry] of Object.entries(recordValue)) {
    const normalizedKey = key.trim()
    if (!normalizedKey) {
      continue
    }

    const normalizedList = normalizeStringList(entry)
    if (normalizedList.length > 0) {
      normalizedRecord[normalizedKey] = normalizedList
    }
  }

  return normalizedRecord
}

export function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}
