# Atrium

Atrium is an Electron desktop companion for Claude Code and Codex sessions. It listens for local hook events, tracks session state, and renders active sessions as live stickies on a tldraw canvas so work can be organized spatially.

## Features

- Live canvas view for Claude Code and Codex sessions.
- Custom tldraw session stickies with state, recent activity, working directory, and timestamps.
- Local Fastify hook server on `127.0.0.1:21517`.
- SQLite persistence for session metadata.
- tldraw persistence for canvas layout, positions, and notes.
- Brainstorm panel for capturing notes alongside sessions.
- Tray/menu bar lifecycle on macOS.

## Requirements

- Node.js and npm.
- Python 3 for the hook script.
- Claude Code and/or Codex if you want live session events.

macOS is the current packaging target in `electron-builder.yml`.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the app in development mode:

```bash
npm run dev
```

The app starts an Electron window and a local hook server. On boot, Atrium also installs its hook script for Claude Code and Codex so future sessions can appear on the canvas automatically.

## Important Hook Behavior

Running Atrium installs `hooks/atrium-hook.py` into:

- `~/.claude/hooks/atrium-hook.py`
- `~/.codex/hooks/atrium-hook.py`

It also updates user-level hook configuration:

- `~/.claude/settings.json`
- `~/.codex/hooks.json`
- `~/.codex/config.toml`

The Codex installer enables `[features].codex_hooks = true`. Existing hook entries are intended to be preserved, but changes to `src/main/hook-installer.ts` should be made carefully because it writes to user-level tool configuration.

## Scripts

```bash
npm run dev        # Start Electron in development mode with renderer HMR
npm run typecheck  # Typecheck main/preload/shared and renderer/shared configs
npm run build      # Typecheck and build with electron-vite
npm run package    # Build and create an unpacked app in release/
npm run dist       # Build and create macOS distributables
```

No test runner is configured yet. Use `npm run typecheck` for the current validation pass.

## Architecture

Atrium is split across the standard Electron processes:

- `src/main/` owns the app lifecycle, tray, HTTP hook server, SQLite store, session state machine, and IPC handlers.
- `src/preload/` exposes a typed `window.api` bridge to the renderer.
- `src/renderer/` contains the React and tldraw UI.
- `src/shared/` contains shared types and constants used by all processes.
- `hooks/` contains the Python hook script that posts events into Atrium.

Session data flows through the app like this:

```text
Claude Code / Codex hook events
  -> hooks/atrium-hook.py
  -> POST http://127.0.0.1:21517/hook
  -> src/main/http-server.ts
  -> src/main/session-machine.ts
  -> src/main/session-store.ts
  -> IPC session updates
  -> src/renderer/src/hooks/useSessionUpdates.ts
  -> tldraw session-sticky shapes
```

## Local Hook API

Health check:

```bash
curl http://127.0.0.1:21517/health
```

Manual test event:

```bash
curl -X POST http://127.0.0.1:21517/hook \
  -H 'Content-Type: application/json' \
  -d '{"event":"SessionStart","sessionId":"manual-test","cwd":"/tmp"}'
```

If Atrium is running, the manual event should create or update a session sticky on the canvas.

## Session States

Sessions move through these states:

```text
running -> awaiting_input -> idle
```

A running or awaiting session becomes `stale` after 10 minutes without hook events.

## Data Storage

Session metadata is stored in SQLite at Electron's `app.getPath('userData')` location as `atrium.db`. Canvas layout is managed by tldraw using the renderer persistence key `atrium-canvas`.

## Adding Custom Shapes

Custom tldraw shapes live in `src/renderer/src/shapes/`. To add another shape, create a shape folder with:

- a shape type definition,
- a `ShapeUtil` implementation,
- a React component,
- and an export from `src/renderer/src/shapes/index.ts`.

The existing session sticky implementation is in `src/renderer/src/shapes/session-sticky/`.
