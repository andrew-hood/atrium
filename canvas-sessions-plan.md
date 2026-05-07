# Canvas Sessions — v1 Plan

A spatial companion for Claude Code. Sessions are driven from the terminal as usual; the canvas observes them, gives them a home, and provides a thinking space alongside them.

## Concept

The terminal stays the primary interface for Claude Code. Nothing changes about how sessions get started — `claude` in a project directory, interactive as always.

What's new is the canvas. When a session starts, it appears as a sticky on the board. As the agent works, the sticky reflects state. The user can drop brainstorm stickies anywhere on the canvas to capture thoughts that come up mid-session — and attach them to a session sticky to feed into the next turn.

Position on the canvas is user-defined. The app does not prescribe what "left," "right," "grouped," or "near" mean. Users impose their own structure — by project, by stage (build/test/review), by priority, by branch of thinking — and the app stays out of the way.

The canvas is the durable artifact. Sessions come and go; the layout the user organized for themselves accumulates meaning over time and doubles as a retro surface.

## Core Loop

1. **Start a session in the terminal** — `claude` in a project, business as usual
2. **Sticky appears on the canvas** — hooks announce the session, it lands somewhere on the board
3. **User organizes** — drag the sticky into a zone, group it with related sessions, whatever fits
4. **Observe** — sticky updates as the agent works (running, awaiting input, idle)
5. **Capture thoughts** — drop brainstorm stickies during the session, attach them to a session sticky to inject as context next turn
6. **Continue or close** — driven from the terminal; the canvas just reflects state
7. **Reflect** — completed sessions persist on the canvas; the layout becomes a retro surface

## Architecture

Single Electron app, two processes, hooks talking in via local HTTP.

### Renderer process — Canvas UI
- tldraw + React
- Renders brainstorm stickies and session stickies (custom shape)
- Owns spatial layout and board persistence (tldraw's built-in store)
- Receives state updates from main process via IPC and updates session stickies
- Sends commands to main process via IPC: `attach_thoughts` (push selected brainstorm sticky text into a session's next-turn context)
- Knows nothing about Claude Code internals — only session IDs and state objects

### Main process — Session Manager
- Long-running Node daemon, lives as long as the app does
- Receives hook events via local HTTP server (`localhost:<port>`)
- Maintains a state machine per session, keyed by Claude Code session ID
- Auto-creates a sticky on the canvas when a previously unseen session ID emits its first event
- Persists session metadata in SQLite (`better-sqlite3`)
- Pushes state updates to renderer via IPC
- Handles heartbeat / staleness detection
- Source of truth for session state

### Hook scripts
- Small standalone scripts shipped inside the app bundle
- Registered in user's global Claude Code settings on first run (mirroring the ClaudeBrew pattern)
- Fire on `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`, `SessionEnd`
- POST event payloads to `localhost:<port>` with session ID, working directory, and metadata
- Dumb event emitters — all interpretation happens in the manager

### Thought injection
- User selects one or more brainstorm stickies, drags onto a session sticky (or right-click → attach)
- Renderer sends `attach_thoughts` to main with session ID + sticky text
- Main writes the text into a known location the session can read on next turn — most likely a project-local file (e.g. `.claude/canvas-thoughts.md`) that the user can reference, or a hook-driven `UserPromptSubmit` augmentation
- Exact mechanism depends on hook capabilities — needs the spike to confirm. Fallback: copy to clipboard so the user can paste it themselves.

### App lifecycle
- Lives in menu bar / tray
- Closing the canvas window does not quit the app
- Daemon keeps running, sessions keep being tracked
- Reopening the window restores the canvas view onto live state

## Session State Machine

States:
- `running` — agent actively working (tool use events firing)
- `awaiting_input` — `Stop` hook fired, waiting on user
- `idle` — `SessionEnd` fired or session closed cleanly
- `errored` — process exited non-zero or unrecoverable error
- `stale` — no events for N minutes, process status unknown

Transitions are driven by hook events plus timers. Time-in-state is tracked and surfaced on the sticky (e.g. "Awaiting input · 12m"). The "awaiting input" state is the money state — that's the visual signal users will look for at a glance.

## Sticky Types

### Brainstorm sticky
Plain text, user-coloured, draggable. Standard tldraw note shape. Free-floating thoughts the user wants to capture. Can be attached to a session sticky to inject as context.

### Session sticky
Custom tldraw shape. Auto-created when a new session ID is detected. Shows:
- Session label (derived from working directory or first user prompt; user can rename)
- Current state (with colour and time-in-state)
- Last action summary (e.g. "Editing auth.ts")
- Working directory (truncated)
- Action buttons: open transcript, mark closed, delete

The sticky lands at a default canvas position on creation; user drags it wherever it belongs.

## v1 Scope — In

- tldraw canvas with brainstorm stickies and persistent board
- Custom session sticky shape with status rendering
- Auto-detection of new sessions from hook events — sticky appears on the canvas when a session ID is first seen
- Main-process daemon with state machine, SQLite persistence, local HTTP server for hooks
- Hook scripts registered globally on first run, mirroring ClaudeBrew's setup approach
- Session lifecycle observed end-to-end: start, working, awaiting input, idle, errored, stale
- Heartbeat / staleness detection
- Menu bar app — window close does not quit
- Transcript viewer (separate window or panel) for each session
- Reconnect on app restart — read existing sessions from SQLite, reconcile with running processes
- Brainstorm stickies and a basic "attach to session" flow for thought injection (mechanism pending hook spike)

## v1 Scope — Out (deferred to v2)

- Spawning sessions from the canvas (project dir picker, prompt construction, interactive PTY in the app — all real work, none of it needed yet)
- Multi-canvas / multi-board support (one board for v1)
- Spatial semantics enforced by the app (zones, auto-layout)
- Session output landing back on the canvas as new stickies (summaries are hard, defer)
- Multi-session coordination / file conflict detection
- Cloud sync, multi-device, sharing
- Mobile companion (ClaudeBrew already covers the away-from-desk case)
- AI-assisted brainstorming (sessions that contribute stickies back)
- Cross-session retro views or analytics

## Risks & Open Questions

- **Hook coverage spike** — before committing, verify Claude Code hooks reliably distinguish "working" from "awaiting input," and confirm `SessionStart` gives enough metadata (session ID, cwd, model) to bootstrap a sticky without needing the user to do anything. Highest-priority unknown. Half a day.
- **Thought injection mechanism** — the cleanest version of "attach this sticky to the session" depends on what hooks let you do. If `UserPromptSubmit` can read from a file the canvas writes, that's elegant. If not, falling back to clipboard or a manual `@.claude/canvas-thoughts.md` reference is fine for v1. Confirm during the spike.
- **Hook config registration** — ClaudeBrew's pattern of writing into global settings works; need to make sure first-run setup is idempotent and doesn't trample existing user hooks.
- **Process death without notice** — heartbeat covers most cases; edge cases (machine sleep, force-quit) need staleness detection plus a manual "mark as closed" affordance on the sticky.
- **Sticky as session vs. snapshot** — going with sticky-as-view-of-session. History lives in the transcript viewer, not on the canvas. Keeps the canvas uncluttered.
- **Default sticky placement** — where does a new session sticky appear? Probably near the cursor / centre of viewport, with a nudge if it would overlap an existing sticky. Minor but it'll feel bad if done wrong.

## Build Order

1. Hook coverage spike (half day) — confirm signal quality and `SessionStart` payload before anything else
2. Electron skeleton with menu bar lifecycle (half day)
3. Local HTTP server in main + a single hook script POSTing events (half day)
4. State machine + SQLite persistence (1 day)
5. tldraw renderer with custom session shape (1 day)
6. IPC wiring: state updates rendering on sticky, auto-creation on new session ID (1 day)
7. Brainstorm stickies + attach-to-session thought injection (half day)
8. Transcript viewer (half day)
9. Heartbeat + staleness detection + reconcile-on-restart (1 day)
10. First-run hook registration (half day)
11. Polish, dogfood for a week, fix what hurts

Roughly 6–7 days of focused work for a usable v1. (Slightly less than the previous scope — dropping spawn-from-canvas removes the prompt construction and edit-before-spawn work.)

## Stack Notes

- Electron + electron-builder for packaging
- React + tldraw for the canvas
- `better-sqlite3` for session persistence
- `fastify` or just node `http` for the hook listener (small surface, no need for Express)
- Existing ClaudeBrew patterns for hook registration and process supervision

## Naming

TBD. Working name: Canvas Sessions. Open to something punchier — the brewing/coffee theme worked for ClaudeBrew, the lab notebook theme worked for AIpril. Worth a separate naming pass once the v1 is closer.
