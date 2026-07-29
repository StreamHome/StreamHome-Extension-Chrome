# Active Context

Last verified: 2026-07-29

## Current state

The StreamHome Chrome extension is operational and has no active implementation task. The latest completed work is:

- `15a5f19`: aligned the skip-marker lookup and manual fallback controls with
  the shared Ember inline-action, primary-action, destructive-action, form,
  typography, and flat-row presentation contracts.
- `8bbf73c`: added manual skip-marker fallbacks in `HH:MM:SS` form when
  TheIntroDB has no markers or its lookup fails.
- `57d15d5`: exposed TheIntroDB skip-marker lookup status and marker details
  before deployment.
- `f4766fa`: required explicit user authorization, planning, atomic commits,
  immediate pushes, and a separate memory-bank update after repository changes.
- `0738f0e`: aligned primary, secondary, destructive, inline, toggle, stream-action, loading, and success button colors with the Ember palette.
- `1fb1fd7`: retained deployment-page choices across navigation and popup reopen, isolated by task/episode/source or saved deployment.
- `7fbc2da`: redesigned popup, player, and subtitle reader around StreamHome's Ember visual system.
- `a6bcf0a`: preserved server URL, StreamHome access token, and TMDB token as disconnected drafts after logout.
- `334b617`: repaired capture-task card spacing, sizing, hierarchy, and delete-button alignment.

The nine issues from the earlier capture audit remain resolved, including OPTIONS filtering, prefetch race protection, task/tab scoping, serialized storage writes, episode isolation, Season 0 handling, and subtitle handling.

## Current behavior

- The popup is a fixed 410 × 600 workspace with Ember colors, terminal-style geometry, keyboard-accessible task cards, and consistent loading/empty/error states.
- Buttons use semantic Ember roles rather than legacy cyan/purple/slate utilities. Nested SVGs inherit their button foreground, destructive actions use the Ember error treatment, and deployment loading/success states have explicit visual contracts.
- Capture is limited to the selected task and the tab that started listening. A second gate runs after asynchronous manifest work to prevent late writes.
- HLS, DASH, direct media, and subtitle requests are detected from network traffic. Chunk/static asset requests and non-success responses are ignored.
- Series streams are stored per episode so navigating between episodes does not leak streams across episode boundaries.
- Preview playback supports HLS.js, dash.js, and direct media. Subtitle preview uses the dedicated reader surface.
- The deployment surface shows TheIntroDB lookup progress, found marker ranges,
  empty results, and recoverable errors before submission.
- If TheIntroDB has no markers or its lookup fails, users can add intro, recap,
  credits, or preview ranges as `HH:MM:SS`. Manual ranges are stored in
  milliseconds in the deployment draft and converted to the server's
  second-based `start` / `end` payload at submission. Found TheIntroDB markers
  take precedence over the manual fallback.
- Deployment drafts remember quality, language, audio, custom paths, subtitle
  additions and selections, pending subtitle fields, episodic values, manual
  skip markers, and pending manual marker input. The active deployment surface
  can be restored after the popup closes.
- Active credentials are mirrored between localhost cookies and `chrome.storage.local`. Logout removes only active credentials and retains their values under draft keys for the next popup session without automatically reconnecting.

## Validation baseline

The latest skip-marker changes passed `node --check popup.js`,
HTML/JavaScript ID and duplicate-ID checks, `git diff --check`, a direct
conversion check (`00:01:30`-`00:02:45` to `90000`-`165000` milliseconds and
`90`-`165` payload seconds), and browser inspection at 410 × 600 for
TheIntroDB-ready, empty, error, manual-add, invalid-range, and remove states.
The follow-up Ember alignment was checked through computed form/action colors,
borders, radii, current-color icon behavior, accessible action names, flat
marker-row geometry, and a second 410 × 600 browser pass with no horizontal
overflow.
The repository does not yet have an automated test suite.

Repository work is governed by the root `AGENTS.md`. Agents must receive clear
user authorization before acting, maintain a plan, commit each logical change,
push every commit, and follow implementation work with a separately committed
and pushed memory-bank update.

## Known follow-ups

- Add automated tests for credential lifecycle, task/tab capture gates, and series episode isolation.
- Improve discovery and selection of alternate audio tracks in manifests.
- Align movie ingestion payloads with the server preference to omit `season` and `episode`; the current extension sends them as `null`.

This memory bank records verified project context, but the implementation and current Git history remain the source of truth when they disagree.
