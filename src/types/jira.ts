import type { JiraAdfDocument, JiraAdfMark, JiraAdfNode } from '~/shared/jiraAdf'

export type { JiraAdfDocument, JiraAdfMark, JiraAdfNode }

export interface JiraTicket {
  key: string
  summary: string
  status: string
  statusCategory: string
  inCurrentSprint: boolean
  createdAt?: string
  updatedAt?: string
  dueDate?: string
  completedAt?: string
  priority: string
  issueType: string
  spaceKey: string
  spaceName: string
  assignee: string
  assigneeAccountId?: string
  description?: string
  descriptionAdf?: JiraAdfDocument
  self: string
  parent?: {
    key: string
    summary: string
    issueType: string
  }
}

export interface JiraAssignableUser {
  accountId: string
  displayName: string
}

export interface JiraMessage {
  id: string
  author: string
  createdAt: string
  body: string
}

export interface JiraTransition {
  id: string
  name: string
  statusCategory: string
}

export interface JiraPriority {
  id: string
  name: string
}

export type JiraCreateIssueType = string

export type JiraCreateFieldValue = string | string[] | JiraAdfDocument | null

export interface CreateJiraTicketInput {
  issueType: JiraCreateIssueType
  spaceKey?: string | null
  parentKey?: string | null
  fields: Record<string, JiraCreateFieldValue>
}

export type StatusGroup = 'new' | 'indeterminate' | 'done'

export function getStatusGroup(statusCategory: string): StatusGroup {
  if (statusCategory === 'done') return 'done'
  if (statusCategory === 'new') return 'new'
  return 'indeterminate'
}
