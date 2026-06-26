import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
export const repoDir = resolve(scriptDir, "..", "..");

export const PLATFORM_CONFIG = {
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

export const VALID_PLATFORMS = new Set(Object.keys(PLATFORM_CONFIG));
export const VALID_ARCHES = new Set(["arm64", "x64"]);
export const OUTPUT_FILENAME = "BetterJira";

export function fail(message) {
  throw new Error(message);
}

export function log(message) {
  process.stdout.write(`${message}\n`);
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

export function parseArgs(argv) {
  const flags = {
    platform: undefined,
    target: undefined,
    arch: undefined,
    outputDir: undefined,
    skipBuild: undefined,
    keepStage: undefined,
    verbose: undefined,
    open: undefined,
  };
  const flagNameMap = {
    "--platform": "platform",
    "--target": "target",
    "--arch": "arch",
    "--output-dir": "outputDir",
    "--skip-build": "skipBuild",
    "--keep-stage": "keepStage",
    "--verbose": "verbose",
    "--open": "open",
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
    if (["skipBuild", "keepStage", "verbose", "open"].includes(key)) {
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

export function resolveOptions(cliOptions) {
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
    open:
      cliOptions.open ??
      (env.BETTER_JIRA_DESKTOP_OPEN
        ? parseBoolean(env.BETTER_JIRA_DESKTOP_OPEN, "BETTER_JIRA_DESKTOP_OPEN")
        : false),
  };
}
