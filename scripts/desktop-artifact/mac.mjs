import { cp, mkdir, mkdtemp, readdir, readlink, rm, symlink, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative } from 'node:path'
import process from 'node:process'
import { buildEnv, runCommand } from './command.mjs'
import { fail, log, OUTPUT_FILENAME } from './config.mjs'

async function findAppBundle(distDir) {
  const files = await readdir(distDir, { withFileTypes: true })
  for (const entry of files) {
    const entryPath = join(distDir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) {
        return entryPath
      }
      const nested = await findAppBundle(entryPath)
      if (nested) {
        return nested
      }
    }
  }

  return null
}

async function patchAndSignMacApp(appBundlePath, verbose) {
  const frameworksDir = join(appBundlePath, 'Contents', 'Frameworks')
  const frameworkEntries = await readdir(frameworksDir, { withFileTypes: true })
  for (const frameworkEntry of frameworkEntries) {
    if (!frameworkEntry.isDirectory() || !frameworkEntry.name.endsWith('.framework')) {
      continue
    }

    const frameworkDir = join(frameworksDir, frameworkEntry.name)
    const frameworkChildren = await readdir(frameworkDir)
    for (const childName of frameworkChildren) {
      if (childName === 'Versions') {
        continue
      }

      const linkPath = join(frameworkDir, childName)
      try {
        await readlink(linkPath)
      }
      catch {
        continue
      }

      await unlink(linkPath)
      await symlink(join('Versions', 'Current', childName), linkPath)
    }
  }

  const plistPath = join(appBundlePath, 'Contents', 'Info.plist')
  await runCommand('plutil', ['-remove', 'ElectronAsarIntegrity', plistPath], {
    cwd: dirname(appBundlePath),
    env: process.env,
    verbose,
  })
  await runCommand('codesign', ['--force', '--deep', '-s', '-', appBundlePath], {
    cwd: dirname(appBundlePath),
    env: process.env,
    verbose,
  })
}

function artifactBaseName(version, arch) {
  return `${OUTPUT_FILENAME}-${version}-${arch}`
}

async function createMacDmg(appBundlePath, version, arch, outputDir, verbose) {
  const dmgStageDir = await mkdtemp(join(tmpdir(), 'betterjira-dmg-stage-'))
  const stagedAppPath = join(dmgStageDir, basename(appBundlePath))
  const dmgPath = join(outputDir, `${artifactBaseName(version, arch)}.dmg`)
  await rm(dmgPath, { force: true })
  await mkdir(outputDir, { recursive: true })
  try {
    await cp(appBundlePath, stagedAppPath, { recursive: true, verbatimSymlinks: true })
    await runCommand('ln', ['-s', '/Applications', join(dmgStageDir, 'Applications')], {
      cwd: dmgStageDir,
      env: process.env,
      verbose,
      shell: false,
    })

    await runCommand(
      'hdiutil',
      [
        'create',
        '-volname',
        OUTPUT_FILENAME,
        '-srcfolder',
        dmgStageDir,
        '-ov',
        '-format',
        'UDZO',
        dmgPath,
      ],
      {
        cwd: dmgStageDir,
        env: process.env,
        verbose,
      },
    )
    return [dmgPath]
  }
  finally {
    await rm(dmgStageDir, { recursive: true, force: true })
  }
}

async function copyMacDirArtifact(appBundlePath, distDir, outputDir) {
  const relativeBundlePath = relative(distDir, appBundlePath)
  const destination = join(outputDir, relativeBundlePath)
  await rm(destination, { recursive: true, force: true })
  await mkdir(dirname(destination), { recursive: true })
  await cp(appBundlePath, destination, { recursive: true, verbatimSymlinks: true })
  return [destination]
}

export async function buildMacArtifact(stageAppDir, options, version) {
  log(`[desktop-artifact] Packaging mac/${options.target} (arch=${options.arch})...`)
  await runCommand(
    'bun',
    [
      'x',
      'electron-builder',
      '--config',
      'electron-builder.yml',
      '--mac',
      '--dir',
      `--${options.arch}`,
      '--publish',
      'never',
    ],
    {
      cwd: stageAppDir,
      env: buildEnv(),
      verbose: options.verbose,
    },
  )

  const distDir = join(stageAppDir, 'dist')
  const appBundlePath = await findAppBundle(distDir)
  if (!appBundlePath) {
    fail(`Could not find macOS app bundle in ${distDir}`)
  }

  await patchAndSignMacApp(appBundlePath, options.verbose)

  if (options.target === 'dir') {
    return copyMacDirArtifact(appBundlePath, distDir, options.outputDir)
  }

  return createMacDmg(appBundlePath, version, options.arch, options.outputDir, options.verbose)
}
