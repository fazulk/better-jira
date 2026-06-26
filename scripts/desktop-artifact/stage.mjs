import { existsSync } from 'node:fs'
import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { runCommand } from './command.mjs'
import { fail, log, repoDir } from './config.mjs'

export async function loadRootPackageJson() {
  const packageJsonPath = join(repoDir, 'package.json')
  return JSON.parse(await readFile(packageJsonPath, 'utf8'))
}

export async function loadServerPackageJson() {
  const packageJsonPath = join(repoDir, '.output', 'server', 'package.json')
  return JSON.parse(await readFile(packageJsonPath, 'utf8'))
}

export async function ensureBuildOutputs(skipBuild, verbose) {
  if (!skipBuild) {
    log('[desktop-artifact] Building Nuxt and Electron bundles...')
    await runCommand('bun', ['run', 'build:desktop'], {
      cwd: repoDir,
      env: process.env,
      verbose,
    })
  }

  for (const relativePath of ['dist-electron', '.output/server/index.mjs']) {
    const absolutePath = join(repoDir, relativePath)
    if (!existsSync(absolutePath)) {
      fail(`Missing build output at ${absolutePath}. Run 'bun run build:desktop' first.`)
    }
  }
}

function createStagePackageJson(rootPackageJson, serverPackageJson) {
  const electronVersion = rootPackageJson.devDependencies?.electron
  const electronBuilderVersion = rootPackageJson.devDependencies?.['electron-builder']
  if (!electronVersion || !electronBuilderVersion) {
    fail('Could not resolve electron/electron-builder versions from root package.json.')
  }

  return {
    name: rootPackageJson.name,
    version: rootPackageJson.version,
    productName: rootPackageJson.productName,
    private: true,
    main: 'dist-electron/main.cjs',
    dependencies: serverPackageJson.dependencies ?? {},
    devDependencies: {
      'electron': electronVersion,
      'electron-builder': electronBuilderVersion,
    },
  }
}

export async function stageApp(rootPackageJson, serverPackageJson) {
  const stageRoot = await mkdtemp(join(tmpdir(), 'betterjira-desktop-stage-'))
  const stageAppDir = join(stageRoot, 'app')

  await mkdir(stageAppDir, { recursive: true })
  await cp(join(repoDir, 'dist-electron'), join(stageAppDir, 'dist-electron'), { recursive: true })
  await cp(join(repoDir, '.output'), join(stageAppDir, '.output'), { recursive: true })
  await cp(join(repoDir, 'electron', 'resources'), join(stageAppDir, 'electron', 'resources'), {
    recursive: true,
  })
  await copyFile(join(repoDir, 'electron-builder.yml'), join(stageAppDir, 'electron-builder.yml'))
  const repoEnvFile = join(repoDir, '.env.local')
  if (existsSync(repoEnvFile)) {
    await copyFile(repoEnvFile, join(stageAppDir, 'env.local'))
  }
  await writeFile(
    join(stageAppDir, 'package.json'),
    `${JSON.stringify(createStagePackageJson(rootPackageJson, serverPackageJson), null, 2)}\n`,
  )

  return { stageRoot, stageAppDir }
}

export async function installStageDependencies(stageAppDir, verbose) {
  log('[desktop-artifact] Installing stage build dependencies...')
  await runCommand('bun', ['install'], {
    cwd: stageAppDir,
    env: process.env,
    verbose,
  })
}
