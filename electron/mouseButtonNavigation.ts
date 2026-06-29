import { createRequire } from 'node:module'
import { join } from 'node:path'
import process from 'node:process'

// Bridges the native macOS mouse back/forward monitor (dist-electron/mouse-nav.node)
// into the main process. macOS doesn't deliver mouse buttons 4/5 to web contents
// or as `app-command`, so this native NSEvent local monitor is the only way to
// observe them. On Windows/Linux the buttons arrive as `app-command` events that
// main.ts handles directly, so this is a no-op there.

interface MouseNavAddon {
  start: (callback: (button: number) => void) => void
  stop: () => void
}

// NSEvent.buttonNumber: 3 = back (M4), 4 = forward (M5).
const BACK_BUTTON = 3
const FORWARD_BUTTON = 4

let addon: MouseNavAddon | null = null

export function installMouseButtonNavigation(
  onNavigate: (direction: 'back' | 'forward') => void,
  log: (message: string) => void,
): void {
  if (process.platform !== 'darwin') {
    return
  }

  const nodeRequire = createRequire(import.meta.url)
  try {
    addon = nodeRequire(join(__dirname, 'mouse-nav.node')) as MouseNavAddon
  }
  catch (err) {
    log(`mouse-nav addon unavailable: ${String(err)}`)
    return
  }

  addon.start((button) => {
    log(`mouse-button raw=${button}`)
    if (button === BACK_BUTTON) {
      onNavigate('back')
      return
    }
    if (button === FORWARD_BUTTON) {
      onNavigate('forward')
    }
  })

  log('mouse-nav addon installed')
}

export function stopMouseButtonNavigation(): void {
  addon?.stop()
  addon = null
}
