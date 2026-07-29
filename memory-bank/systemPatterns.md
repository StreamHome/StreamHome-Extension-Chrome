# System Patterns

Last verified: 2026-07-29

## Runtime architecture

The extension is a Manifest V3 application with four runtime surfaces:

- `background.js`: service-worker capture pipeline, header correlation, manifest inspection, storage serialization, and dynamic request-header rules.
- `stream-learning.js`: shared structural URL feature extraction, feedback
  migration, scoring, and legacy-signature compatibility.
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
- versioned learned stream examples, legacy source signatures, and favorites;
- custom records and popup view state;
- `activeDeploymentKey` and per-context `deploymentDraft:{contextKey}` records;
- active credentials: `serverUrl`, `apiKey`, `tmdbApiKey`;
- disconnected drafts: `draftServerUrl`, `draftApiKey`, `draftTmdbApiKey`.

Logout first writes drafts, then removes credential cookies and active keys. Drafts populate the form but never count as an authenticated session.

## Stream recommendation learning

`stream-learning.js` is loaded by both the popup and the module service worker
so recommendation rendering and capture-time auto-tagging use one algorithm.
Favorite, video-tag, and audio-tag feedback are separate roles. Version 2 stores
feature examples with occurrence counts; it does not store query values.

Features describe stable source structure: exact and normalized CDN host
families, path depth, stable directory and filename segments, two- and
three-segment path tails, terminal and embedded media extensions, and query
parameter names. Numeric and one-letter CDN shards normalize to a shared
family, while volatile or high-entropy path segments become wildcards.
Recommendation scoring favors filename and path-tail agreement. Host-only
similarity stays below the threshold unless repeated evidence supplies several
independent matches, preventing one favorite from promoting every resource on
the same CDN.

Existing task and episode favorites and manual video/audio tags are migrated
once into the versioned examples. The legacy arrays remain readable: exact
legacy video/audio signatures preserve their former auto-tag behavior, while a
host-only legacy favorite is intentionally too weak to recommend a source.
Adding or removing a favorite/tag increments or decrements only its structural
example, and learned recommendations are ordered by score.

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

Every HTTP(S) subtitle track is content-verified, whether its initial language
came from the URL, manual entry, or was Unknown. The popup asks the background
service worker for at most 128 KiB of subtitle text. The fetch can reuse the
captured Referer, Origin, User-Agent, Cookie, and Authorization headers, uses a
seven-second timeout, and rejects unsupported URL schemes. Captured headers are
applied with a temporary session rule scoped to requests without a tab,
matching the service-worker fetch without affecting normal tab traffic. The
rule uses an exact URL for normal-length filters and a source-host fallback
only when the URL is too long for Chrome's regular-expression rule limit. The
fetch includes credentials, attempts the bounded Range request first, then
retries without Range when the source rejects or fails that request. Streaming
still stops after 128 KiB, and the temporary rule is removed in all completion
paths. The popup removes cue timing, indices, markup, and format metadata before
passing dialogue text to `chrome.i18n.detectLanguage`.

A result is accepted only when the sample has at least 80 dialogue characters
and the leading language reaches 50% for a reliable detector result or 85% for
an unreliable result. Async completion is guarded by `activeDeploymentKey`, so
a result cannot update a different deployment surface. A confident match is
shown as verified; a confident mismatch updates `lang` / `language` for display
and deployment and is shown as corrected; a previously unknown track is shown
as detected. Successful results persist `languageSource: "detected"` and
`languageConfidence`. Known tracks also preserve `declaredLanguage` and
`declaredLanguageSource`, while the original label and URL always remain
unchanged. Low-confidence or unavailable known tracks retain their declared
language with a verification warning; unknown tracks remain Unknown. Checked
state survives rerender, and detected, verified, corrected, uncertain, and
unavailable states use semantic Ember styling.

Subtitle selection is compatibility-gated. Tracks remain unchecked while their
content check is pending. A successful verified, corrected, or detected result
applies a default selection exactly once and records
`defaultSelectionApplied`. A short, low-confidence, unavailable, or unsupported
track records `isBroken` and `brokenReason`, is rendered with the semantic
Broken state, and has its checkbox disabled. Broken or disabled tracks are
excluded defensively from draft selection, saved custom records, and deployment
payload construction.

The one-time default separates automatic policy from user intent. Once a
compatible track has received its default, later rerenders preserve the
currently checked URLs without automatically reselecting a track the user
unchecked. Deployment drafts persist compatibility and default-selection
metadata together with the selected URL set.

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
