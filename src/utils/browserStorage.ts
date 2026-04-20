function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function readLocalStorageString(key: string): string | null {
  if (!canUseLocalStorage()) {
    return null
  }

  return window.localStorage.getItem(key)
}

export function readLocalStorageStringArray(key: string): string[] {
  const rawValue = readLocalStorageString(key)
  if (!rawValue) {
    return []
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue)
    if (!Array.isArray(parsedValue)) {
      return []
    }

    return parsedValue.flatMap((entry) => {
      if (typeof entry !== 'string') {
        return []
      }

      const normalizedEntry = entry.trim()
      return normalizedEntry ? [normalizedEntry] : []
    })
  } catch {
    return []
  }
}
