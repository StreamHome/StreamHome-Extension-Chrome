# Progress

Last verified: 2026-07-29

## Completed

### Capture pipeline

- HLS, DASH, direct video/audio, and subtitle discovery.
- Header correlation with session-storage and in-memory fallback.
- OPTIONS, unsuccessful response, chunk, and static-resource filtering.
- Pre- and post-fetch task/tab gates for stale and prefetched requests.
- Serialized task writes and episode-scoped series streams.
- Learned source signatures and favorites.

### Metadata and deployment

- TMDB movie, TV, season, and episode discovery, including Season 0.
- Custom record flow.
- Pre-deployment TheIntroDB skip-marker status and range details (`57d15d5`).
- Manual intro, recap, credits, and preview fallbacks when TheIntroDB is empty
  or unavailable, entered as `HH:MM:SS`, stored as milliseconds, retained in
  the deployment draft, and normalized to payload seconds (`8bbf73c`).
- Stream quality selection, subtitle selection, and StreamHome ingestion.

### Preview surfaces

- HLS.js, dash.js, and direct-media player support.
- Subtitle reader support.
- Per-tab request-header bypass rules with cleanup.

### Frontend and credentials

- Ember redesign across popup, player, and reader (`7fbc2da`).
- Credential drafts retained after logout without auto-login (`a6bcf0a`).
- Capture-card layout and hierarchy repaired (`334b617`).
- Deployment-page choices retained per task/episode/source and saved deployment (`1fb1fd7`).
- Button colors normalized to semantic Ember roles across popup, player, reader, and dynamic states (`0738f0e`).
- Keyboard-accessible dynamic cards, labeled controls, and modal Escape handling.

### Project workflow

- Root `AGENTS.md` with verified architecture, UI, validation, security, and Git
  guidance.
- Explicit authorization gate, mandatory planning, atomic commits, push after
  every commit, and a separately committed and pushed memory-bank update
  (`f4766fa`).

## Verification completed

- Tailwind production stylesheet build.
- JavaScript syntax checks for background, popup, player, and reader scripts.
- CSS parse and DOM ID contract checks.
- Browser inspection of popup, player, reader, and capture-card geometry.
- Mocked logout storage contract.
- Mocked deployment-draft persistence, restoration, context isolation, and saved-record write ordering.
- Rendered computed-color audit confirming matching button/SVG foregrounds and consistent popup/player/reader button surfaces.
- Skip-marker UI inspection at 410 × 600 for TheIntroDB-ready, empty, lookup
  failure, manual add, invalid range, and removal states.
- Direct manual-marker conversion check from `00:01:30`-`00:02:45` to
  `90000`-`165000` internal milliseconds and `90`-`165` payload seconds.

## Next candidates

1. Add automated regression coverage for capture and credential state machines.
2. Improve alternate-audio discovery and selection.
3. Align movie ingestion fields with the server's omission preference.
4. Continue accessibility and long-content testing at popup dimensions.
