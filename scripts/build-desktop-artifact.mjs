#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdtemp,
  mkdir,
  readlink,
  readFile,
  readdir,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoDir = resolve(__dirname, "..");

const PLATFORM_CONFIG = {
  mac: {
    cliFlag: "--mac",
    defaultTarget: "dmg",
    supportedTargets: new Set(["dir", "dmg"]),
  },
  linux: {
    cliFlag: "--linux",
    defaultTarget: "AppImage",
    supportedTargets: new Set(["AppImage"]),
  },
  win: {
    cliFlag: "--win",
    defaultTarget: "nsis",
    supportedTargets: new Set(["nsis"]),
  },
};

const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_CONFIG));
const VALID_ARCHES = new Set(["arm64", "x64"]);
const OUTPUT_FILENAME = "BetterJira";

function fail(message) {
  throw new Error(message);
}

function detectHostPlatform() {
  if (process.platform === "darwin") return "mac";
  if (process.platform === "linux") return "linux";
  if (process.platform === "win32") return "win";
  return null;
}

function detectHostArch() {
  if (process.arch === "arm64") return "arm64";
  if (process.arch === "x64") return "x64";
  return "x64";
}

function parseBoolean(value, label) {
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  fail(`Invalid boolean for ${label}: ${value}`);
}

function parseArgs(argv) {
  const flags = {
    platform: undefined,
    target: undefined,
    arch: undefined,
    outputDir: undefined,
    skipBuild: undefined,
    keepStage: undefined,
    verbose: undefined,
  };
  const flagNameMap = {
    "--platform": "platform",
    "--target": "target",
    "--arch": "arch",
    "--output-dir": "outputDir",
    "--skip-build": "skipBuild",
    "--keep-stage": "keepStage",
    "--verbose": "verbose",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      fail(`Unexpected argument: ${token}`);
    }

    const [flagName, inlineValue] = token.split("=", 2);
    const key = flagNameMap[flagName];
    if (!key) {
      fail(`Unknown flag: ${flagName}`);
    }
    if (["skipBuild", "keepStage", "verbose"].includes(key)) {
      if (inlineValue !== undefined) {
        flags[key] = parseBoolean(inlineValue, flagName);
        continue;
      }

      const nextToken = argv[index + 1];
      if (nextToken && !nextToken.startsWith("--")) {
        flags[key] = parseBoolean(nextToken, flagName);
        index += 1;
      } else {
        flags[key] = true;
      }
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`Missing value for ${flagName}`);
    }
    flags[key] = value;
    if (inlineValue === undefined) {
      index += 1;
    }
  }

  return flags;
}

function resolveOptions(cliOptions) {
  const env = process.env;
  const hostPlatform = detectHostPlatform();
  const platform = cliOptions.platform ?? env.BETTER_JIRA_DESKTOP_PLATFORM ?? hostPlatform;
  if (!platform || !VALID_PLATFORMS.has(platform)) {
    fail(`Unsupported platform: ${String(platform)}`);
  }

  const target = cliOptions.target ?? env.BETTER_JIRA_DESKTOP_TARGET ?? PLATFORM_CONFIG[platform].defaultTarget;
  if (!PLATFORM_CONFIG[platform].supportedTargets.has(target)) {
    fail(`Unsupported target '${target}' for platform '${platform}'`);
  }

  const defaultArch = platform === "mac" ? detectHostArch() : "x64";
  const arch = cliOptions.arch ?? env.BETTER_JIRA_DESKTOP_ARCH ?? defaultArch;
  if (!VALID_ARCHES.has(arch)) {
    fail(`Unsupported arch: ${arch}`);
  }

  const outputDir = resolve(
    repoDir,
    cliOptions.outputDir ??
      env.BETTER_JIRA_DESKTOP_OUTPUT_DIR ??
      "release",
  );

  return {
    platform,
    target,
    arch,
    outputDir,
    skipBuild:
      cliOptions.skipBuild ??
      (env.BETTER_JIRA_DESKTOP_SKIP_BUILD
        ? parseBoolean(env.BETTER_JIRA_DESKTOP_SKIP_BUILD, "BETTER_JIRA_DESKTOP_SKIP_BUILD")
        : false),
    keepStage:
      cliOptions.keepStage ??
      (env.BETTER_JIRA_DESKTOP_KEEP_STAGE
        ? parseBoolean(env.BETTER_JIRA_DESKTOP_KEEP_STAGE, "BETTER_JIRA_DESKTOP_KEEP_STAGE")
        : false),
    verbose:
      cliOptions.verbose ??
      (env.BETTER_JIRA_DESKTOP_VERBOSE
        ? parseBoolean(env.BETTER_JIRA_DESKTOP_VERBOSE, "BETTER_JIRA_DESKTOP_VERBOSE")
        : false),
  };
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function buildEnv() {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === "") {
      delete env[key];
    }
  }
  env.CSC_IDENTITY_AUTO_DISCOVERY = "false";
  delete env.CSC_LINK;
  delete env.CSC_KEY_PASSWORD;
  delete env.APPLE_API_KEY;
  delete env.APPLE_API_KEY_ID;
  delete env.APPLE_API_ISSUER;
  return env;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoDir,
      env: options.env ?? process.env,
      stdio: options.verbose ? "inherit" : ["ignore", "pipe", "pipe"],
      shell: options.shell ?? process.platform === "win32",
    });

    let stderr = "";
    let stdout = "";
    if (!options.verbose) {
      child.stdout?.on("data", (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on("data", (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.once("error", (error) => {
      rejectPromise(error);
    });

    child.once("exit", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const detail = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
      rejectPromise(
        new Error(
          `Command failed (${command} ${args.join(" ")}): exit ${String(code)}${detail ? `\n${detail}` : ""}`,
        ),
      );
    });
  });
}

async function loadRootPackageJson() {
  const packageJsonPath = join(repoDir, "package.json");
  return JSON.parse(await readFile(packageJsonPath, "utf8"));
}

async function loadServerPackageJson() {
  const packageJsonPath = join(repoDir, ".output", "server", "package.json");
  return JSON.parse(await readFile(packageJsonPath, "utf8"));
}

async function ensureBuildOutputs(skipBuild, verbose) {
  if (!skipBuild) {
    log("[desktop-artifact] Building Nuxt and Electron bundles...");
    await runCommand("bun", ["run", "build:desktop"], {
      cwd: repoDir,
      env: process.env,
      verbose,
    });
  }

  for (const relativePath of ["dist-electron", ".output/server/index.mjs"]) {
    const absolutePath = join(repoDir, relativePath);
    if (!existsSync(absolutePath)) {
      fail(`Missing build output at ${absolutePath}. Run 'bun run build:desktop' first.`);
    }
  }
}

function createStagePackageJson(rootPackageJson, serverPackageJson) {
  const electronVersion = rootPackageJson.devDependencies?.electron;
  const electronBuilderVersion = rootPackageJson.devDependencies?.["electron-builder"];
  if (!electronVersion || !electronBuilderVersion) {
    fail("Could not resolve electron/electron-builder versions from root package.json.");
  }

  return {
    name: rootPackageJson.name,
    version: rootPackageJson.version,
    productName: rootPackageJson.productName,
    private: true,
    main: "dist-electron/main.cjs",
    dependencies: serverPackageJson.dependencies ?? {},
    devDependencies: {
      electron: electronVersion,
      "electron-builder": electronBuilderVersion,
    },
  };
}

async function stageApp(rootPackageJson, serverPackageJson) {
  const stageRoot = await mkdtemp(join(tmpdir(), "betterjira-desktop-stage-"));
  const stageAppDir = join(stageRoot, "app");

  await mkdir(stageAppDir, { recursive: true });
  await cp(join(repoDir, "dist-electron"), join(stageAppDir, "dist-electron"), { recursive: true });
  await cp(join(repoDir, ".output"), join(stageAppDir, ".output"), { recursive: true });
  await cp(join(repoDir, "electron", "resources"), join(stageAppDir, "electron", "resources"), {
    recursive: true,
  });
  await copyFile(join(repoDir, "electron-builder.yml"), join(stageAppDir, "electron-builder.yml"));
  const repoEnvFile = join(repoDir, ".env.local");
  if (existsSync(repoEnvFile)) {
    await copyFile(repoEnvFile, join(stageAppDir, "env.local"));
  }
  await writeFile(
    join(stageAppDir, "package.json"),
    `${JSON.stringify(createStagePackageJson(rootPackageJson, serverPackageJson), null, 2)}\n`,
  );

  return { stageRoot, stageAppDir };
}

async function installStageDependencies(stageAppDir, verbose) {
  log("[desktop-artifact] Installing stage build dependencies...");
  await runCommand("bun", ["install"], {
    cwd: stageAppDir,
    env: process.env,
    verbose,
  });
}

async function collectFiles(rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(entryPath)));
      continue;
    }
    files.push(entryPath);
  }

  return files;
}

async function copyArtifacts(sourceFiles, sourceRoot, outputDir) {
  await mkdir(outputDir, { recursive: true });
  const copiedPaths = [];

  for (const sourceFile of sourceFiles) {
    const relativePath = relative(sourceRoot, sourceFile);
    const destination = join(outputDir, relativePath);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(sourceFile, destination);
    copiedPaths.push(destination);
  }

  return copiedPaths;
}

async function findAppBundle(distDir) {
  const files = await readdir(distDir, { withFileTypes: true });
  for (const entry of files) {
    const entryPath = join(distDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith(".app")) {
        return entryPath;
      }
      const nested = await findAppBundle(entryPath);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

async function patchAndSignMacApp(appBundlePath, verbose) {
  const frameworksDir = join(appBundlePath, "Contents", "Frameworks");
  const frameworkEntries = await readdir(frameworksDir, { withFileTypes: true });
  for (const frameworkEntry of frameworkEntries) {
    if (!frameworkEntry.isDirectory() || !frameworkEntry.name.endsWith(".framework")) {
      continue;
    }

    const frameworkDir = join(frameworksDir, frameworkEntry.name);
    const frameworkChildren = await readdir(frameworkDir);
    for (const childName of frameworkChildren) {
      if (childName === "Versions") {
        continue;
      }

      const linkPath = join(frameworkDir, childName);
      try {
        await readlink(linkPath);
      } catch {
        continue;
      }

      await unlink(linkPath);
      await symlink(join("Versions", "Current", childName), linkPath);
    }
  }

  const plistPath = join(appBundlePath, "Contents", "Info.plist");
  await runCommand("plutil", ["-remove", "ElectronAsarIntegrity", plistPath], {
    cwd: dirname(appBundlePath),
    env: process.env,
    verbose,
  });
  await runCommand("codesign", ["--force", "--deep", "-s", "-", appBundlePath], {
    cwd: dirname(appBundlePath),
    env: process.env,
    verbose,
  });
}

function artifactBaseName(version, arch) {
  return `${OUTPUT_FILENAME}-${version}-${arch}`;
}

async function createMacDmg(appBundlePath, version, arch, outputDir, verbose) {
  const dmgStageDir = await mkdtemp(join(tmpdir(), "betterjira-dmg-stage-"));
  const stagedAppPath = join(dmgStageDir, basename(appBundlePath));
  const dmgPath = join(outputDir, `${artifactBaseName(version, arch)}.dmg`);
  await rm(dmgPath, { force: true });
  await mkdir(outputDir, { recursive: true });
  try {
    await cp(appBundlePath, stagedAppPath, { recursive: true, verbatimSymlinks: true });
    await runCommand("ln", ["-s", "/Applications", join(dmgStageDir, "Applications")], {
      cwd: dmgStageDir,
      env: process.env,
      verbose,
      shell: false,
    });

    await runCommand(
      "hdiutil",
      [
        "create",
        "-volname",
        OUTPUT_FILENAME,
        "-srcfolder",
        dmgStageDir,
        "-ov",
        "-format",
        "UDZO",
        dmgPath,
      ],
      {
        cwd: dmgStageDir,
        env: process.env,
        verbose,
      },
    );
    return [dmgPath];
  } finally {
    await rm(dmgStageDir, { recursive: true, force: true });
  }
}

async function copyMacDirArtifact(appBundlePath, distDir, outputDir) {
  const relativeBundlePath = relative(distDir, appBundlePath);
  const destination = join(outputDir, relativeBundlePath);
  await rm(destination, { recursive: true, force: true });
  await mkdir(dirname(destination), { recursive: true });
  await cp(appBundlePath, destination, { recursive: true, verbatimSymlinks: true });
  return [destination];
}

async function buildMacArtifact(stageAppDir, options, version) {
  log(`[desktop-artifact] Packaging mac/${options.target} (arch=${options.arch})...`);
  await runCommand(
    "bun",
    [
      "x",
      "electron-builder",
      "--config",
      "electron-builder.yml",
      "--mac",
      "--dir",
      `--${options.arch}`,
      "--publish",
      "never",
    ],
    {
      cwd: stageAppDir,
      env: buildEnv(),
      verbose: options.verbose,
    },
  );

  const distDir = join(stageAppDir, "dist");
  const appBundlePath = await findAppBundle(distDir);
  if (!appBundlePath) {
    fail(`Could not find macOS app bundle in ${distDir}`);
  }

  await patchAndSignMacApp(appBundlePath, options.verbose);

  if (options.target === "dir") {
    return copyMacDirArtifact(appBundlePath, distDir, options.outputDir);
  }

  return createMacDmg(appBundlePath, version, options.arch, options.outputDir, options.verbose);
}

async function listFinalArtifactFiles(distDir) {
  const sourceFiles = await collectFiles(distDir);
  return sourceFiles.filter((sourceFile) => {
    const relativePath = relative(distDir, sourceFile);
    const segments = relativePath.split(/[\\/]/);
    if (segments.some((segment) => segment.endsWith(".app") || segment.endsWith("-unpacked"))) {
      return false;
    }

    const extension = extname(sourceFile);
    if (!extension) {
      return false;
    }

    return true;
  });
}

async function buildPlatformArtifact(stageAppDir, options) {
  log(`[desktop-artifact] Packaging ${options.platform}/${options.target} (arch=${options.arch})...`);
  await runCommand(
    "bun",
    [
      "x",
      "electron-builder",
      "--config",
      "electron-builder.yml",
      PLATFORM_CONFIG[options.platform].cliFlag,
      options.target,
      `--${options.arch}`,
      "--publish",
      "never",
    ],
    {
      cwd: stageAppDir,
      env: buildEnv(),
      verbose: options.verbose,
    },
  );

  const distDir = join(stageAppDir, "dist");
  const sourceFiles = await listFinalArtifactFiles(distDir);
  if (sourceFiles.length === 0) {
    fail(`Build completed but no artifacts were produced in ${distDir}`);
  }

  return copyArtifacts(sourceFiles, distDir, options.outputDir);
}

async function main() {
  const options = resolveOptions(parseArgs(process.argv.slice(2)));
  const rootPackageJson = await loadRootPackageJson();

  await ensureBuildOutputs(options.skipBuild, options.verbose);
  const serverPackageJson = await loadServerPackageJson();
  const { stageRoot, stageAppDir } = await stageApp(rootPackageJson, serverPackageJson);

  try {
    await installStageDependencies(stageAppDir, options.verbose);

    const copiedArtifacts =
      options.platform === "mac"
        ? await buildMacArtifact(stageAppDir, options, rootPackageJson.version)
        : await buildPlatformArtifact(stageAppDir, options);

    log("[desktop-artifact] Done. Artifacts:");
    for (const artifactPath of copiedArtifacts) {
      log(`  ${artifactPath}`);
    }

    if (options.keepStage) {
      log(`[desktop-artifact] Kept stage at ${stageRoot}`);
    }
  } finally {
    if (!options.keepStage) {
      await rm(stageRoot, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
