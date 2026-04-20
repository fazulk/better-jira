import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  createTicketGithubPrLink,
  normalizeStoredTicketGithubPrLinks,
  normalizeTicketGithubPrUrl,
  normalizeTicketKey,
  type StoredTicketGithubPrLinks,
  type TicketGithubPrLink,
} from '../shared/ticketLinks'
import { getAppDataDir } from './runtimePaths'

const ticketLinksFilePath = resolve(getAppDataDir(), 'ticket-links.json')

function ensureTicketLinksDirectoryExists(): void {
  mkdirSync(dirname(ticketLinksFilePath), { recursive: true })
}

function writeTicketLinksFile(links: StoredTicketGithubPrLinks): void {
  ensureTicketLinksDirectoryExists()
  writeFileSync(ticketLinksFilePath, `${JSON.stringify(links, null, 2)}\n`, 'utf8')
}

function getTicketLinksState(): StoredTicketGithubPrLinks {
  if (!existsSync(ticketLinksFilePath)) {
    return {}
  }

  try {
    const rawLinks = readFileSync(ticketLinksFilePath, 'utf8')
    return normalizeStoredTicketGithubPrLinks(JSON.parse(rawLinks))
  } catch (error) {
    console.error('Failed to read ticket links file:', error)
    return {}
  }
}

function requireTicketKey(ticketKey: string): string {
  const normalizedTicketKey = normalizeTicketKey(ticketKey)
  if (!normalizedTicketKey) {
    throw new Error('Ticket key must be a valid Jira issue key.')
  }

  return normalizedTicketKey
}

export function getTicketGithubPrLink(ticketKey: string): TicketGithubPrLink {
  const normalizedTicketKey = requireTicketKey(ticketKey)
  const links = getTicketLinksState()

  return createTicketGithubPrLink(
    normalizedTicketKey,
    links[normalizedTicketKey]?.githubPrUrl ?? null,
  )
}

export function updateTicketGithubPrLink(ticketKey: string, githubPrUrl: unknown): TicketGithubPrLink {
  const normalizedTicketKey = requireTicketKey(ticketKey)
  const normalizedGithubPrUrl = normalizeTicketGithubPrUrl(githubPrUrl)
  const links = getTicketLinksState()

  if (normalizedGithubPrUrl) {
    links[normalizedTicketKey] = {
      githubPrUrl: normalizedGithubPrUrl,
    }
  } else {
    delete links[normalizedTicketKey]
  }

  writeTicketLinksFile(links)

  return createTicketGithubPrLink(normalizedTicketKey, normalizedGithubPrUrl)
}
