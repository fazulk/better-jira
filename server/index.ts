import {
  searchTickets,
  getTicket,
  getTicketMessages,
  forceRefreshTickets,
  addTicketMessage,
  updateTicketTitle,
  updateTicketDescription,
  getAssignableUsers,
  getCreateAssignableUsers,
  getCreatePriorities,
  getAllPriorities,
  updateTicketAssignee,
  getPriorities,
  updateTicketPriority,
  getTransitions,
  updateTicketStatus,
  createIssue,
} from './jira'
import { addClient, removeClient } from './events'
import { env } from './config'

const PORT = env.PORT

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
      const listValue = fieldValue.filter((entry): entry is string => typeof entry === 'string')
      fields[key] = listValue
    }
  }

  return fields
}

const server = Bun.serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url)

    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json',
    }

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    try {
      // SSE endpoint
      if (url.pathname === '/api/events' && req.method === 'GET') {
        let clientId: number
        const stream = new ReadableStream({
          start(controller) {
            clientId = addClient(controller)
            controller.enqueue(new TextEncoder().encode(': connected\n\n'))
          },
          cancel() {
            removeClient(clientId)
          },
        })

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        })
      }

      // GET /api/tickets
      if (url.pathname === '/api/tickets' && req.method === 'GET') {
        const jql = url.searchParams.get('jql') || undefined
        const tickets = await searchTickets(jql)
        return Response.json(tickets, { headers })
      }

      // POST /api/tickets
      if (url.pathname === '/api/tickets' && req.method === 'POST') {
        const body = await req.json()
        const issueType = isRecord(body) ? body.issueType : undefined
        if (!isCreateIssueType(issueType)) {
          return Response.json({ error: 'issueType must be a non-empty string' }, { status: 400, headers })
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
        return Response.json(ticket, { headers })
      }

      if (url.pathname === '/api/create-assignees' && req.method === 'GET') {
        const issueType = url.searchParams.get('issueType')
        if (!isCreateIssueType(issueType)) {
          return Response.json({ error: 'issueType query param must be a non-empty string' }, { status: 400, headers })
        }

        const parentKey = url.searchParams.get('parentKey')
        const users = await getCreateAssignableUsers(issueType, parentKey)
        return Response.json(users, { headers })
      }

      if (url.pathname === '/api/create-priorities' && req.method === 'GET') {
        const issueType = url.searchParams.get('issueType')
        if (!isCreateIssueType(issueType)) {
          return Response.json({ error: 'issueType query param must be a non-empty string' }, { status: 400, headers })
        }

        const parentKey = url.searchParams.get('parentKey')
        const priorities = await getCreatePriorities(issueType, parentKey)
        return Response.json(priorities, { headers })
      }

      if (url.pathname === '/api/priorities' && req.method === 'GET') {
        const priorities = await getAllPriorities()
        return Response.json(priorities, { headers })
      }

      // GET /api/tickets/:key
      const ticketMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)$/)
      if (ticketMatch && req.method === 'GET') {
        const ticket = await getTicket(ticketMatch[1])
        return Response.json(ticket, { headers })
      }

      // GET /api/tickets/:key/messages
      const ticketMessagesMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/messages$/)
      if (ticketMessagesMatch && req.method === 'GET') {
        const messages = await getTicketMessages(ticketMessagesMatch[1])
        return Response.json(messages, { headers })
      }

      // POST /api/tickets/:key/messages
      if (ticketMessagesMatch && req.method === 'POST') {
        const body = await req.json()
        const messageText = typeof body.body === 'string' ? body.body : ''
        const message = await addTicketMessage(ticketMessagesMatch[1], messageText)
        return Response.json(message, { headers })
      }

      // GET /api/tickets/:key/assignees
      const ticketAssigneesMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/assignees$/)
      if (ticketAssigneesMatch && req.method === 'GET') {
        const assignees = await getAssignableUsers(ticketAssigneesMatch[1])
        return Response.json(assignees, { headers })
      }

      // PUT /api/tickets/:key/title
      const ticketTitleMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/title$/)
      if (ticketTitleMatch && req.method === 'PUT') {
        const { title } = await req.json()
        const ticket = await updateTicketTitle(ticketTitleMatch[1], title)
        return Response.json(ticket, { headers })
      }

      // PUT /api/tickets/:key/description
      const ticketDescriptionMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/description$/)
      if (ticketDescriptionMatch && req.method === 'PUT') {
        const { description } = await req.json()
        const ticket = await updateTicketDescription(ticketDescriptionMatch[1], description ?? '')
        return Response.json(ticket, { headers })
      }

      // PUT /api/tickets/:key/assignee
      const ticketAssigneeMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/assignee$/)
      if (ticketAssigneeMatch && req.method === 'PUT') {
        const { accountId } = await req.json()
        const ticket = await updateTicketAssignee(ticketAssigneeMatch[1], accountId ?? null)
        return Response.json(ticket, { headers })
      }

      // GET /api/tickets/:key/priorities
      const ticketPrioritiesMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/priorities$/)
      if (ticketPrioritiesMatch && req.method === 'GET') {
        const priorities = await getPriorities(ticketPrioritiesMatch[1])
        return Response.json(priorities, { headers })
      }

      // PUT /api/tickets/:key/priority
      const ticketPriorityMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/priority$/)
      if (ticketPriorityMatch && req.method === 'PUT') {
        const { priorityId } = await req.json()
        const ticket = await updateTicketPriority(ticketPriorityMatch[1], priorityId)
        return Response.json(ticket, { headers })
      }

      // GET /api/tickets/:key/transitions
      const ticketTransitionsMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/transitions$/)
      if (ticketTransitionsMatch && req.method === 'GET') {
        const transitions = await getTransitions(ticketTransitionsMatch[1])
        return Response.json(transitions, { headers })
      }

      // PUT /api/tickets/:key/status
      const ticketStatusMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/status$/)
      if (ticketStatusMatch && req.method === 'PUT') {
        const { transitionId } = await req.json()
        const ticket = await updateTicketStatus(ticketStatusMatch[1], transitionId)
        return Response.json(ticket, { headers })
      }

      // POST /api/refresh — trigger background refresh, pushes via SSE
      if (url.pathname === '/api/refresh' && req.method === 'POST') {
        const payload = await forceRefreshTickets()
        return Response.json(payload, { headers })
      }

      return Response.json({ error: 'Not found' }, { status: 404, headers })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown request error'
      console.error('Request error:', message)
      return Response.json({ error: message }, { status: 500, headers })
    }
  },
})

console.log(`JIRA API server running on http://localhost:${server.port}`)
