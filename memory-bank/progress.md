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
- Skip-marker status and manual fallback controls aligned with the shared Ember
  form, inline-primary, destructive, current-color icon, and flat-row contracts
  (`15a5f19`).
- Subtitle tracks expanded without an inner scrollbar, labeled by normalized
  language rather than source host, and paired with a semantic Ember custom
  subtitle editor (`c353d79`).
- Unknown subtitle tracks detected from their dialogue text without changing
  their original label or URL; confident language metadata is persisted and
  submitted, while uncertain or unavailable tracks remain explicitly Unknown
  (`f30fac1`).
- Protected subtitle detection aligned with the working reader request path by
  applying captured headers in a temporary service-worker rule and retrying
  without Range when necessary (`66f4068`).
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
- Computed-style and 410 × 600 browser checks for the themed add, remove,
  retry, form-control, empty, ready, and error states with no horizontal
  overflow.
- Six captured subtitle rows plus one custom Portuguese row rendered at full
  list height with visible overflow, language-name/code labels, retained
  selection, cleared custom inputs, accessible Read actions, no horizontal
  overflow, and no runtime errors.
- Native subtitle detection scenario with a Turkish sample detected as
  `Turkish · TR` at 97%, plus short-content and unavailable samples retained as
  Unknown with explicit status text. The nine-row list had no nested or
  horizontal overflow and emitted no runtime errors.
- Deployment-draft verification confirmed detected `tr` metadata, source, and
  confidence persist while the original label remains unchanged; deployment
  serialized the selected track with `language: "tr"`.
- Bounded-fetch verification confirmed a `bytes=0-131071` request, a 128 KiB
  maximum sample, captured authorization-header reuse, and rejection of
  unsupported URL schemes.
- Protected Portuguese VTT verification required captured Referer, Origin,
  User-Agent, Cookie, and Authorization values, rejected the initial Range
  request, succeeded through the full-request fallback, enforced the 128 KiB
  cap, preserved true HTTP 403 and unsupported-URL failures, and confirmed
  temporary request-header rule cleanup.

## Next candidates

1. Add automated regression coverage for capture and credential state machines.
2. Improve alternate-audio discovery and selection.
3. Align movie ingestion fields with the server's omission preference.
4. Continue accessibility and long-content testing at popup dimensions.
