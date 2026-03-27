import { defineEventHandler, getMethod, getQuery, getRequestURL, readBody } from 'h3'
import {
  addTicketMessage,
  createIssue,
  forceRefreshTickets,
  getAllPriorities,
  getAssignableUsers,
  getCreateAssignableUsers,
  getCreatePriorities,
  getPriorities,
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
import { addClient, removeClient } from '../events'

const API_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const TICKET_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCreateIssueType(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseCreateFields(value: unknown): Record<string, string | string[] | null> {
  if (!isRecord(value)) {
    return {}
  }

  const fields: Record<string, string | string[] | null> = {}

  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue === 'string' || fieldValue === null) {
      fields[key] = fieldValue
      continue
    }

    if (Array.isArray(fieldValue)) {
      fields[key] = fieldValue.filter((entry): entry is string => typeof entry === 'string')
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
      const tickets = await searchTickets(jql)
      return Response.json(tickets, { headers: API_HEADERS })
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

      const fields = parseCreateFields(isRecord(body) ? body.fields : undefined)
      const ticket = await createIssue({
        issueType,
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
      const users = await getCreateAssignableUsers(issueType, parentKey)
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

    if (segments.length >= 2 && segments[0] === 'tickets' && TICKET_KEY_PATTERN.test(segments[1])) {
      const ticketKey = segments[1]

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
        const description = isRecord(body) && typeof body.description === 'string' ? body.description : ''
        const ticket = await updateTicketDescription(ticketKey, description)
        return Response.json(ticket, { headers: API_HEADERS })
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

      if (segments.length === 3 && segments[2] === 'status' && method === 'PUT') {
        const body = await readBody<unknown>(event)
        const transitionId = isRecord(body) && typeof body.transitionId === 'string' ? body.transitionId : ''
        const ticket = await updateTicketStatus(ticketKey, transitionId)
        return Response.json(ticket, { headers: API_HEADERS })
      }
    }

    if (segments.length === 1 && segments[0] === 'refresh' && method === 'POST') {
      const payload = await forceRefreshTickets()
      return Response.json(payload, { headers: API_HEADERS })
    }

    return notFoundResponse()
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown request error'
    console.error('Request error:', message)
    return Response.json({ error: message }, { status: 500, headers: API_HEADERS })
  }
})
