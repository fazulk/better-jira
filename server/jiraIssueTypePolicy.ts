import type { JiraCreateIssueType, JiraCreateIssueTypeOption } from './jiraTypes'

export function isCreateIssueType(value: string): value is JiraCreateIssueType {
  return value.trim().length > 0
}

export function normalizeIssueType(value: string): string {
  return value.trim().toLowerCase()
}

export function matchesIssueType(value: string | undefined, expected: JiraCreateIssueType): boolean {
  return normalizeIssueType(value ?? '') === expected.toLowerCase()
}

function getAllowedChildIssueTypesForParent(parentIssueType: string): string[] {
  const normalizedParentIssueType = normalizeIssueType(parentIssueType)

  if (normalizedParentIssueType.includes('epic')) {
    return ['Task', 'Bug', 'Story', 'Feature']
  }

  if (normalizedParentIssueType.includes('feature')) {
    return ['Task', 'Bug', 'Story']
  }

  if (normalizedParentIssueType.includes('story')) {
    return ['Task', 'Bug', 'Story']
  }

  if (normalizedParentIssueType.includes('task') || normalizedParentIssueType.includes('bug')) {
    return ['Task']
  }

  return []
}

export function isAllowedChildIssueTypeForParent(parentIssueType: string, childIssueType: string): boolean {
  const allowedChildIssueTypes = getAllowedChildIssueTypesForParent(parentIssueType)
  return allowedChildIssueTypes.some((candidate) => matchesIssueType(childIssueType, candidate))
}

export function isAvailableChildIssueTypeForParent(
  parentIssueType: string,
  childIssueType: JiraCreateIssueTypeOption,
  issueTypeOptions: JiraCreateIssueTypeOption[],
): boolean {
  const parentIssueTypeOption = issueTypeOptions.find((candidate) => matchesIssueType(candidate.name, parentIssueType))
  if (!parentIssueTypeOption) {
    return isAllowedChildIssueTypeForParent(parentIssueType, childIssueType.name)
  }

  if (parentIssueTypeOption.hierarchyLevel < 0) {
    return false
  }

  if (parentIssueTypeOption.hierarchyLevel === 0) {
    return childIssueType.subtask
  }

  return !childIssueType.subtask && childIssueType.hierarchyLevel === parentIssueTypeOption.hierarchyLevel - 1
}
