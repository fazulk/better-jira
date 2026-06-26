import { LOCAL_SPACE_KEY } from './localTickets'
import { normalizeSpaceKey } from './settingsNormalizers'

function escapeJqlStringValue(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export function buildEnabledSpaceSearchQuery(spaceKeys: readonly string[]): string | null {
  const normalizedSpaceKeys = [...new Set(
    spaceKeys
      .map(spaceKey => normalizeSpaceKey(spaceKey))
      .filter((spaceKey): spaceKey is string => spaceKey !== null && spaceKey !== LOCAL_SPACE_KEY),
  )]

  if (normalizedSpaceKeys.length === 0) {
    return null
  }

  const projectKeys = normalizedSpaceKeys
    .map(escapeJqlStringValue)
    .map(spaceKey => `"${spaceKey}"`)
    .join(', ')

  return `project in (${projectKeys}) ORDER BY updated DESC`
}

export function buildUpdatedSinceSearchQuery(baseQuery: string, updatedSince: Date): string {
  const queryWithoutOrder = baseQuery.replace(/\s+ORDER\s+BY\s+updated\s+DESC\s*$/i, '').trim()
  const elapsedMs = Math.max(0, Date.now() - updatedSince.getTime())
  const elapsedMinutes = Math.ceil(elapsedMs / 60_000)
  const overlapWindowMinutes = Math.max(1, elapsedMinutes + 1)
  const updatedSinceClause = `updated >= "-${overlapWindowMinutes}m"`
  return `${queryWithoutOrder} AND ${updatedSinceClause} ORDER BY updated DESC`
}
