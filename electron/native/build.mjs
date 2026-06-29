// Builds the native macOS mouse back/forward monitor and drops the compiled
// `.node` next to the bundled Electron main process (dist-electron/), which the
// packaging pipeline copies verbatim and ad-hoc code-signs.
//
// The addon is a Node-API module, so a single build with the system Node loads
// unchanged in Electron's main process — no electron-rebuild step required.
//
// macOS only: on other platforms the side buttons arrive as `app-command`
// events that main.ts already handles, so there's nothing to build.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const repoDir = join(here, '..', '..')
const nativeDir = join(here, 'mouse-nav')
const distElectronDir = join(repoDir, 'dist-electron')
const builtAddon = join(nativeDir, 'build', 'Release', 'mouse_nav.node')
const destAddon = join(distElectronDir, 'mouse-nav.node')

if (process.platform !== 'darwin') {
  console.warn('[native] skipping mouse-nav addon build (macOS only)')
  process.exit(0)
}

const require = createRequire(import.meta.url)
const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js')

console.warn('[native] building mouse-nav addon...')
execFileSync(process.execPath, [nodeGyp, 'rebuild'], {
  cwd: nativeDir,
  stdio: 'inherit',
  env: process.env,
})

if (!existsSync(builtAddon)) {
  throw new Error(`[native] expected build output missing: ${builtAddon}`)
}

mkdirSync(distElectronDir, { recursive: true })
copyFileSync(builtAddon, destAddon)
console.warn(`[native] mouse-nav addon -> ${destAddon}`)
