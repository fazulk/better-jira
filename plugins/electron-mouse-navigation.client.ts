const BACK_MOUSE_BUTTON = 3
const FORWARD_MOUSE_BUTTON = 4
const DUPLICATE_MOUSE_NAVIGATION_MS = 300
const DEBUG_MOUSE_NAVIGATION_PREFIX = '[DEBUG-mouse-navigation]'

let lastNavigationButton: number | null = null
let lastNavigationAt = 0

function isElectronOnMacOS(): boolean {
  const userAgent = window.navigator.userAgent

  return userAgent.includes('Electron/') && userAgent.includes('Mac OS X')
}

function debugMouseNavigation(message: string): void {
  console.warn(`${DEBUG_MOUSE_NAVIGATION_PREFIX} ${message}`)
}

function describeMouseEvent(event: MouseEvent): string {
  return `type=${event.type} button=${event.button} buttons=${event.buttons} cancelable=${String(event.cancelable)} historyLength=${window.history.length} url=${window.location.href}`
}

function handleMouseHistoryNavigation(event: MouseEvent): void {
  if (event.button !== BACK_MOUSE_BUTTON && event.button !== FORWARD_MOUSE_BUTTON) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  debugMouseNavigation(`handled ${describeMouseEvent(event)}`)

  const now = performance.now()
  if (lastNavigationButton === event.button && now - lastNavigationAt < DUPLICATE_MOUSE_NAVIGATION_MS) {
    debugMouseNavigation(`ignored duplicate button=${event.button}`)
    return
  }

  lastNavigationButton = event.button
  lastNavigationAt = now

  if (event.button === BACK_MOUSE_BUTTON) {
    window.history.back()
    return
  }

  window.history.forward()
}

export default defineNuxtPlugin(() => {
  // Electron only emits BrowserWindow `app-command` for mouse back/forward on
  // Windows and Linux. On macOS, side mouse buttons arrive as regular DOM mouse
  // buttons instead, so handle them in the renderer without affecting browsers.
  if (!isElectronOnMacOS()) {
    return
  }

  debugMouseNavigation(`installed userAgent=${window.navigator.userAgent}`)

  window.addEventListener('mousedown', handleMouseHistoryNavigation, { capture: true })
  window.addEventListener('mouseup', handleMouseHistoryNavigation, { capture: true })
  window.addEventListener('auxclick', handleMouseHistoryNavigation, { capture: true })
  window.addEventListener('popstate', () => {
    debugMouseNavigation(`popstate historyLength=${window.history.length} url=${window.location.href}`)
  })
})
