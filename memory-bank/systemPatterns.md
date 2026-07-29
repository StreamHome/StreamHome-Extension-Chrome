# System Patterns

Last verified: 2026-07-29

## Runtime architecture

The extension is a Manifest V3 application with four runtime surfaces:

- `background.js`: service-worker capture pipeline, header correlation, manifest inspection, storage serialization, and dynamic request-header rules.
- `popup.html` / `popup.js`: credentials, TMDB selection, tasks, episode state, captured stream review, custom records, and deployment.
- `player.html` / `player.js`: HLS, DASH, or direct-media preview.
- `reader.html` / `reader.js`: subtitle fetch and preview.

There are no content scripts. The capture pipeline observes browser network metadata through `chrome.webRequest`.

## Capture flow

1. `onSendHeaders` records relevant request headers by request ID in `chrome.storage.session`, with an in-memory fallback.
2. `onResponseStarted` rejects OPTIONS, non-2xx responses, chunks, and unrelated static resources.
3. A storage gate verifies that a capture task is active and that the sender tab owns it.
4. The response is classified as HLS, DASH, direct media, or subtitle. Manifests may be fetched and parsed asynchronously.
5. The task/tab gate runs again after asynchronous work.
6. A serialized mutation updates the correct task and, for TV, the correct episode collection.

This double-gate pattern is required because a response can finish after the user stops listening or switches tasks.

## Task state

`chrome.storage.local` is the persistent state boundary. Important groups include:

- active capture identity: task ID and tab ID;
- saved capture tasks and episode-scoped streams;
- learned source signatures and favorites;
- custom records and popup view state;
- `activeDeploymentKey` and per-context `deploymentDraft:{contextKey}` records;
- active credentials: `serverUrl`, `apiKey`, `tmdbApiKey`;
- disconnected drafts: `draftServerUrl`, `draftApiKey`, `draftTmdbApiKey`.

Logout first writes drafts, then removes credential cookies and active keys. Drafts populate the form but never count as an authenticated session.

## Deployment drafts

The deployment surface is reconstructed from captured task or saved-record data, then a matching draft is applied. Task context keys include media type, task ID, season, episode, and a stable hash of the selected source. Saved deployments use their record ID. This prevents a quality, language, audio, path, or subtitle choice from bleeding into a different deployment.

Drafts retain the selected quality and audio, language, custom video/audio
values, available and checked subtitles, pending subtitle inputs,
season/episode fields, normalized manual skip markers, and pending manual
marker inputs. Manual ranges use `start_ms` / `end_ms` internally.
`activeDeploymentKey` lets startup reopen a task draft or saved deployment
after the popup closes. When leaving or submitting a saved deployment, its
underlying `custom_records` write is awaited before the next action reads it.

## Preview request headers

Some sources require captured headers such as Referer or Origin. Player and reader tabs install a dynamic session rule scoped to their tab and remove it when finished. Rule IDs derive from tab IDs to avoid one preview replacing another.

## UI system

`styles.css` is generated from `input.css` by Tailwind. `ember-ui.css` is authored directly and supplies StreamHome identity: deep brown surfaces, ember-orange actions, peach text, thin borders, square terminal-like controls, subtle grid/scanline texture, and short state transitions.

Button color is owned by semantic classes and state attributes in `ember-ui.css`, not by Tailwind palette utilities embedded in markup or JavaScript. Primary and secondary controls share stable foreground inheritance through `currentColor`; destructive, active/listening, loading/disabled, stream-tag, favorite, and success states use explicit Ember variables or palette-derived values.

Critical popup geometry is expressed with valid Tailwind utilities plus explicit component CSS. Dynamic cards provide keyboard activation and accessible names; destructive nested controls stop event propagation.

Subtitle tracks use their normalized language code as the display source of
truth; source/CDN labels are not shown in the track checklist or reader title.
Known codes use explicit English names and other valid codes use the browser's
language display-name support with an uppercase-code fallback. The checklist
expands with its rows rather than creating a nested scroll region. Custom
subtitle entry uses semantic Ember fields and a compact primary action while
preserving deployment-draft persistence and checked-track state.

URL-derived and manually assigned subtitle languages are authoritative and are
not re-detected. For an Unknown HTTP(S) track, the popup asks the background
service worker for at most 128 KiB of subtitle text. The fetch can reuse the
captured Referer, Origin, User-Agent, Cookie, and Authorization headers, uses a
seven-second timeout, and rejects unsupported URL schemes. The popup removes
cue timing, indices, markup, and format metadata before passing dialogue text
to `chrome.i18n.detectLanguage`.

A result is accepted only when the sample has at least 80 dialogue characters
and the leading language reaches 50% for a reliable detector result or 85% for
an unreliable result. Otherwise the track remains Unknown. Async completion is
guarded by `activeDeploymentKey`, so a result cannot update a different
deployment surface. Successful results persist `languageSource: "detected"`
and `languageConfidence`, preserve the track's original label and URL, retain
checked state across rerender, and flow through the existing deployment
payload. Detecting, detected, uncertain, and unavailable states use semantic
Ember status styling.

## Deployment boundary

The popup combines TMDB metadata, selected captured sources, request headers,
subtitles, and optional skip markers, then posts them to the configured
StreamHome ingestion endpoint. It starts TheIntroDB lookup when the deployment
surface opens and renders loading, ready, empty, or error state with marker
details.

When TheIntroDB is empty or unavailable, the manual fallback accepts intro,
recap, credits, or preview ranges in `HH:MM:SS`. Input is validated so both
times are present, minutes and seconds are within range, the end is later than
the start, and exact duplicates are rejected. Values are stored as
milliseconds, scoped with the deployment draft, and converted through the
existing skip-marker normalization to second-based `start` / `end` fields at
submission. Non-empty TheIntroDB results take precedence over saved manual
markers. Errors remain recoverable; captured tasks are retained for retry.

## Verification pattern

For frontend changes, the minimum current checks are:

- rebuild `styles.css` when Tailwind classes change;
- run `node --check` for changed JavaScript;
- check HTML/JavaScript ID contracts and duplicate IDs;
- inspect popup/player/reader in a browser at their real dimensions;
- run `git diff --check` before committing.

## Repository workflow

The root `AGENTS.md` is the operational instruction boundary for repository
work. A direct request or clear approval must exist before action begins.
Authorized work starts with a maintained plan, preserves unrelated user state,
and is divided into atomic commits. Every successful commit is pushed
immediately. After repository changes are complete, the tracked memory bank is
updated in a separate commit and that commit is pushed as well.
