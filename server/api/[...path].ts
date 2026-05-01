import { defineEventHandler, getMethod, getQuery, getRequestURL, readBody } from 'h3'
import { isJiraAdfDocument, type JiraAdfDocument } from '../../shared/jiraAdf'
import { AI_PROVIDERS, isAiProvider } from '../../shared/ai'
import { buildUpdatedSinceSearchQuery, normalizeAppSettingsUpdate } from '../../shared/settings'
import {
  addTicketMessage,
  createIssue,
  forceRefreshTickets,
  getAccessibleSpaces,
  getAllPriorities,
  getAssignableUsers,
  getCreateAssignableUsers,
  getCreatePriorities,
  getPriorities,
  getJiraCurrentUser,
  getTicket,
  getTicketMessages,
  getTransitions,
  searchTickets,
  updateTicketAssignee,
  updateTicketDescription,
  updateTicketPriority,
  updateTicketStatus,
  updateTicketTitle,
} from '../jira'
import { getAiProviderAvailability } from '../ai/catalog'
import { generateTicketDescription } from '../ai/generateDescription'
import { addClient, removeClient } from '../events'
import { MissingJiraCredentialsError } from '../jiraCredentials'
import { getAppSettings, updateAppSettings } from '../settings'
import { getTicketGithubPrLink, updateTicketGithubPrLink } from '../ticketLinks'
import { normalizeLocalTicketKey } from '../../shared/localTickets'
import {
  createLocalTicket,
  getLocalTicketAsJiraShape,
  listLocalTicketsAsJiraShape,
  updateLocalTicketAssignee,
  updateLocalTicketDescription,
  updateLocalTicketPriority,
  updateLocalTicketStatus,
  updateLocalTicketTitle,
} from '../localTickets'

const API_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/

function isJiraRemoteTicketKey(key: string): boolean {
  return TICKET_KEY_PATTERN.test(key) && !key.toUpperCase().startsWith('LOCAL-')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCreateIssueType(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseRefreshUpdatedSince(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function parseCreateFields(value: unknown): Record<string, string | string[] | JiraAdfDocument | null> {
  if (!isRecord(value)) {
    return {}
  }

  const fields: Record<string, string | string[] | JiraAdfDocument | null> = {}

  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === 'string' || fieldValue === null) {
      fields[key] = fieldValue
      continue
    }

    if (Array.isArray(fieldValue)) {
      fields[key] = fieldValue.filter((entry): entry is string => typeof entry === 'string')
      continue
    }

    if (key === 'description' && isJiraAdfDocument(fieldValue)) {
      fields[key] = fieldValue
    }
  }

  return fields
}

function getStringQueryValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    return value.find((entry) => entry.length > 0)
  }

  return undefined
}

function notFoundResponse(): Response {
  return Response.json({ error: 'Not found' }, { status: 404, headers: API_HEADERS })
}

function badRequestResponse(message: string): Response {
  return Response.json({ error: message }, { status: 400, headers: API_HEADERS })
}

export default defineEventHandler(async (event) => {
  const method = getMethod(event)
  const url = getRequestURL(event)
  const path = url.pathname.replace(/^\/api\/?/, '')
  const segments = path.split('/').filter((segment) => segment.length > 0)

  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_HEADERS })
  }

  try {
    if (segments.length === 1 && segments[0] === 'events' && method === 'GET') {
      let clientId = -1
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          clientId = addClient(controller)
          controller.enqueue(new TextEncoder().encode(': connected\n\n'))
        },
        cancel() {
          if (clientId >= 0) {
            removeClient(clientId)
          }
        },
      })

      event.node.req.on('close', () => {
        if (clientId >= 0) {
          removeClient(clientId)
          clientId = -1
        }
      })

      return new Response(stream, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'Content-Type': 'text/event-stream',
        },
      })
    }

    if (segments.length === 1 && segments[0] === 'tickets' && method === 'GET') {
      const query = getQuery(event)
      const jql = getStringQueryValue(query.jql)
      const updatedSince = parseRefreshUpdatedSince(getStringQueryValue(query.updatedSince))
      const searchQuery = jql && updatedSince
        ? buildUpdatedSinceSearchQuery(jql, updatedSince)
        : jql
      const tickets = await searchTickets(searchQuery)
      return Response.json(tickets, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'settings' && method === 'GET') {
      return Response.json(getAppSettings(), { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'settings' && method === 'PUT') {
      const body = await readBody<unknown>(event)
      const settings = updateAppSettings(normalizeAppSettingsUpdate(body))
      return Response.json(settings, { headers: API_HEADERS })
    }

    if (segments.length === 2 && segments[0] === 'ai' && segments[1] === 'providers' && method === 'GET') {
      return Response.json({ providers: getAiProviderAvailability() }, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'spaces' && method === 'GET') {
      const spaces = await getAccessibleSpaces()
      return Response.json(spaces, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'tickets' && method === 'POST') {
      const body = await readBody<unknown>(event)
      const issueType = isRecord(body) ? body.issueType : undefined
      if (!isCreateIssueType(issueType)) {
        return badRequestResponse('issueType must be a non-empty string')
      }

      const parentKey = isRecord(body) && typeof body.parentKey === 'string'
        ? body.parentKey
        : null
      const spaceKey = isRecord(body) && typeof body.spaceKey === 'string'
        ? body.spaceKey
        : null

      const fields = parseCreateFields(isRecord(body) ? body.fields : undefined)
      const ticket = await createIssue({
        issueType,
        spaceKey,
        parentKey,
        fields,
      })

      return Response.json(ticket, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'create-assignees' && method === 'GET') {
      const query = getQuery(event)
      const issueType = getStringQueryValue(query.issueType)
      if (!isCreateIssueType(issueType)) {
        return badRequestResponse('issueType query param must be a non-empty string')
      }

      const parentKey = getStringQueryValue(query.parentKey) ?? null
      const spaceKey = getStringQueryValue(query.spaceKey) ?? null
      const users = await getCreateAssignableUsers(issueType, parentKey, spaceKey)
      return Response.json(users, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'create-priorities' && method === 'GET') {
      const query = getQuery(event)
      const issueType = getStringQueryValue(query.issueType)
      if (!isCreateIssueType(issueType)) {
        return badRequestResponse('issueType query param must be a non-empty string')
      }

      const parentKey = getStringQueryValue(query.parentKey) ?? null
      const priorities = await getCreatePriorities(issueType, parentKey)
      return Response.json(priorities, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'priorities' && method === 'GET') {
      const priorities = await getAllPriorities()
      return Response.json(priorities, { headers: API_HEADERS })
    }

    if (segments.length === 1 && segments[0] === 'jira-me' && method === 'GET') {
      const user = await getJiraCurrentUser()
      return Response.json(user, { headers: API_HEADERS })
    }

    if (segments.length === 2 && segments[0] === 'local' && segments[1] === 'tickets' && method === 'GET') {
      return Response.json(listLocalTicketsAsJiraShape(), { headers: API_HEADERS })
    }

    if (segments.length === 2 && segments[0] === 'local' && segments[1] === 'tickets' && method === 'POST') {
      const body = await readBody<unknown>(event)
      if (!isRecord(body)) {
        return badRequestResponse('Invalid JSON body.')
      }

      const summary = typeof body.summary === 'string' ? body.summary : ''
      const descriptionAdf = isJiraAdfDocument(body.descriptionAdf) ? body.descriptionAdf : null
      const priority = typeof body.priority === 'string' ? body.priority : undefined
      const assigneeName = body.assigneeName === null
        ? null
        : typeof body.assigneeName === 'string'
          ? body.assigneeName
          : null
      const statusId = typeof body.statusId === 'string' ? body.statusId : undefined
      const parentKey = typeof body.parentKey === 'string' ? body.parentKey : null
      const dueDate = typeof body.dueDate === 'string' ? body.dueDate : null

      try {
        const ticket = createLocalTicket({
          summary,
          descriptionAdf,
          priority,
          assigneeName,
          statusId: statusId === 'todo' || statusId === 'in_progress' || statusId === 'done' ? statusId : undefined,
          parentKey,
          dueDate,
        })
        return Response.json(ticket, { headers: API_HEADERS })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create ticket.'
        return badRequestResponse(message)
      }
    }

    if (
      segments.length === 3
      && segments[0] === 'tickets'
      && segments[2] === 'github-pr'
      && normalizeLocalTicketKey(segments[1])
    ) {
      const ticketKey = normalizeLocalTicketKey(segments[1]) as string

      if (method === 'GET') {
        const githubPrLink = getTicketGithubPrLink(ticketKey)
        return Response.json(githubPrLink, { headers: API_HEADERS })
      }

      if (method === 'PUT') {
        const body = await readBody<unknown>(event)
        const githubPrUrl = isRecord(body) && 'githubPrUrl' in body
          ? body.githubPrUrl
          : undefined

        try {
          const githubPrLink = updateTicketGithubPrLink(ticketKey, githubPrUrl)
          return Response.json(githubPrLink, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid GitHub PR URL.'
          return badRequestResponse(message)
        }
      }
    }

    if (segments.length >= 3 && segments[0] === 'local' && segments[1] === 'tickets') {
      const ticketKey = normalizeLocalTicketKey(segments[2])
      if (!ticketKey) {
        return notFoundResponse()
      }

      if (segments.length === 3 && method === 'GET') {
        const ticket = getLocalTicketAsJiraShape(ticketKey)
        if (!ticket) {
          return notFoundResponse()
        }

        return Response.json(ticket, { headers: API_HEADERS })
      }

      if (segments.length === 4 && segments[3] === 'title' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const title = isRecord(body) && typeof body.title === 'string' ? body.title : ''
        try {
          const ticket = updateLocalTicketTitle(ticketKey, title)
          return Response.json(ticket, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update title.'
          return badRequestResponse(message)
        }
      }

      if (segments.length === 4 && segments[3] === 'description' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const descriptionAdf = isRecord(body) && isJiraAdfDocument(body.descriptionAdf)
          ? body.descriptionAdf
          : null
        try {
          const ticket = updateLocalTicketDescription(ticketKey, descriptionAdf)
          return Response.json(ticket, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update description.'
          return badRequestResponse(message)
        }
      }

      if (segments.length === 4 && segments[3] === 'ai-description' && method === 'POST') {
        const body = await readBody<unknown>(event)
        const instruction = isRecord(body) && typeof body.instruction === 'string'
          ? body.instruction.trim()
          : ''

        if (!instruction) {
          return badRequestResponse('AI instruction cannot be empty.')
        }

        const provider = isRecord(body) && isAiProvider(body.provider)
          ? body.provider
          : null

        if (!provider) {
          return badRequestResponse(`provider must be one of: ${AI_PROVIDERS.join(', ')}.`)
        }

        const model = isRecord(body) && typeof body.model === 'string'
          ? body.model.trim()
          : ''

        if (!model) {
          return badRequestResponse('model must be a non-empty string.')
        }

        const currentDescriptionAdf = isRecord(body) && isJiraAdfDocument(body.currentDescriptionAdf)
          ? body.currentDescriptionAdf
          : null

        const description = await generateTicketDescription({
          instruction,
          currentDescriptionAdf,
          provider,
          model,
        })

        return Response.json(description, { headers: API_HEADERS })
      }

      if (segments.length === 4 && segments[3] === 'status' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const transitionId = isRecord(body) && typeof body.transitionId === 'string' ? body.transitionId : ''
        try {
          const ticket = updateLocalTicketStatus(ticketKey, transitionId)
          return Response.json(ticket, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update status.'
          return badRequestResponse(message)
        }
      }

      if (segments.length === 4 && segments[3] === 'priority' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const priorityName = isRecord(body) && typeof body.priorityName === 'string' ? body.priorityName : ''
        try {
          const ticket = updateLocalTicketPriority(ticketKey, priorityName)
          return Response.json(ticket, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update priority.'
          return badRequestResponse(message)
        }
      }

      if (segments.length === 4 && segments[3] === 'assignee' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const assigneeName = isRecord(body) && body.assigneeName === null
          ? null
          : isRecord(body) && typeof body.assigneeName === 'string'
            ? body.assigneeName
            : null
        try {
          const ticket = updateLocalTicketAssignee(ticketKey, assigneeName)
          return Response.json(ticket, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to update assignee.'
          return badRequestResponse(message)
        }
      }
    }

    const jiraRemoteKey = segments.length >= 2 ? segments[1] : undefined
    if (jiraRemoteKey && segments[0] === 'tickets' && isJiraRemoteTicketKey(jiraRemoteKey)) {
      const ticketKey = jiraRemoteKey

      if (segments.length === 2 && method === 'GET') {
        const ticket = await getTicket(ticketKey)
        return Response.json(ticket, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'messages' && method === 'GET') {
        const messages = await getTicketMessages(ticketKey)
        return Response.json(messages, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'messages' && method === 'POST') {
        const body = await readBody<unknown>(event)
        const messageText = isRecord(body) && typeof body.body === 'string' ? body.body : ''
        const message = await addTicketMessage(ticketKey, messageText)
        return Response.json(message, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'assignees' && method === 'GET') {
        const assignees = await getAssignableUsers(ticketKey)
        return Response.json(assignees, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'title' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const title = isRecord(body) && typeof body.title === 'string' ? body.title : ''
        const ticket = await updateTicketTitle(ticketKey, title)
        return Response.json(ticket, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'description' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const descriptionAdf = isRecord(body) && isJiraAdfDocument(body.descriptionAdf)
          ? body.descriptionAdf
          : null
        const ticket = await updateTicketDescription(ticketKey, descriptionAdf)
        return Response.json(ticket, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'ai-description' && method === 'POST') {
        const body = await readBody<unknown>(event)
        const instruction = isRecord(body) && typeof body.instruction === 'string'
          ? body.instruction.trim()
          : ''

        if (!instruction) {
          return badRequestResponse('AI instruction cannot be empty.')
        }

        const provider = isRecord(body) && isAiProvider(body.provider)
          ? body.provider
          : null

        if (!provider) {
          return badRequestResponse(`provider must be one of: ${AI_PROVIDERS.join(', ')}.`)
        }

        const model = isRecord(body) && typeof body.model === 'string'
          ? body.model.trim()
          : ''

        if (!model) {
          return badRequestResponse('model must be a non-empty string.')
        }

        const currentDescriptionAdf = isRecord(body) && isJiraAdfDocument(body.currentDescriptionAdf)
          ? body.currentDescriptionAdf
          : null

        const description = await generateTicketDescription({
          instruction,
          currentDescriptionAdf,
          provider,
          model,
        })

        return Response.json(description, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'assignee' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const accountId = isRecord(body) && typeof body.accountId === 'string'
          ? body.accountId
          : null
        const ticket = await updateTicketAssignee(ticketKey, accountId)
        return Response.json(ticket, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'priorities' && method === 'GET') {
        const priorities = await getPriorities(ticketKey)
        return Response.json(priorities, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'priority' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const priorityId = isRecord(body) && typeof body.priorityId === 'string' ? body.priorityId : ''
        const ticket = await updateTicketPriority(ticketKey, priorityId)
        return Response.json(ticket, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'transitions' && method === 'GET') {
        const transitions = await getTransitions(ticketKey)
        return Response.json(transitions, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'github-pr' && method === 'GET') {
        const githubPrLink = getTicketGithubPrLink(ticketKey)
        return Response.json(githubPrLink, { headers: API_HEADERS })
      }

      if (segments.length === 3 && segments[2] === 'github-pr' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const githubPrUrl = isRecord(body) && 'githubPrUrl' in body
          ? body.githubPrUrl
          : undefined

        try {
          const githubPrLink = updateTicketGithubPrLink(ticketKey, githubPrUrl)
          return Response.json(githubPrLink, { headers: API_HEADERS })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Invalid GitHub PR URL.'
          return badRequestResponse(message)
        }
      }

      if (segments.length === 3 && segments[2] === 'status' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const transitionId = isRecord(body) && typeof body.transitionId === 'string' ? body.transitionId : ''
        const ticket = await updateTicketStatus(ticketKey, transitionId)
        return Response.json(ticket, { headers: API_HEADERS })
      }
    }

    if (segments.length === 1 && segments[0] === 'refresh' && method === 'POST') {
      const body = await readBody<unknown>(event)
      const updatedSince = isRecord(body) ? parseRefreshUpdatedSince(body.updatedSince) : undefined
      const payload = await forceRefreshTickets(updatedSince)
      return Response.json(payload, { headers: API_HEADERS })
    }

    return notFoundResponse()
  } catch (error: unknown) {
    if (error instanceof MissingJiraCredentialsError) {
      console.error('Request blocked: Jira credentials missing')
      return Response.json({
        error: error.message,
        code: 'JIRA_CREDENTIALS_MISSING',
        missingKeys: error.missingKeys,
      }, { status: 409, headers: API_HEADERS })
    }

    const message = error instanceof Error ? error.message : 'Unknown request error'
    console.error('Request error:', message)
    return Response.json({ error: message }, { status: 500, headers: API_HEADERS })
  }
})
