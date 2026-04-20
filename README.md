# BetterJira (alpha)

This is a wrapper for Jira that behaves better than the JIRA app.

## Requirements

- [Bun](https://bun.sh/docs/installation)

## Install

Install Bun first: [bun.sh/docs/installation](https://bun.sh/docs/installation)

```bash
bun install
```

Install for your system below, then go to `release/` directory and run the app.

### macOS


```bash
bun run app:build
```

### Linux


```bash
bun run dist:desktop:linux
```

### Windows

Build a Windows desktop artifact:

```powershell
bun run dist:desktop:win
```

For architecture-specific builds:

```powershell
bun run dist:desktop:win:x64
bun run dist:desktop:win:arm64
```
