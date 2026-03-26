import { createApp } from 'vue'
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query'
import { persistQueryClient } from '@tanstack/query-persist-client-core'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import App from './App.vue'
import { router } from './router'
import './style.css'

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
    },
  },
})

const queryPersister = createSyncStoragePersister({
  storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  key: 'jira2-query-cache',
})

const [, restorePromise] = persistQueryClient({
  queryClient,
  persister: queryPersister,
  maxAge: TWO_DAYS_MS,
  buster: 'jira2-v1',
})

async function mountApp() {
  await restorePromise
  createApp(App).use(router).use(VueQueryPlugin, { queryClient }).mount('#app')
}

void mountApp()
