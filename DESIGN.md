# Design

Atrium is a spatial session console for people running multiple Claude Code and Codex sessions at once. Its job is to make parallel agent work visible, triageable, and recoverable without turning the app into another chat client or task manager.

## Product Principles

- **Show work as objects.** A session should feel like a live object on the canvas, not a row in a log. Users should be able to move it, group it, annotate it, and come back to it.
- **Make attention obvious.** Waiting, running, errored, stale, and closed sessions must be visually distinct at a glance. The app should bias toward surfacing sessions that need human attention.
- **Keep the canvas primary.** Panels support navigation and detail work, but the canvas remains the source of spatial organization.
- **Preserve user arrangement.** Automatic updates should refresh session content without disturbing manually arranged stickies.
- **Prefer local control.** Atrium listens to local hook events, persists local state, and exposes actions that help the user return to their existing terminal or project context.

## Core Experience

The main screen is a tldraw canvas containing custom session stickies. Each sticky represents one Claude Code or Codex session and summarizes:

- provider,
- session title,
- project path,
- state,
- latest action,
- recent prompt,
- latest response excerpt,
- notes,
- timestamps.

The side panel provides an operational list for scanning and triage. It should remain dense, calm, and optimized for repeated use. The detail panel appears for the selected session and supports deeper inspection, notes, opening context, and sending input when a session is awaiting input.

## Information Architecture

Atrium has three primary UI surfaces:

- **Canvas:** spatial organization, visual grouping, stickies, freeform notes, and tldraw-native editing.
- **Sessions panel:** searchable queue of sessions on the current canvas page, with triage-first filters and quick actions.
- **Session details panel:** focused inspection and response surface for a single selected session.

The brainstorm panel is a secondary workflow. It uses an awaiting Codex session to generate candidate ideas, then turns selected ideas into canvas stickies. It should feel like a canvas-assist feature, not a separate destination.

## Session State Model

The UI should consistently reflect the state machine owned by `src/main/session-machine.ts`:

- `running`: the session is actively working.
- `awaiting_input`: the session is blocked on user input or approval.
- `idle`: the session has ended or has been manually dismissed.
- `stale`: the session was running or awaiting input but has not emitted events for the staleness window.
- `errored`: the session needs review because an event or action failed.

Triage views should prioritize `awaiting_input`, `running`, and `errored` sessions. Closed or idle sessions remain available for history, but they should not dominate the active queue.

## Layout Behavior

New session stickies should appear in a predictable grid when no relevant canvas structure exists. If the current page includes tldraw frames named for workflow lanes, new sessions should route into matching lanes:

- waiting, awaiting, input, or review for `awaiting_input`,
- running, progress, or doing for `running`,
- blocked, error, or review for `errored`,
- stale, paused, or parking for `stale`,
- done, idle, or closed for `idle`.

Existing sticky positions, sizes, and user-created canvas organization should be preserved when session data updates.

## Visual Direction

Atrium should feel like a focused desktop operations surface:

- quiet, work-oriented, and legible;
- high signal density without visual clutter;
- restrained color used mainly for state, priority, and provider distinction;
- compact controls and predictable panel structure;
- no marketing-style hero sections, decorative flourishes, or oversized empty states.

Use Inter as the primary typeface, matching the existing app. Keep text sizing practical for scanning long paths, prompts, and status messages. Buttons and controls should remain compact enough for side panels, with clear disabled and active states.

## Interaction Guidelines

- Selecting a session sticky should open its details without changing the canvas layout.
- Clicking a session in the panel should focus and zoom to its sticky.
- Detail panel actions should stop pointer events from leaking into the canvas.
- Sending input is only valid for `awaiting_input` sessions with an attached TTY.
- Approval shortcuts should only appear for permission-request sessions.
- Dismissing a session should mark it closed rather than deleting user-visible history.
- Deleting a session sticky from the canvas may delete the backing session record; make this behavior deliberate and avoid accidental bulk deletion affordances.

## Copy Guidelines

Copy should be direct and operational. Prefer labels that describe the immediate state or action:

- "Waiting" instead of "Pending user interaction".
- "Open context" instead of "Navigate to external resource".
- "Frame shown" instead of "Zoom to all filtered canvas elements".

Empty states should explain what is missing and what will make content appear. Avoid onboarding-heavy prose in the main app shell.

## Accessibility

Interactive panel controls should remain keyboard reachable and expose meaningful labels. Icon-only controls need accessible names and hover titles. State labels should not rely on color alone; pair color with text such as "Running", "Waiting", or "Stale".

Because the canvas is visually dense, panels should provide an alternate text-first way to find and focus sessions.

## Data And Persistence Expectations

Session metadata is stored in SQLite. Canvas layout is stored through tldraw persistence using the `atrium-canvas` key. UI changes should respect the split:

- session facts belong in the session store,
- canvas position and shape geometry belong in tldraw,
- local annotations can live on the session when they are semantically tied to that session.

Do not introduce remote services or cloud synchronization without an explicit product decision.

## Safety Constraints

Atrium installs and updates local Claude Code and Codex hook configuration. Design changes should not hide or obscure this behavior when it is relevant to setup, troubleshooting, or permissions.

Actions that send text to a terminal should remain constrained to known sessions with valid TTY paths. The UI should surface failures plainly, especially when macOS TIOCSTI settings prevent terminal injection.

## Future Design Questions

- Should closed sessions remain on the canvas by default, move to a history page, or collapse into a summary?
- Should lane frames be created automatically for first-time users?
- Should multi-session operations exist, or should Atrium keep actions single-session to avoid accidental disruption?
- Should brainstorm output become a first-class custom shape, or remain standard tldraw notes?
