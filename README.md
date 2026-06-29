# BetterJira! (alpha)

<img width="1294" height="894" alt="image" src="https://github.com/user-attachments/assets/76781ca7-ea70-4170-8109-a0e5b858e077" />

This is a wrapper for Jira that behaves better than JIRA and looks like.. another ... app.. with better designers. 

## Requirements

- [Bun](https://bun.sh/docs/installation)

## Install

Install Bun first: [bun.sh/docs/installation](https://bun.sh/docs/installation)

```bash
bun install
```

### Development

```bash
bun run dev
```

## Build for your OS

Install for your system below. Packaged artifacts are written to `release/` unless noted otherwise.

### macOS

Build an unpacked macOS app directory in `dist/`:

```bash
bun run app:build
```

Build a macOS DMG for your current architecture:

```bash
bun run dist:desktop:dmg
```

For architecture-specific DMG builds:

```bash
bun run dist:desktop:dmg:arm64
bun run dist:desktop:dmg:x64
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
