#!/usr/bin/env node

/**
 * Copies `.env.local` into the current worktree.
 *
 * Default behavior is intentionally strict: it only reads from the repository's
 * `main` worktree so feature worktrees inherit the shared local env from the
 * main checkout instead of another feature branch. Use `--source` to override
 * that source explicitly when needed.
 */

import { copyFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

function usage() {
  console.log(`Usage: yarn setup:env-local [--force] [--source SOURCE]

Copy .env.local into the current git worktree.

Options:
  -f, --force  Overwrite an existing .env.local in the current worktree.
  -s, --source Source .env.local file or worktree directory.
  -h, --help   Show this help text.

Without --source, the script only checks the repository's main worktree.`);
}

function runGit(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

const args = process.argv.slice(2);
let force = false;
let sourceInput = '';

for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];

  if (arg === '-f' || arg === '--force') {
    force = true;
    continue;
  }

  if (arg === '-s' || arg === '--source') {
    const nextArg = args[index + 1];

    if (!nextArg) {
      console.error(`Missing value for ${arg}\n`);
      usage();
      process.exit(1);
    }

    if (sourceInput) {
      console.error('Source may only be specified once.\n');
      usage();
      process.exit(1);
    }

    sourceInput = nextArg;
    index += 1;
    continue;
  }

  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  }

  console.error(`Unexpected argument: ${arg}\n`);
  usage();
  process.exit(1);
}

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);

let currentWorktree = '';
try {
  currentWorktree = runGit(scriptDir, ['rev-parse', '--show-toplevel']);
} catch {
  console.error('This script must be run from a git worktree for this repository.');
  process.exit(1);
}

const targetFile = path.join(currentWorktree, '.env.local');

if (existsSync(targetFile) && !force) {
  console.error(`.env.local already exists at ${targetFile}`);
  console.error('Use --force to overwrite it.');
  process.exit(0);
}

let sourceFile = '';
const checkedSources = [];

if (sourceInput) {
  const resolvedSource = path.resolve(sourceInput);
  sourceFile =
    existsSync(resolvedSource) && statSync(resolvedSource).isDirectory()
      ? path.join(resolvedSource, '.env.local')
      : resolvedSource;

  checkedSources.push(sourceFile);

  if (!existsSync(sourceFile)) {
    console.error(`No .env.local found at ${sourceFile}`);
    process.exit(1);
  }
} else {
  const worktreeOutput = runGit(scriptDir, ['worktree', 'list', '--porcelain']);
  const worktreeEntries = [];
  let activeEntry = null;

  for (const line of worktreeOutput.split('\n')) {
    if (line.startsWith('worktree ')) {
      activeEntry = {
        branch: '',
        path: line.slice('worktree '.length)
      };
      worktreeEntries.push(activeEntry);
      continue;
    }

    if (line.startsWith('branch ') && activeEntry) {
      activeEntry.branch = line.slice('branch '.length);
    }
  }

  const mainWorktree = worktreeEntries.find(
    (entry) => entry.branch === 'refs/heads/main'
  );

  if (mainWorktree) {
    sourceFile = path.join(mainWorktree.path, '.env.local');
    checkedSources.push(sourceFile);
  }

  if (!sourceFile || !existsSync(sourceFile)) {
    console.error('Could not find .env.local in the main worktree.');
    if (checkedSources.length > 0) {
      console.error('Checked:');
      for (const checkedSource of checkedSources) {
        console.error(`  ${checkedSource}`);
      }
    }
    console.error(
      'Pass a source path explicitly: yarn setup:env-local -- --source /path/to/.env.local'
    );
    process.exit(1);
  }
}

sourceFile = path.resolve(sourceFile);

if (sourceFile === targetFile) {
  console.log(`Source and target are the same file: ${targetFile}`);
  process.exit(0);
}

copyFileSync(sourceFile, targetFile);
console.log(`Copied ${sourceFile} -> ${targetFile}`);
