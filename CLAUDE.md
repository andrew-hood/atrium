# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Atrium

Atrium is an Electron desktop app that visualizes active Claude Code and Codex sessions on a tldraw canvas. A Python hook (`hooks/atrium-hook.py`) is installed into `~/.claude/hooks/` and `~/.codex/hooks/`, then registered with each tool's global hook config. The hook fires on lifecycle events (SessionStart, PreToolUse, PostToolUse, PermissionRequest, Stop, UserPromptSubmit, SessionEnd where supported). It POSTs to a local Fastify HTTP server (port 21517) inside the Electron main process, which feeds a state machine that tracks session state and persists it to SQLite. The renderer displays each session as a custom tldraw "session-sticky" shape that updates in real time via IPC.

## Commands

```bash
npm run dev          # Start in dev mode (electron-vite dev, hot-reloads renderer)
npm run build        # Typecheck then build (electron-vite build)
npm run typecheck    # Run both tsconfigs: tsconfig.node.json (main/preload/shared) + tsconfig.web.json (renderer/shared)
npm run package      # Build + package into unpacked app (release/ dir)
npm run dist         # Build + create distributable (dmg/zip on macOS)
```

No test runner is configured yet.

## Architecture

Three Electron processes, built by electron-vite:

- **Main** (`src/main/`) — boots the app, manages tray, runs the Fastify HTTP server and session state machine. Entry: `index.ts`.
- **Preload** (`src/preload/`) — bridges `AtriumAPI` to the renderer via `contextBridge`. The renderer calls `window.api.*`.
- **Renderer** (`src/renderer/`) — React + tldraw canvas. Custom shapes live in `src/renderer/src/shapes/`.

Shared types between all three processes live in `src/shared/types.ts`.

### Data flow

```
Claude Code / Codex hook events
  → Python hook (hooks/atrium-hook.py) POSTs JSON to localhost:21517/hook
  → HookHttpServer (http-server.ts) normalizes payload
  → SessionMachine (session-machine.ts) computes state transitions, persists via SessionStore
  → SessionStore (session-store.ts) upserts to SQLite (better-sqlite3, WAL mode)
  → IPC broadcast to renderer
  → useSessionUpdates hook creates/updates tldraw shapes
```

### Session states

`running` → `awaiting_input` → `idle` (or `stale` after 10 min silence, `errored`)

### Hook installation

`hook-installer.ts` copies the Python hook to `~/.claude/hooks/` and `~/.codex/hooks/`, then registers it in `~/.claude/settings.json` and `~/.codex/hooks.json` on app boot. It also enables Codex's `[features].codex_hooks` flag in `~/.codex/config.toml`. This modifies user-level Claude Code and Codex settings — be careful when changing this code.

## TypeScript config

Strict mode with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` enabled. Two tsconfig files:
- `tsconfig.node.json` — main + preload + shared (Node/Electron types)
- `tsconfig.web.json` — renderer + shared (DOM types, react-jsx)

## Custom tldraw shapes

To add a new shape: create a folder under `src/renderer/src/shapes/`, define the shape type (Shape.ts), util class extending `ShapeUtil` (Util.tsx), and component (Component.tsx). Register the util in `src/renderer/src/shapes/index.ts`.
