import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join } from 'node:path'
import type { AiProvider, AiProviderAvailability } from '../../shared/ai'

export type LocalAiProvider = 'codex' | 'claude'

interface LocalProviderCommandConfig {
  provider: LocalAiProvider
  command: string
  label: string
}

const LOCAL_PROVIDER_COMMANDS: LocalProviderCommandConfig[] = [
  { provider: 'codex', command: 'codex', label: 'Codex CLI' },
  { provider: 'claude', command: 'claude', label: 'Claude Code CLI' },
]

const LOCAL_PROVIDER_CACHE_TTL_MS = 15_000
let cachedProviderAvailability: AiProviderAvailability[] | null = null
let cachedProviderAvailabilityAt = 0

function isLocalAiProvider(provider: AiProvider): provider is LocalAiProvider {
  return provider === 'codex' || provider === 'claude'
}

function getPathEntries(): string[] {
  const entries = new Set<string>()
  const envPath = process.env.PATH ?? ''

  for (const entry of envPath.split(delimiter)) {
    if (entry.trim()) {
      entries.add(entry.trim())
    }
  }

  const home = homedir()
  const fnmMultishellsPath = join(home, '.local', 'state', 'fnm_multishells')
  const staticEntries = [
    '/opt/homebrew/bin',
    '/usr/local/bin',
    join(home, '.local', 'bin'),
    join(home, '.npm-global', 'bin'),
    join(home, '.bun', 'bin'),
    join(home, '.fnm', 'aliases', 'default', 'bin'),
  ]

  for (const entry of staticEntries) {
    entries.add(entry)
  }

  if (existsSync(fnmMultishellsPath)) {
    try {
      for (const entry of readdirSync(fnmMultishellsPath, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          entries.add(join(fnmMultishellsPath, entry.name, 'bin'))
        }
      }
    } catch {
      // Ignore unreadable shell-manager directories; shell resolution below is still attempted.
    }
  }

  return [...entries]
}

function resolveFromCandidatePaths(command: string): string | null {
  for (const entry of getPathEntries()) {
    const candidatePath = join(entry, command)
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

function resolveFromUserShell(command: string): string | null {
  const shells = [process.env.SHELL, '/bin/zsh', '/bin/bash'].filter((value, index, values): value is string => (
    typeof value === 'string' && value.length > 0 && values.indexOf(value) === index
  ))

  for (const shellPath of shells) {
    if (!existsSync(shellPath)) {
      continue
    }

    try {
      const output = execFileSync(shellPath, ['-lc', `command -v ${command}`], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 1500,
      }).trim()
      const [firstLine] = output.split(/\r?\n/)

      if (firstLine && firstLine.startsWith('/')) {
        return firstLine
      }
    } catch {
      // Try the next shell or path-based fallback.
    }
  }

  return null
}

function resolveCommandPath(command: string): string | null {
  return resolveFromCandidatePaths(command) ?? resolveFromUserShell(command)
}

function createAvailability(config: LocalProviderCommandConfig): AiProviderAvailability {
  const commandPath = resolveCommandPath(config.command)

  if (!commandPath) {
    return {
      provider: config.provider,
      available: false,
      detail: `${config.label} was not found on this computer.`,
    }
  }

  return {
    provider: config.provider,
    available: true,
    detail: `${config.label} detected at ${commandPath}.`,
    commandPath,
  }
}

export function getLocalAiCommandPathEnv(): string {
  return getPathEntries().join(delimiter)
}

export function getLocalAiProviderAvailability(): AiProviderAvailability[] {
  const now = Date.now()
  if (cachedProviderAvailability && now - cachedProviderAvailabilityAt < LOCAL_PROVIDER_CACHE_TTL_MS) {
    return cachedProviderAvailability
  }

  cachedProviderAvailability = LOCAL_PROVIDER_COMMANDS.map(createAvailability)
  cachedProviderAvailabilityAt = now
  return cachedProviderAvailability
}

export function resolveLocalAiCommand(provider: LocalAiProvider): string | null {
  const cachedAvailability = getLocalAiProviderAvailability().find((entry) => entry.provider === provider)
  if (cachedAvailability?.commandPath) {
    return cachedAvailability.commandPath
  }

  const config = LOCAL_PROVIDER_COMMANDS.find((entry) => entry.provider === provider)
  return config ? resolveCommandPath(config.command) : null
}

export function assertLocalAiProviderConfigured(provider: AiProvider): void {
  if (!isLocalAiProvider(provider)) {
    return
  }

  if (resolveLocalAiCommand(provider)) {
    return
  }

  const label = provider === 'codex' ? 'Codex CLI' : 'Claude Code CLI'
  const command = provider === 'codex' ? 'codex' : 'claude'
  throw new Error(`${label} is selected but the ${command} command was not found on this computer.`)
}
