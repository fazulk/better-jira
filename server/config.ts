import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(serverDir, '..')
const initialEnvKeys = new Set(Object.keys(process.env))

function stripWrappingQuotes(value: string): string {
  if (value.length < 2) {
    return value
  }

  const firstChar = value[0]
  const lastChar = value[value.length - 1]
  const isWrappedInDoubleQuotes = firstChar === '"' && lastChar === '"'
  const isWrappedInSingleQuotes = firstChar === '\'' && lastChar === '\''

  if (isWrappedInDoubleQuotes || isWrappedInSingleQuotes) {
    return value.slice(1, -1)
  }

  return value
}

function parseEnvFile(content: string): Record<string, string> {
  const parsed: Record<string, string> = {}
  const lines = content.split(/\r?\n/)

  for (const line of lines) {
    const trimmedLine = line.trim()
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue
    }

    const match = trimmedLine.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
    if (!match) {
      continue
    }

    const [, key, rawValue] = match
    parsed[key] = stripWrappingQuotes(rawValue.trim())
  }

  return parsed
}

function applyEnvFile(fileName: '.env.local'): void {
  const filePath = resolve(projectRoot, fileName)
  if (!existsSync(filePath)) {
    return
  }

  const parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (initialEnvKeys.has(key) || process.env[key] !== undefined) {
      continue
    }

    process.env[key] = value
  }
}

function getRequiredEnv(key: 'JIRA_BASE_URL' | 'JIRA_EMAIL' | 'JIRA_API_TOKEN'): string {
  const value = process.env[key]?.trim()
  if (!value) {
    throw new Error(`Missing ${key} in environment or .env.local`)
  }

  return value
}

function getPort(): number {
  const rawPort = process.env.PORT?.trim()
  const parsedPort = rawPort ? Number(rawPort) : NaN
  return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001
}

applyEnvFile('.env.local')

export const env = {
  JIRA_BASE_URL: getRequiredEnv('JIRA_BASE_URL'),
  JIRA_EMAIL: getRequiredEnv('JIRA_EMAIL'),
  JIRA_API_TOKEN: getRequiredEnv('JIRA_API_TOKEN'),
  JIRA_PROJECT_KEY: process.env.JIRA_PROJECT_KEY?.trim() || '',
  PORT: getPort(),
}
