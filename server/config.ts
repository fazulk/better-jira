import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DEFAULT_AI_PROVIDER,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_CEREBRAS_MODEL,
  DEFAULT_OPENAI_MODEL,
  isAiProvider,
  type AiProvider,
} from '../shared/ai'
import { getExplicitEnvFilePath } from './runtimePaths'
import { getStoredAiSettings } from './settings'

const projectRoot = process.cwd()

const initialEnvKeys = new Set(Object.keys(process.env))
const ENV_FILE_KEYS_IGNORED_FOR_JIRA_SETUP = new Set([
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
  'JIRA_API_TOKEN',
])

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
    if (ENV_FILE_KEYS_IGNORED_FOR_JIRA_SETUP.has(key)) {
      continue
    }

    parsed[key] = stripWrappingQuotes(rawValue.trim())
  }

  return parsed
}

function applyEnvFile(fileName: '.env.local'): void {
  const candidatePaths = [
    getExplicitEnvFilePath(),
    resolve(projectRoot, fileName),
    resolve(projectRoot, 'env.local'),
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)

  for (const filePath of candidatePaths) {
    if (!existsSync(filePath)) {
      continue
    }

    const parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
    for (const [key, value] of Object.entries(parsed)) {
      if (initialEnvKeys.has(key) || process.env[key] !== undefined) {
        continue
      }

      process.env[key] = value
    }

    return
  }
}

function getPort(): number {
  const rawPort = process.env.PORT?.trim()
  const parsedPort = rawPort ? Number(rawPort) : NaN
  return Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 3001
}

function getOptionalEnv(key: string): string {
  return process.env[key]?.trim() || ''
}

function getStoredOptionalAiValue(key: 'CEREBRAS_API_KEY'): string {
  const storedAiSettings = getStoredAiSettings()

  if (key === 'CEREBRAS_API_KEY') {
    return storedAiSettings.cerebrasApiKey
  }

  return ''
}

function getAiDefaultProvider(): AiProvider {
  const provider = process.env.AI_DEFAULT_PROVIDER?.trim()
  return isAiProvider(provider) ? provider : DEFAULT_AI_PROVIDER
}

applyEnvFile('.env.local')

interface EnvConfig {
  readonly JIRA_PROJECT_KEY: string
  readonly PORT: number
  readonly OPENAI_API_KEY: string
  readonly ANTHROPIC_API_KEY: string
  readonly CEREBRAS_API_KEY: string
  readonly AI_DEFAULT_PROVIDER: AiProvider
  readonly OPENAI_DEFAULT_MODEL: string
  readonly ANTHROPIC_DEFAULT_MODEL: string
  readonly CEREBRAS_DEFAULT_MODEL: string
}

export const env: EnvConfig = {
  get JIRA_PROJECT_KEY() {
    return process.env.JIRA_PROJECT_KEY?.trim() || ''
  },
  get PORT() {
    return getPort()
  },
  get OPENAI_API_KEY() {
    return getOptionalEnv('OPENAI_API_KEY')
  },
  get ANTHROPIC_API_KEY() {
    return getOptionalEnv('ANTHROPIC_API_KEY')
  },
  get CEREBRAS_API_KEY() {
    return getOptionalEnv('CEREBRAS_API_KEY') || getStoredOptionalAiValue('CEREBRAS_API_KEY')
  },
  get AI_DEFAULT_PROVIDER() {
    return getAiDefaultProvider()
  },
  get OPENAI_DEFAULT_MODEL() {
    return getOptionalEnv('OPENAI_DEFAULT_MODEL') || DEFAULT_OPENAI_MODEL
  },
  get ANTHROPIC_DEFAULT_MODEL() {
    return getOptionalEnv('ANTHROPIC_DEFAULT_MODEL') || DEFAULT_ANTHROPIC_MODEL
  },
  get CEREBRAS_DEFAULT_MODEL() {
    return getOptionalEnv('CEREBRAS_DEFAULT_MODEL') || DEFAULT_CEREBRAS_MODEL
  },
}
