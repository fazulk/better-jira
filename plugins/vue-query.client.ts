import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

export default defineNuxtPlugin(async (nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 20_000,
        refetchOnWindowFocus: false,
      },
    },
  })

  const queryPersister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'jira2-query-cache',
  })

  const [, restorePromise] = persistQueryClient({
    queryClient,
    persister: queryPersister,
    maxAge: TWO_DAYS_MS,
    buster: 'jira2-v1',
  })

  await restorePromise

  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient })
})
