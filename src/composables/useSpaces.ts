export function normalizeStoredStringList(value: unknown, validValues?: string[]): string[] {
  const normalizedValues = new Set(validValues ?? [])

  if (!Array.isArray(value)) {
    if (typeof value !== 'string') {
      return []
    }

    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return []
    }

    if (validValues && !normalizedValues.has(normalizedValue)) {
      return []
    }

    return [normalizedValue]
  }

  const filteredValues = value.flatMap((entry) => {
    if (typeof entry !== 'string') {
      return []
    }

    const normalizedEntry = entry.trim()
    if (!normalizedEntry) {
      return []
    }

    if (validValues && !normalizedValues.has(normalizedEntry)) {
      return []
    }

    return [normalizedEntry]
  })

  return [...new Set(filteredValues)]
}
