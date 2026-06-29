export function buildJiraIssueUrl(baseUrl: string, issueKey: string): string | null {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '')
  const normalizedIssueKey = issueKey.trim()

  if (!normalizedBaseUrl || !normalizedIssueKey) {
    return null
  }

  return `${normalizedBaseUrl}/browse/${encodeURIComponent(normalizedIssueKey)}`
}
