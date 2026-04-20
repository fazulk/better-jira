# AGENTS.md

The role of this file is to describe common mistakes and confusion points that agents might encounter as they work in this project. If you ever encounter something in the project that surprises you, please alert the developer working with you and indicate that this is the case in the AgentMD file to help prevent future agents from having the same issue. Always ask the developer before modifying this file.

- No `any` types - Do not use `any` or `as any` casting
- Avoid using `as` for type assertions, instead use more specific types or interfaces to ensure type safety.
- Don't run type-check or tests until the work is complete first, also verify with the dev that work is complete and to run those.
- Client-side API requests should go through Vue Query (`useQuery`, `useMutation`, or `queryClient` query helpers) rather than ad hoc component-level `fetch` calls. If a request intentionally bypasses Vue Query, document why in the change.

## Launching the app

The Swift menu-bar launcher (`BetterJira Dev.command` + `macos/BetterJiraDevMenu/`) has been replaced by an Electron wrapper.

- **Run the packaged app:** `bun run app:build` once, then launch from Spotlight, the Dock, or Finder. Drag `dist/mac-arm64/BetterJira.app` to `/Applications` for a permanent install.
- The Electron main process lives in `electron/main.ts`. The packaged `.app` hard-codes `REPO_DIR = "/Users/jeff.f/webz/jira2"` and spawns `bun run dev` at that path — if the repo is moved, the `.app` must be rebuilt.
- Startup diagnostics go to `/tmp/BetterJira-logs/main.log` (also stdout). Useful when the packaged app refuses to boot.
- **Gotcha — `ELECTRON_RUN_AS_NODE`:** launching the app from a terminal that's itself running inside an Electron-based tool (Claude Code, VS Code's integrated terminal, Cursor, …) inherits `ELECTRON_RUN_AS_NODE=1`, which makes Electron start in plain-Node mode — no window, silent exit, log shows `process.type=undefined`. Fix for manual terminal launches: `env -u ELECTRON_RUN_AS_NODE open /Applications/BetterJira.app`. Spotlight / Dock / Finder launches are unaffected. The `app:dev` script already strips this env before spawning Electron.
