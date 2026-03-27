import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  compatibilityDate: '2026-03-27',
  ssr: false,
  css: ['~/src/style.css'],
  alias: {
    '@': fileURLToPath(new URL('./src', import.meta.url)),
  },
  components: [
    {
      path: '~/src/components',
      pathPrefix: false,
    },
  ],
  imports: {
    dirs: ['src/composables'],
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
