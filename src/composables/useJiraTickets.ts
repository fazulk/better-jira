import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { fetchTickets, refreshCache, type TicketsPayload } from '@/api/jira'
import type { JiraTicket } from '@/types/jira'

const TICKETS_QUERY_KEY = ['tickets'] as const

export function useJiraTickets() {
  const queryClient = useQueryClient()
  const error = ref<string | null>(null)
  const lastUpdated = ref<Date | null>(null)
  const refreshingFromSSE = ref(false)
  let eventSource: EventSource | null = null
  let refreshTimeout: ReturnType<typeof setTimeout> | null = null

  const ticketsQuery = useQuery({
    queryKey: TICKETS_QUERY_KEY,
    queryFn: () => fetchTickets(),
  })

  watch(ticketsQuery.data, (data) => {
    if (!data) return
    lastUpdated.value = new Date()
    error.value = null
  }, { immediate: true })

  watch(ticketsQuery.error, (err) => {
    if (!err) return
    error.value = err instanceof Error ? err.message : 'Failed to load tickets'
  }, { immediate: true })

  const tickets = computed(() => ticketsQuery.data.value ?? [])

  const groupedByStatus = computed(() => {
    const groups: Record<string, JiraTicket[]> = {}
    for (const t of tickets.value) {
      const key = t.status
      if (!groups[key]) groups[key] = []
      groups[key].push(t)
    }
    return groups
  })

  const loading = computed(() => ticketsQuery.isLoading.value)

  function clearRefreshTimeout() {
    if (refreshTimeout) {
      clearTimeout(refreshTimeout)
      refreshTimeout = null
    }
  }

  function stopRefreshing() {
    refreshingFromSSE.value = false
    clearRefreshTimeout()
  }

  function startRefreshTimeout() {
    clearRefreshTimeout()
    refreshTimeout = setTimeout(async () => {
      if (!refreshingFromSSE.value) return

      console.warn('Refresh timed out, falling back to direct fetch')
      try {
        await queryClient.fetchQuery({
          queryKey: TICKETS_QUERY_KEY,
          queryFn: () => fetchTickets(),
        })
      } catch {
        error.value = 'Refresh timed out'
      } finally {
        stopRefreshing()
      }
    }, 15_000)
  }

  const refreshMutation = useMutation({
    mutationFn: refreshCache,
    onMutate: () => {
      error.value = null
    },
    onSuccess: (payload) => {
      applyTicketsPayload(payload)
    },
    onError: (err: unknown) => {
      error.value = err instanceof Error ? err.message : 'Refresh failed'
      stopRefreshing()
    },
  })

  const refreshing = computed(() => refreshMutation.isPending.value || refreshingFromSSE.value)

  async function refresh() {
    if (refreshing.value) return
    try {
      await refreshMutation.mutateAsync()
    } catch {
      // handled by onError in mutation
    }
  }

  function applyTicketsPayload(payload: TicketsPayload) {
    if (!Array.isArray(payload.tickets)) return
    queryClient.setQueryData(TICKETS_QUERY_KEY, payload.tickets)
    lastUpdated.value = payload.updatedAt ? new Date(payload.updatedAt) : new Date()
    stopRefreshing()
  }

  function applySseError(message?: string) {
    error.value = message || 'Refresh failed'
    stopRefreshing()
  }

  function mergeUpdatedTicket(updatedTicket: JiraTicket) {
    queryClient.setQueryData<JiraTicket[]>(TICKETS_QUERY_KEY, (current = []) =>
      current.map((ticket) => {
        if (ticket.key === updatedTicket.key) {
          return {
            ...ticket,
            ...updatedTicket,
          }
        }

        if (ticket.parent?.key === updatedTicket.key) {
          return {
            ...ticket,
            parent: {
              ...ticket.parent,
              summary: updatedTicket.summary,
              issueType: updatedTicket.issueType,
            },
          }
        }

        return ticket
      }),
    )

    queryClient.setQueryData(['ticket', updatedTicket.key], updatedTicket)
  }

  function mergeCreatedTicket(createdTicket: JiraTicket) {
    queryClient.setQueryData<JiraTicket[]>(TICKETS_QUERY_KEY, (current = []) => {
      const existingIndex = current.findIndex((ticket) => ticket.key === createdTicket.key)
      if (existingIndex === -1) {
        return [...current, createdTicket]
      }

      return current.map((ticket) => {
        if (ticket.key === createdTicket.key) {
          return {
            ...ticket,
            ...createdTicket,
          }
        }

        if (ticket.parent?.key === createdTicket.key) {
          return {
            ...ticket,
            parent: {
              ...ticket.parent,
              summary: createdTicket.summary,
              issueType: createdTicket.issueType,
            },
          }
        }

        return ticket
      })
    })

    queryClient.setQueryData(['ticket', createdTicket.key], createdTicket)
  }

  function connectSSE() {
    eventSource = new EventSource('/api/events')

    eventSource.addEventListener('tickets', (e) => {
      try {
        const payload = JSON.parse((e as MessageEvent).data)
        applyTicketsPayload(payload)
      } catch {
        applySseError('Failed to parse ticket update')
      }
    })

    eventSource.addEventListener('refreshing', () => {
      refreshingFromSSE.value = true
      startRefreshTimeout()
    })

    eventSource.addEventListener('ticket-updated', (e) => {
      try {
        const updatedTicket = JSON.parse((e as MessageEvent).data) as JiraTicket
        mergeUpdatedTicket(updatedTicket)
      } catch {
        applySseError('Failed to parse ticket update')
      }
    })

    eventSource.addEventListener('ticket-created', (e) => {
      try {
        const createdTicket = JSON.parse((e as MessageEvent).data) as JiraTicket
        mergeCreatedTicket(createdTicket)
      } catch {
        applySseError('Failed to parse ticket create')
      }
    })

    eventSource.addEventListener('error', (e) => {
      if ('data' in e) {
        try {
          const payload = JSON.parse((e as MessageEvent).data)
          applySseError(payload.message)
        } catch {
          applySseError('Refresh failed')
        }
      }

      if (eventSource?.readyState === EventSource.CLOSED) {
        stopRefreshing()
        setTimeout(connectSSE, 3000)
      }
    })
  }

  function disconnectSSE() {
    eventSource?.close()
    eventSource = null
  }

  onMounted(() => {
    connectSSE()
  })

  onUnmounted(() => {
    disconnectSSE()
    clearRefreshTimeout()
  })

  return {
    tickets,
    groupedByStatus,
    loading,
    refreshing,
    error,
    lastUpdated,
    refresh,
  }
}
