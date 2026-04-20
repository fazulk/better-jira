type SSEClient = {
  controller: ReadableStreamDefaultController
  id: number
}

let nextId = 0
const clients = new Set<SSEClient>()

export function addClient(controller: ReadableStreamDefaultController): number {
  const id = nextId++
  clients.add({ controller, id })
  console.log(`SSE client connected (${clients.size} total)`)
  return id
}

export function removeClient(id: number): void {
  for (const client of clients) {
    if (client.id === id) {
      clients.delete(client)
      break
    }
  }
  console.log(`SSE client disconnected (${clients.size} total)`)
}

export function broadcast(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  const dead: SSEClient[] = []

  for (const client of clients) {
    try {
      client.controller.enqueue(new TextEncoder().encode(message))
    } catch {
      dead.push(client)
    }
  }

  for (const client of dead) {
    clients.delete(client)
  }
}

export function clientCount(): number {
  return clients.size
}
