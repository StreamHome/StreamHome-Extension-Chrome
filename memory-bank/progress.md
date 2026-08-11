# Progress

Last verified: 2026-08-11

## Completed

### Capture pipeline

- HLS, DASH, direct video/audio, and subtitle discovery.
- Header correlation with session-storage and in-memory fallback.
- OPTIONS, unsuccessful response, chunk, and static-resource filtering.
- Pre- and post-fetch task/tab gates for stale and prefetched requests.
- Extension-owned subtitle and manifest fetches correlated and rejected before
  media classification, including fast `tabId: -1` responses, without blocking
  legitimate website service-worker capture (`3905eb8`).
- Serialized task writes and episode-scoped series streams.
- Shared v2 structural URL learning for favorites and manual video/audio tags,
  with task-history migration, repeated-evidence counts, scored recommendation
  ordering, background auto-tagging, and legacy signature compatibility
  (`6a73a11`).
- Single-winner recommendation presentation: only the strongest eligible
  source is promoted, with explicit-tag priority and stable capture-order tie
  handling; other qualifying sources remain in normal categories (`0110b59`).

### Metadata and deployment

- TMDB movie, TV, season, and episode discovery, including Season 0.
- One live deployment workspace per movie or exact TV episode, with listening,
  detected-media selection, preview, download, and ingestion in the same
  surface (`4aa10b8`).
- Pre-deployment TheIntroDB skip-marker status and range details (`57d15d5`).
- Manual intro, recap, credits, and preview fallbacks when TheIntroDB is empty
  or unavailable, entered as `HH:MM:SS`, stored as milliseconds, retained in
  the deployment draft, and normalized to payload seconds (`8bbf73c`).
- Canonical user-selectable quality ladder (`4K`, `2K`, `1080p`, `720p`,
  `480p`, `360p`, `240p`, `144p`) with detected/legacy normalization and the
  selected value persisted through deployment drafts and ingestion
  (`4cdefaa`, with saved-record persistence retired by `4aa10b8`).
- Subtitle selection and StreamHome ingestion.
- Structured HLS/DASH/direct dubbing discovery with language, labels, default
  state, episode isolation, live selection retention, deployment-draft
  persistence, and `audio_url` ingestion (`42d18ba`).

### Preview surfaces

- HLS.js, dash.js, and direct-media player support.
- Subtitle reader support.
- Per-tab request-header bypass rules with cleanup.
- HLS.js preview selection of the chosen manifest audio rendition, with
  request-header bypass coverage for both video and audio hosts (`42d18ba`).

### Frontend and credentials

- Ember redesign across popup, player, and reader (`7fbc2da`).
- Credential drafts retained after logout without auto-login (`a6bcf0a`).
- Capture-card layout and hierarchy repaired (`334b617`).
- Deployment-page choices retained per media or exact episode while live
  detected sources change (`4aa10b8`, superseding the source-specific portion
  of `1fb1fd7`).
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
- All downloadable subtitle tracks content-verified regardless of their
  declared language, with matching declarations verified, mismatches corrected
  for display and deployment, and original declaration metadata preserved
  (`6ce8af1`).
- Compatible tracks activated once by default after verification; uncertain,
  unavailable, and unsupported tracks persisted and disabled as Broken, with
  manual deselections preserved and broken tracks excluded from deployment
  (`7b3c31b`).
- Subtitle tracks can be deleted through a semantic Ember destructive action;
  removals persist to the deployment draft and captured movie or exact episode
  without removing unrelated sources (`25a9fbc`, updated by `4aa10b8`).
- Keyboard-accessible dynamic cards and labeled controls.
- Intermediate captured-stream review and saved-deployment/custom-record UI,
  JavaScript, and authored styles removed; legacy storage data is not
  destructively migrated (`4aa10b8`).
- Accessible Ember dubbing radio rows for Original, HLS, DASH, and direct
  audio, including visible disabled states for manifest-managed tracks without
  standalone URLs (`42d18ba`).

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
- Nine-track browser verification at 410 × 600 confirmed five matching known
  languages, Spanish-to-English correction, unknown-to-Portuguese detection,
  and honest known-language uncertain/unavailable states. A manual
  Spanish-to-Portuguese correction retained its original label and declaration
  source. Draft serialization and deployment payload checks used corrected
  `en` and detected `pt`; the list had no nested or horizontal overflow and no
  runtime errors.
- Compatible-selection browser verification confirmed seven compatible base
  tracks auto-selected, two failed checks disabled as Broken, and a compatible
  custom correction auto-selected without reselecting a manually unchecked
  English track. Drafts persisted broken reasons and default-selection state,
  selected URLs excluded broken tracks, the deployment payload contained only
  the seven still-selected compatible tracks, and the ten-row list had no
  nested or horizontal overflow or runtime errors.
- Recommendation-learning checks confirmed that the reported numbered-CDN
  `/txt/master.txt` favorite recommends the equivalent source for another
  title and shard while rejecting an unrelated segment. Additional cases
  covered alphabetic CDN shards, stable HLS/DASH filenames, task-history
  migration, repeated counts, one-at-a-time removal, legacy video signatures,
  script ordering, duplicate IDs, syntax, and query-value exclusion. The
  browser security policy blocked the local `file:` popup URL, so this change
  has no claimed visual-browser result.
- Single-winner checks reproduced three internally eligible sources and
  confirmed exactly one highest-score recommendation. Equal scores selected the
  first captured source, an explicit video tag outranked learned candidates,
  invalid or empty collections returned no winner, syntax checks passed, and
  `git diff --check` was clean. The existing local-`file:` browser restriction
  again prevented visual popup inspection.
- Internal-request isolation checks confirmed that marked subtitle responses
  never reach active-task storage through either session correlation or the
  in-memory fallback. An unmarked `tabId: -1` subtitle response still reached
  the normal capture gate, and a deliberately delayed session write neither
  leaked the fast internal response nor left a stale marker. Background syntax
  and `git diff --check` passed.
- Subtitle-deletion checks covered captured movie metadata cleanup, exact TV
  episode cleanup with unrelated episode preservation, draft rerendering with
  other subtitles retained, and immediate saved-record persistence. Popup
  syntax, CSS parsing, semantic/accessibility source checks, and
  `git diff --check` passed; the local-`file:` browser restriction prevented a
  claimed visual-browser result.
- Video-quality checks confirmed the exact eight-option ladder, normalized
  `2160` and legacy `4K (2160p)` to `4K`, normalized `1440p` to `2K`, retained
  a selected `240p`, and defaulted format-only labels to `1080p`. Popup syntax,
  duplicate-ID and selector contracts, persistence-path inspection, and
  `git diff --check` passed. The existing local-`file:` browser restriction
  prevented a claimed visual-browser result.
- Live-deployment checks confirmed the generated Tailwind build, popup syntax,
  duplicate-ID and lookup contracts, and a clean diff. At 410 Ã— 600, the
  workspace opened with two live sources and all source-dependent actions
  disabled; selecting one enabled Preview, Download, and Send. Starting
  listening added a third source through the storage-change path, updated the
  count, and retained the rule that Preview stays disabled without selection.
- Dubbing-track checks confirmed the Tailwind build; syntax for background,
  popup, and player; duplicate-ID and lookup contracts; a clean diff; and
  direct HLS/DASH parsing. A Turkish HLS audio URL containing `1080p` remained
  audio, relative URLs and quoted labels normalized correctly, and URI-less or
  segmented tracks remained visible metadata without becoming deployable. In
  the 410-pixel popup fixture, Original, HLS, direct, and disabled
  manifest-managed states rendered without horizontal overflow or console
  errors. A new German HLS track appeared during listening while the Turkish
  selection, audio URL, and language remained unchanged.

## Next candidates

1. Add automated regression coverage for capture and credential state machines.
2. Resolve manifest-managed audio deployment when no standalone audio URL is
   available.
3. Align movie ingestion fields with the server's omission preference.
4. Continue accessibility and long-content testing at popup dimensions.
