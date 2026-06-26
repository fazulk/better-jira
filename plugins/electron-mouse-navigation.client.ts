const BACK_MOUSE_BUTTON = 3
const FORWARD_MOUSE_BUTTON = 4

function isElectronOnMacOS(): boolean {
  const userAgent = window.navigator.userAgent

  return userAgent.includes('Electron/') && userAgent.includes('Mac OS X')
}

function handleMouseHistoryNavigation(event: MouseEvent): void {
  if (event.button !== BACK_MOUSE_BUTTON && event.button !== FORWARD_MOUSE_BUTTON) {
    return
  }

  event.preventDefault()
  event.stopPropagation()

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

  window.addEventListener('mouseup', handleMouseHistoryNavigation, { capture: true })
})
