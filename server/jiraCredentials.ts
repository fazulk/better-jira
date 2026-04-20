import { getStoredJiraSettings } from './settings'

export interface JiraCredentials {
  baseUrl: string
  email: string
  apiToken: string
}

type MissingJiraCredentialKey = 'baseUrl' | 'email' | 'apiToken'

export class MissingJiraCredentialsError extends Error {
  readonly missingKeys: MissingJiraCredentialKey[]

  constructor(missingKeys: MissingJiraCredentialKey[]) {
    const labels = missingKeys.map((key) => (
      key === 'baseUrl'
        ? 'Jira base URL'
        : key === 'email'
          ? 'Jira email'
          : 'Jira API token'
    ))
    super(`Missing Jira setup: ${labels.join(', ')}`)
    this.name = 'MissingJiraCredentialsError'
    this.missingKeys = missingKeys
  }
}

export function getJiraCredentials(): JiraCredentials {
  const jira = getStoredJiraSettings()
  const missingKeys: MissingJiraCredentialKey[] = []

  if (!jira.baseUrl) {
    missingKeys.push('baseUrl')
  }

  if (!jira.email) {
    missingKeys.push('email')
  }

  if (!jira.apiToken) {
    missingKeys.push('apiToken')
  }

  if (missingKeys.length > 0) {
    throw new MissingJiraCredentialsError(missingKeys)
  }

  return jira
}
