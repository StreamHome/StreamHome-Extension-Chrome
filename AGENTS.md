# StreamHome Extension Agent Guide

## Scope

These instructions apply to the entire repository.

This repository contains StreamHome Capture, a Manifest V3 Chrome extension. It
captures media requests from a selected browser tab, lets the user review the
detected streams, and sends a curated record to a StreamHome server. It is not
the StreamHome web application or backend.

## Required workflow

1. Require explicit user authorization before beginning repository work. A
   direct request or a clear confirmation such as "proceed", "approved",
   "okay", "do it", or "make it" grants permission for the normal in-scope
   steps needed to complete that request. If authorization is absent or the
   requested scope is unclear, do nothing and ask for permission.
2. Treat authorization as scoped. Ask again before starting materially
   different work, expanding the scope, or taking an action the user did not
   request or reasonably imply.
3. Inspect the relevant implementation, current Git status, and recent history.
4. Read the applicable files in `memory-bank/`, but verify every claim against
   the code and Git history. The implementation is the source of truth.
5. Create or update a concrete plan before modifying files. Keep the plan
   current while working.
6. Make the smallest coherent change that solves the task.
7. Run checks proportional to the affected behavior.
8. Review the diff and confirm unrelated user changes are not staged.
9. Commit every completed logical change before moving to another change. Use a
   concise, descriptive commit message and never combine unrelated work.
10. Push immediately after every successful commit. If pushing fails, report
    the failure and resolve it only within the user's authorized scope.
11. After completing repository changes, update the tracked `memory-bank/`
    files so they accurately record the resulting behavior, architecture,
    decisions, validation status, and current follow-ups. Commit the memory-bank
    update separately, then push that commit as well.

Do not discard, overwrite, stage, or commit pre-existing user changes unless the
user explicitly places them in scope.

## Project map

- `manifest.json`: extension permissions, service worker, popup, and accessible
  resources.
- `background.js`: capture pipeline, request-header correlation, filtering,
  manifest inspection, storage serialization, and request-header rules.
- `popup.html` / `popup.js`: credentials, TMDB lookup, capture tasks, stream
  selection, saved records, and deployment.
- `player.html` / `player.js`: HLS, DASH, and direct-media preview.
- `reader.html` / `reader.js`: subtitle preview.
- `input.css`: Tailwind entry point.
- `styles.css`: generated Tailwind output; do not hand-edit it.
- `ember-ui.css`: authored StreamHome Ember theme and component styling.
- `tailwind.config.js`: Tailwind content paths.
- `memory-bank/`: verified project context, decisions, progress, and API notes.
- `StreamHome-memory-bank/`: reference material from the original StreamHome
  project; use it for product and design context, not as this extension's
  implementation truth.

## Runtime invariants

- Capture must remain scoped to both the active task and the selected tab.
- Recheck task and tab ownership after asynchronous manifest work.
- Ignore OPTIONS requests, non-2xx responses, chunks, and unrelated static
  assets.
- Serialize storage mutations that can be triggered by concurrent requests.
- Keep TV streams isolated by season and episode.
- Store persistent extension state in `chrome.storage.local`; use
  `chrome.storage.session` only for session-lifetime request correlation, with
  the existing in-memory fallback where applicable.
- Keep active credentials separate from disconnected drafts. Logout must remove
  active authentication while preserving typed server URL and token drafts
  without automatically reconnecting.
- Keep deployment drafts isolated by task, episode, source, or saved-record
  context. Await saved-record writes before navigation or submission reads
  them.
- Scope preview request-header rules per tab and remove them when the player or
  reader is finished.
- Never log, expose, or commit access tokens, API keys, cookies, captured
  authorization headers, or other credentials.

## Frontend and Ember theme

- Preserve the compact `410 × 600` popup target and verify important states at
  that size.
- Use `ember-ui.css` for product identity and semantic component states:
  deep-brown surfaces, ember-orange actions, peach text, thin borders, square
  terminal-like controls, and restrained transitions.
- Use Tailwind for layout and utilities. Only use classes supported by the
  current Tailwind configuration.
- Button colors belong to semantic Ember roles and state attributes, not legacy
  cyan, purple, slate, emerald, amber, or rose utility classes in HTML or
  JavaScript.
- Let nested button icons inherit `currentColor` unless a distinct semantic
  color is intentional.
- Keep destructive actions, active/listening states, loading/disabled states,
  and success states explicit and accessible.
- Dynamic cards must remain keyboard-operable and have accessible names.
  Nested destructive controls must not trigger the parent card action.
- Avoid inline style rules when an existing semantic class or component rule
  can express the state.

## Build and verification

Install dependencies with `npm install` when needed.

When Tailwind classes or `input.css` change, regenerate the committed stylesheet:

```powershell
npm.cmd run build
```

For changed JavaScript, run syntax checks on every affected file:

```powershell
node --check popup.js
node --check background.js
node --check player.js
node --check reader.js
```

Choose the relevant subset, then also:

- check HTML/JavaScript ID contracts and duplicate IDs when editing UI markup;
- inspect popup, player, and reader behavior in a browser when visual or
  interactive behavior changes;
- exercise both success and failure paths for storage, authentication, capture,
  preview, and deployment changes;
- run `git diff --check`;
- inspect `git diff` and `git status --short` before staging and after
  committing.

There is currently no automated test suite. Do not claim test coverage that the
repository does not provide; record the exact checks performed.

## Git conventions

- Keep commits atomic and use imperative messages such as `fix: ...`,
  `feat: ...`, or `docs: ...`.
- Stage explicit file paths. Never use broad staging when unrelated changes are
  present.
- Do not rewrite history, force-push, reset user work, or delete files unless
  explicitly requested.
- After each commit, confirm the intended files were committed and report any
  remaining unrelated working-tree changes.
