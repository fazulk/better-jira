import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import type { ViteDevServer } from 'vite'
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
const serverDir = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = resolve(serverDir, '..')
const indexHtmlPath = resolve(projectRoot, 'index.html')
const distDir = resolve(projectRoot, 'dist')
const isProduction = process.env.NODE_ENV === 'production'

const API_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

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

function appendHeaders(headers: Headers, rawHeaders: IncomingMessage['headers']): void {
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === 'string') {
      headers.append(key, value)
      continue
    }

    if (!value) {
      continue
    }

    for (const entry of value) {
      headers.append(key, entry)
    }
  }
}

async function readNodeRequestBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return undefined
  }

  const chunks: Uint8Array[] = []

  for await (const chunk of req) {
    if (typeof chunk === 'string') {
      chunks.push(new TextEncoder().encode(chunk))
      continue
    }

    chunks.push(chunk)
  }

  if (chunks.length === 0) {
    return undefined
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
}

async function createWebRequest(req: IncomingMessage): Promise<Request> {
  const headers = new Headers()
  appendHeaders(headers, req.headers)

  const body = await readNodeRequestBody(req)
  const host = req.headers.host ?? `localhost:${PORT}`
  const url = new URL(req.url ?? '/', `http://${host}`)
  const abortController = new AbortController()

  req.on('close', () => {
    abortController.abort()
  })

  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    body,
    signal: abortController.signal,
  })
}

async function writeWebResponse(
  res: ServerResponse,
  response: Response,
  method: string | undefined,
): Promise<void> {
  res.statusCode = response.status
  if (response.statusText) {
    res.statusMessage = response.statusText
  }

  response.headers.forEach((value, key) => {
    res.setHeader(key, value)
  })

  if (method === 'HEAD' || response.body === null) {
    res.end()
    return
  }

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const bodyStream = Readable.fromWeb(response.body)

    bodyStream.on('error', rejectPromise)
    res.on('finish', resolvePromise)
    res.on('close', resolvePromise)
    bodyStream.pipe(res)
  })
}

function isPathInside(rootPath: string, filePath: string): boolean {
  const relativePath = relative(rootPath, filePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

function resolveDistFile(pathname: string): string | null {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname
  const filePath = resolve(distDir, `.${normalizedPath}`)
  return isPathInside(distDir, filePath) ? filePath : null
}

function hasFileExtension(pathname: string): boolean {
  return extname(pathname) !== ''
}

function getContentType(filePath: string): string {
  const fileExtension = extname(filePath)
  return CONTENT_TYPES[fileExtension] ?? 'application/octet-stream'
}

function isHtmlRouteRequest(request: Request): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return false
  }

  const pathname = new URL(request.url).pathname

  if (pathname.startsWith('/@vite') || pathname.startsWith('/@id/') || pathname.startsWith('/src/')) {
    return false
  }

  if (hasFileExtension(pathname)) {
    return false
  }

  const acceptHeader = request.headers.get('accept') ?? ''
  return acceptHeader.includes('text/html')
}

async function serveFile(filePath: string): Promise<Response> {
  const body = await readFile(filePath)
  return new Response(body, {
    headers: {
      'Content-Type': getContentType(filePath),
    },
  })
}

async function serveProductionApp(request: Request): Promise<Response> {
  const url = new URL(request.url)

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return Response.json({ error: 'Not found' }, { status: 404, headers: API_HEADERS })
  }

  if (hasFileExtension(url.pathname)) {
    const filePath = resolveDistFile(url.pathname)
    if (!filePath) {
      return Response.json({ error: 'Not found' }, { status: 404, headers: API_HEADERS })
    }

    try {
      return await serveFile(filePath)
    } catch {
      return Response.json({ error: 'Not found' }, { status: 404, headers: API_HEADERS })
    }
  }

  return serveFile(resolveDistDirIndex())
}

function resolveDistDirIndex(): string {
  return resolve(distDir, 'index.html')
}

async function renderDevIndexHtml(vite: ViteDevServer, request: Request): Promise<Response> {
  const template = await readFile(indexHtmlPath, 'utf8')
  const url = new URL(request.url)
  const html = await vite.transformIndexHtml(url.pathname, template)

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
    },
  })
}

async function runViteMiddleware(vite: ViteDevServer, req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  return new Promise<boolean>((resolvePromise, rejectPromise) => {
    vite.middlewares(req, res, (error?: Error) => {
      if (error) {
        rejectPromise(error)
        return
      }

      resolvePromise(res.writableEnded)
    })
  })
}

async function handleApiRequest(request: Request): Promise<Response | null> {
  const url = new URL(request.url)

  if (!url.pathname.startsWith('/api')) {
    return null
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: API_HEADERS })
  }

  try {
    if (url.pathname === '/api/events' && request.method === 'GET') {
      let clientId = -1
      const stream = new ReadableStream({
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

      return new Response(stream, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Content-Type': 'text/event-stream',
        },
      })
    }

    if (url.pathname === '/api/tickets' && request.method === 'GET') {
      const jql = url.searchParams.get('jql') || undefined
      const tickets = await searchTickets(jql)
      return Response.json(tickets, { headers: API_HEADERS })
    }

    if (url.pathname === '/api/tickets' && request.method === 'POST') {
      const body = await request.json()
      const issueType = isRecord(body) ? body.issueType : undefined
      if (!isCreateIssueType(issueType)) {
        return Response.json({ error: 'issueType must be a non-empty string' }, { status: 400, headers: API_HEADERS })
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

    if (url.pathname === '/api/create-assignees' && request.method === 'GET') {
      const issueType = url.searchParams.get('issueType')
      if (!isCreateIssueType(issueType)) {
        return Response.json({ error: 'issueType query param must be a non-empty string' }, { status: 400, headers: API_HEADERS })
      }

      const parentKey = url.searchParams.get('parentKey')
      const users = await getCreateAssignableUsers(issueType, parentKey)
      return Response.json(users, { headers: API_HEADERS })
    }

    if (url.pathname === '/api/create-priorities' && request.method === 'GET') {
      const issueType = url.searchParams.get('issueType')
      if (!isCreateIssueType(issueType)) {
        return Response.json({ error: 'issueType query param must be a non-empty string' }, { status: 400, headers: API_HEADERS })
      }

      const parentKey = url.searchParams.get('parentKey')
      const priorities = await getCreatePriorities(issueType, parentKey)
      return Response.json(priorities, { headers: API_HEADERS })
    }

    if (url.pathname === '/api/priorities' && request.method === 'GET') {
      const priorities = await getAllPriorities()
      return Response.json(priorities, { headers: API_HEADERS })
    }

    const ticketMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)$/)
    if (ticketMatch && request.method === 'GET') {
      const ticket = await getTicket(ticketMatch[1])
      return Response.json(ticket, { headers: API_HEADERS })
    }

    const ticketMessagesMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/messages$/)
    if (ticketMessagesMatch && request.method === 'GET') {
      const messages = await getTicketMessages(ticketMessagesMatch[1])
      return Response.json(messages, { headers: API_HEADERS })
    }

    if (ticketMessagesMatch && request.method === 'POST') {
      const body = await request.json()
      const messageText = isRecord(body) && typeof body.body === 'string' ? body.body : ''
      const message = await addTicketMessage(ticketMessagesMatch[1], messageText)
      return Response.json(message, { headers: API_HEADERS })
    }

    const ticketAssigneesMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/assignees$/)
    if (ticketAssigneesMatch && request.method === 'GET') {
      const assignees = await getAssignableUsers(ticketAssigneesMatch[1])
      return Response.json(assignees, { headers: API_HEADERS })
    }

    const ticketTitleMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/title$/)
    if (ticketTitleMatch && request.method === 'PUT') {
      const body = await request.json()
      const title = isRecord(body) && typeof body.title === 'string' ? body.title : ''
      const ticket = await updateTicketTitle(ticketTitleMatch[1], title)
      return Response.json(ticket, { headers: API_HEADERS })
    }

    const ticketDescriptionMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/description$/)
    if (ticketDescriptionMatch && request.method === 'PUT') {
      const body = await request.json()
      const description = isRecord(body) && typeof body.description === 'string' ? body.description : ''
      const ticket = await updateTicketDescription(ticketDescriptionMatch[1], description)
      return Response.json(ticket, { headers: API_HEADERS })
    }

    const ticketAssigneeMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/assignee$/)
    if (ticketAssigneeMatch && request.method === 'PUT') {
      const body = await request.json()
      const accountId = isRecord(body) && typeof body.accountId === 'string'
        ? body.accountId
        : null
      const ticket = await updateTicketAssignee(ticketAssigneeMatch[1], accountId)
      return Response.json(ticket, { headers: API_HEADERS })
    }

    const ticketPrioritiesMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/priorities$/)
    if (ticketPrioritiesMatch && request.method === 'GET') {
      const priorities = await getPriorities(ticketPrioritiesMatch[1])
      return Response.json(priorities, { headers: API_HEADERS })
    }

    const ticketPriorityMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/priority$/)
    if (ticketPriorityMatch && request.method === 'PUT') {
      const body = await request.json()
      const priorityId = isRecord(body) && typeof body.priorityId === 'string' ? body.priorityId : ''
      const ticket = await updateTicketPriority(ticketPriorityMatch[1], priorityId)
      return Response.json(ticket, { headers: API_HEADERS })
    }

    const ticketTransitionsMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/transitions$/)
    if (ticketTransitionsMatch && request.method === 'GET') {
      const transitions = await getTransitions(ticketTransitionsMatch[1])
      return Response.json(transitions, { headers: API_HEADERS })
    }

    const ticketStatusMatch = url.pathname.match(/^\/api\/tickets\/([A-Z][A-Z0-9]+-\d+)\/status$/)
    if (ticketStatusMatch && request.method === 'PUT') {
      const body = await request.json()
      const transitionId = isRecord(body) && typeof body.transitionId === 'string' ? body.transitionId : ''
      const ticket = await updateTicketStatus(ticketStatusMatch[1], transitionId)
      return Response.json(ticket, { headers: API_HEADERS })
    }

    if (url.pathname === '/api/refresh' && request.method === 'POST') {
      const payload = await forceRefreshTickets()
      return Response.json(payload, { headers: API_HEADERS })
    }

    return Response.json({ error: 'Not found' }, { status: 404, headers: API_HEADERS })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown request error'
    console.error('Request error:', message)
    return Response.json({ error: message }, { status: 500, headers: API_HEADERS })
  }
}

async function createViteServer(): Promise<ViteDevServer> {
  const { createServer: createViteServerInstance } = await import('vite')
  return createViteServerInstance({
    appType: 'custom',
    server: {
      middlewareMode: true,
    },
  })
}

async function main(): Promise<void> {
  const vite = isProduction ? null : await createViteServer()

  const server = createServer(async (req, res) => {
    try {
      const request = await createWebRequest(req)
      const apiResponse = await handleApiRequest(request)

      if (apiResponse) {
        await writeWebResponse(res, apiResponse, req.method)
        return
      }

      if (vite) {
        if (isHtmlRouteRequest(request)) {
          const response = await renderDevIndexHtml(vite, request)
          await writeWebResponse(res, response, req.method)
          return
        }

        const handled = await runViteMiddleware(vite, req, res)
        if (!handled) {
          res.statusCode = 404
          res.end('Not found')
        }
        return
      }

      const response = await serveProductionApp(request)
      await writeWebResponse(res, response, req.method)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown server error'

      if (vite && error instanceof Error) {
        vite.ssrFixStacktrace(error)
      }

      console.error('Server error:', message)

      if (!res.headersSent) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      }

      if (!res.writableEnded) {
        res.end(message)
      }
    }
  })

  server.listen(PORT, () => {
    console.log(`JIRA app server running on http://localhost:${PORT}`)
  })
}

void main()
