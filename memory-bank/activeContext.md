# Active Context

Last verified: 2026-07-22

## Current state

The StreamHome Chrome extension is operational and has no active implementation task. The latest completed work is:

- `7fbc2da`: redesigned popup, player, and subtitle reader around StreamHome's Ember visual system.
- `a6bcf0a`: preserved server URL, StreamHome access token, and TMDB token as disconnected drafts after logout.
- `334b617`: repaired capture-task card spacing, sizing, hierarchy, and delete-button alignment.

The nine issues from the earlier capture audit remain resolved, including OPTIONS filtering, prefetch race protection, task/tab scoping, serialized storage writes, episode isolation, Season 0 handling, and subtitle handling.

## Current behavior

- The popup is a fixed 410 × 600 workspace with Ember colors, terminal-style geometry, keyboard-accessible task cards, and consistent loading/empty/error states.
- Capture is limited to the selected task and the tab that started listening. A second gate runs after asynchronous manifest work to prevent late writes.
- HLS, DASH, direct media, and subtitle requests are detected from network traffic. Chunk/static asset requests and non-success responses are ignored.
- Series streams are stored per episode so navigating between episodes does not leak streams across episode boundaries.
- Preview playback supports HLS.js, dash.js, and direct media. Subtitle preview uses the dedicated reader surface.
- Active credentials are mirrored between localhost cookies and `chrome.storage.local`. Logout removes only active credentials and retains their values under draft keys for the next popup session without automatically reconnecting.

## Validation baseline

The latest frontend changes passed the Tailwind build, JavaScript syntax checks, CSS parsing, DOM ID contract checks, and browser inspection at the real 410 × 600 popup size. The repository does not yet have an automated test suite.

## Known follow-ups

- Add automated tests for credential lifecycle, task/tab capture gates, and series episode isolation.
- Improve discovery and selection of alternate audio tracks in manifests.
- Align movie ingestion payloads with the server preference to omit `season` and `episode`; the current extension sends them as `null`.

This memory bank records verified project context, but the implementation and current Git history remain the source of truth when they disagree.
