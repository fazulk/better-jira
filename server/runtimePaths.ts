import { resolve } from 'node:path'

const projectRoot = process.cwd()

function getOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim()
  return value ? value : null
}

export function getAppDataDir(): string {
  return getOptionalEnv('BETTER_JIRA_APP_DATA_DIR') ?? resolve(projectRoot, '.data')
}

export function getExplicitEnvFilePath(): string | null {
  return getOptionalEnv('BETTER_JIRA_ENV_FILE')
}
