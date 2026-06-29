import type { AppSpaceSetting } from '~/shared/settings'

export interface SpaceColorSwatch {
  value: string
  label: string
}

/** Curated swatches shown in the appearance picker color row. */
export const SPACE_COLOR_SWATCHES: SpaceColorSwatch[] = [
  { value: '#b8bcc8', label: 'Silver' },
  { value: '#8b909e', label: 'Slate' },
  { value: '#5e6ad2', label: 'Indigo' },
  { value: '#4aa3c4', label: 'Teal' },
  { value: '#4cb782', label: 'Green' },
  { value: '#e2c44e', label: 'Yellow' },
  { value: '#e09b54', label: 'Orange' },
  { value: '#e8b7c4', label: 'Pink' },
  { value: '#d65d5d', label: 'Red' },
]

export const DEFAULT_SPACE_COLOR = '#d65d5d'

export interface ResolvedSpaceAppearance {
  /** Lucide icon name without the `lucide:` prefix, or null when only the initial should render. */
  icon: string | null
  /** Hex color for the avatar background. */
  color: string
  /** Uppercase single-letter fallback shown when there is no icon. */
  initial: string
}

export function resolveSpaceAppearance(
  space: Pick<AppSpaceSetting, 'key' | 'name' | 'icon' | 'color'>,
): ResolvedSpaceAppearance {
  const label = space.name?.trim() || space.key
  return {
    icon: space.icon ?? null,
    color: space.color ?? DEFAULT_SPACE_COLOR,
    initial: (label.slice(0, 1) || '?').toUpperCase(),
  }
}
