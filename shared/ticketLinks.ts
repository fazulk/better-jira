export interface TicketGithubPrLink {
  ticketKey: string
  githubPrUrl: string | null
}

export interface UpdateTicketGithubPrLinkInput {
  githubPrUrl: string | null
}

interface StoredTicketGithubPrLinkEntry {
  githubPrUrl: string
}

export type StoredTicketGithubPrLinks = Record<string, StoredTicketGithubPrLinkEntry>

const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/
const GITHUB_PR_PATH_PATTERN = /^\/[^/]+\/[^/]+\/pull\/\d+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeGithubPrUrlValue(value: string): string {
  const trimmedValue = value.trim()
  if (!trimmedValue) {
    return ''
  }

  let parsedUrl: URL
  try {
    parsedUrl = new URL(trimmedValue)
  } catch {
    throw new Error('GitHub PR URL must be a valid URL.')
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('GitHub PR URL must use https.')
  }

  if (parsedUrl.hostname !== 'github.com') {
    throw new Error('GitHub PR URL must use github.com.')
  }

  const normalizedPath = parsedUrl.pathname.replace(/\/+$/, '')
  if (!GITHUB_PR_PATH_PATTERN.test(normalizedPath)) {
    throw new Error('GitHub PR URL must point to a GitHub pull request.')
  }

  return `https://github.com${normalizedPath}`
}

export function normalizeTicketKey(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim().toUpperCase()
  return TICKET_KEY_PATTERN.test(normalizedValue) ? normalizedValue : null
}

export function normalizeTicketGithubPrUrl(value: unknown): string | null {
  if (value === null || typeof value === 'undefined') {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error('GitHub PR URL must be a string or null.')
  }

  const normalizedValue = normalizeGithubPrUrlValue(value)
  return normalizedValue || null
}

function normalizeStoredTicketGithubPrEntry(value: unknown): StoredTicketGithubPrLinkEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const rawGithubPrUrl = value.githubPrUrl
  if (typeof rawGithubPrUrl !== 'string') {
    return null
  }

  try {
    const normalizedGithubPrUrl = normalizeGithubPrUrlValue(rawGithubPrUrl)
    if (!normalizedGithubPrUrl) {
      return null
    }

    return {
      githubPrUrl: normalizedGithubPrUrl,
    }
  } catch {
    return null
  }
}

export function normalizeStoredTicketGithubPrLinks(value: unknown): StoredTicketGithubPrLinks {
  if (!isRecord(value)) {
    return {}
  }

  const normalizedLinks: StoredTicketGithubPrLinks = {}

  for (const [rawTicketKey, rawEntry] of Object.entries(value)) {
    const ticketKey = normalizeTicketKey(rawTicketKey)
    if (!ticketKey) {
      continue
    }

    const entry = normalizeStoredTicketGithubPrEntry(rawEntry)
    if (!entry) {
      continue
    }

    normalizedLinks[ticketKey] = entry
  }

  return normalizedLinks
}

export function createTicketGithubPrLink(ticketKey: string, githubPrUrl: string | null): TicketGithubPrLink {
  return {
    ticketKey,
    githubPrUrl,
  }
}
