import type {
  CreateJiraTicketInput,
  JiraAssignableUser,
  JiraCreateIssueType,
  JiraMessage,
  JiraPriority,
  JiraTicket,
  JiraTransition,
} from '@/types/jira'

const BASE = '/api'

export interface TicketsPayload {
  tickets: JiraTicket[]
  updatedAt?: number | string
}

export async function fetchTickets(jql?: string): Promise<JiraTicket[]> {
  const params = jql ? `?jql=${encodeURIComponent(jql)}` : ''
  const res = await fetch(`${BASE}/tickets${params}`)
  if (!res.ok) throw new Error(`Failed to fetch tickets: ${res.statusText}`)
  return res.json()
}

export async function fetchTicket(key: string): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets/${key}`)
  if (!res.ok) throw new Error(`Failed to fetch ticket: ${res.statusText}`)
  return res.json()
}

export async function createTicket(input: CreateJiraTicketInput): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to create ticket: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function fetchCreateAssignableUsers(
  issueType: JiraCreateIssueType,
  parentKey?: string | null,
): Promise<JiraAssignableUser[]> {
  const params = new URLSearchParams({ issueType })
  if (parentKey) {
    params.set('parentKey', parentKey)
  }

  const res = await fetch(`${BASE}/create-assignees?${params.toString()}`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to fetch create assignees: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function fetchAllPriorities(): Promise<JiraPriority[]> {
  const res = await fetch(`${BASE}/priorities`)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to fetch priorities: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function fetchTicketMessages(key: string): Promise<JiraMessage[]> {
  const res = await fetch(`${BASE}/tickets/${key}/messages`)
  if (!res.ok) throw new Error(`Failed to fetch messages: ${res.statusText}`)
  return res.json()
}

export async function addTicketMessage(key: string, body: string): Promise<JiraMessage> {
  const res = await fetch(`${BASE}/tickets/${key}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ body }),
  })

  if (!res.ok) {
    const responseBody = await res.text().catch(() => '')
    throw new Error(`Failed to add message: ${res.status} ${res.statusText}${responseBody ? ` - ${responseBody}` : ''}`)
  }

  return res.json()
}

export async function updateTicketTitle(key: string, title: string): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets/${key}/title`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update title: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function updateTicketDescription(key: string, description: string): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets/${key}/description`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ description }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update description: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function fetchAssignableUsers(key: string): Promise<JiraAssignableUser[]> {
  const res = await fetch(`${BASE}/tickets/${key}/assignees`)
  if (!res.ok) throw new Error(`Failed to fetch assignees: ${res.statusText}`)
  return res.json()
}

export async function updateTicketAssignee(key: string, accountId: string | null): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets/${key}/assignee`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accountId }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update assignee: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export const fetchCreatePriorities = fetchAllPriorities

export const fetchPriorities = fetchAllPriorities

export async function updateTicketPriority(key: string, priorityId: string): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets/${key}/priority`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ priorityId }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update priority: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function fetchTransitions(key: string): Promise<JiraTransition[]> {
  const res = await fetch(`${BASE}/tickets/${key}/transitions`)
  if (!res.ok) throw new Error(`Failed to fetch transitions: ${res.statusText}`)
  return res.json()
}

export async function updateTicketStatus(key: string, transitionId: string): Promise<JiraTicket> {
  const res = await fetch(`${BASE}/tickets/${key}/status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transitionId }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to update status: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }

  return res.json()
}

export async function refreshCache(): Promise<TicketsPayload> {
  const res = await fetch(`${BASE}/refresh`, { method: 'POST' })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Failed to refresh cache: ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`)
  }
  return res.json()
}
