# System Patterns

Last verified: 2026-08-11

## Runtime architecture

The extension is a Manifest V3 application with four runtime surfaces:

- `background.js`: service-worker capture pipeline, header correlation, manifest inspection, storage serialization, and dynamic request-header rules.
- `stream-learning.js`: shared structural URL feature extraction, feedback
  migration, scoring, and legacy-signature compatibility.
- `popup.html` / `popup.js`: credentials, TMDB selection, tasks, episode state,
  live captured-media selection, and deployment.
- `player.html` / `player.js`: HLS, DASH, or direct-media preview.
- `reader.html` / `reader.js`: subtitle fetch and preview.

There are no content scripts. The capture pipeline observes browser network metadata through `chrome.webRequest`.

## Capture flow

1. `onSendHeaders` records relevant request headers by request ID in `chrome.storage.session`, with an in-memory fallback.
2. Extension-owned fetches are recorded with an internal marker and rejected at
   response start before classification. An immediate in-memory copy closes
   the race before the asynchronous session-storage write completes.
3. `onResponseStarted` rejects OPTIONS, non-2xx responses, chunks, and unrelated static resources.
4. A storage gate verifies that a capture task is active and that the sender tab owns it.
5. The response is classified as HLS, DASH, direct media, or subtitle. Manifests may be fetched and parsed asynchronously.
6. The task/tab gate runs again after asynchronous work.
7. A serialized mutation updates the correct task and, for TV, the correct episode collection.

This double-gate pattern is required because a response can finish after the user stops listening or switches tasks.
The internal-marker boundary is separately required because extension
service-worker fetches have `tabId: -1`, which is also valid for website
service-worker traffic and therefore cannot be rejected by tab ID alone.

## Task state

`chrome.storage.local` is the persistent state boundary. Important groups include:

- active capture identity: task ID and tab ID;
- saved capture tasks and episode-scoped streams;
- versioned learned stream examples, legacy source signatures, and favorites;
- popup view state;
- `activeDeploymentKey` and per-context `deploymentDraft:{contextKey}` records;
- bounded, credential-free summaries under `mediaSenderOperations`;
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
example. The popup evaluates every eligible non-favorite video source but
promotes only one into Recommended Streams. An explicit video tag has highest
priority, then an explicit audio tag, then the learned score. Exact learned
score ties retain the first captured candidate. All losing candidates stay in
their normal quality categories.

## Deployment drafts

The deployment surface is reconstructed from a captured movie or exact TV
episode, then its matching draft is applied. Context keys include media type,
task ID, season, and episode; they do not include an individual source URL.
This lets a live source list change while quality, language, audio, path,
subtitle, and manual-marker choices remain attached to the media/episode
workspace.

Drafts retain the selected quality and audio, language, custom video/audio
values, available and checked subtitles, pending subtitle inputs,
season/episode fields, normalized manual skip markers, and pending manual
marker inputs. Manual ranges use `start_ms` / `end_ms` internally.
Quality is user-owned and canonical: every deployment offers `4K`, `2K`,
`1080p`, `720p`, `480p`, `360p`, `240p`, and `144p` regardless of source
metadata. Detected heights and legacy labels normalize into those values, and
the same selected value is used for draft restoration and the deployment
payload. Unrecognized source labels start at `1080p` rather than
becoming extra selector entries.
`activeDeploymentKey` lets startup reopen the media/episode deployment after
the popup closes. Legacy source-specific draft keys can be read during startup
and are persisted into the new media/episode key when the workspace opens.

Draft version 5 also retains the selected deployment mode, the local marker
editor document, and pending subtitle/dubbing form values. Server-owned track
collections are refreshed through MediaSender rather than being treated as
authoritative draft data.

## Preview request headers

Some sources require captured headers such as Referer or Origin. Player and
reader tabs install a dynamic session rule scoped to their tab and remove it
when finished. Rule IDs derive from tab IDs to avoid one preview replacing
another. Preview media engines start only after the background worker
acknowledges the asynchronous rule update; otherwise the first manifest request
can race ahead of the required headers.

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
excluded defensively from draft selection and deployment payload construction.

Subtitle checklist deletion is context-owned. The popup first removes the URL
from `availableSubtitles`, rerenders while preserving other checked URLs, and
persists the deployment draft. For captured tasks it then removes the stream,
favorite/tag references, captured headers, and quality metadata from the movie
or explicitly scoped season/episode. Stream deletion returns a promise so
subtitle deletion does not report completion before storage persistence
finishes.

The one-time default separates automatic policy from user intent. Once a
compatible track has received its default, later rerenders preserve the
currently checked URLs without automatically reselecting a track the user
unchecked. Deployment drafts persist compatibility and default-selection
metadata together with the selected URL set.

## Dubbing-track model

Manifest audio is metadata, not a video-quality guess. HLS inspection parses
`EXT-X-MEDIA` audio declarations with quoted attribute support and resolves
relative URIs against the master URL. DASH inspection reads audio adaptation
sets and their first representation. Both normalize tracks to a stable ID,
language, label, source type, default state, manifest URL, and deployability.
Direct audio requests use the same popup model. Audio-playlist URLs already
owned by a manifest track are excluded from video-quality groups even when the
path contains strings such as `1080p`.

Movie tracks live on the task; TV tracks live on the exact episode. Captured
headers for a successfully resolved audio URL inherit the manifest request
headers when no more specific capture exists. Failed manifest reinspection
does not replace known audio metadata with an empty list. Live storage updates
rerender the list while retaining the stable selected track ID and URL.

The deployment workspace presents Original plus all discovered tracks as one
keyboard-operable radio group. Standalone HLS, DASH, or direct URLs are
selectable; manifest-managed entries without a deployable URL remain visible
and disabled. The selected identity and URL are part of the context draft,
the URL feeds the existing `audio_url` payload field, and selecting a known
language updates the deployment language. HLS preview asks HLS.js to select the
matching rendition by resolved URL, then language or name, and preview header
rules cover both selected video and audio hosts.

## Deployment boundary

The deployment surface has two modes. New ingestion combines TMDB identity,
selected captured sources, replay headers, subtitles, and optional skip
markers, then asks the service worker to post them to StreamHome. Edit playback
uses the canonical catalog ID to load and mutate only StreamHome-owned skip
markers, application-owned subtitle sidecars, and application-owned external
dubbing sidecars. It never edits TMDB presentation metadata or the completed
main video.

The service worker is the MediaSender transport boundary. It maps seven named
operations to exact methods and paths, rejects unknown fields, validates media,
track, language, and HTTP(S) source identifiers, applies authentication and a
five-minute timeout, and normalizes FastAPI errors. Per-media operation
summaries are serialized in local storage so the popup can report work that
outlives its window without persisting secrets or source data.

Edit playback calls `GET /api/media/{media_id}/metadata` before presenting
server-owned collections. The current server reference documents mutation on
that path but not this read method, so a missing GET is an explicit
compatibility state. Only external-audio collections are normalized as
editable dubbing; a general `languages` result is never interpreted as
deletable sidecar ownership.

New ingestion starts TheIntroDB lookup when the deployment surface opens and
renders loading, ready, empty, or error state with marker details.

When TheIntroDB is empty or unavailable, the manual fallback accepts intro,
recap, credits, or preview ranges in `HH:MM:SS`. Input is validated so both
times are present, minutes and seconds are within range, the end is later than
the start, and exact duplicates are rejected. Values are stored as
milliseconds, scoped with the deployment draft, and converted through the
existing skip-marker normalization to second-based `start` / `end` fields at
submission. Non-empty TheIntroDB results take precedence over saved manual
markers. Errors remain recoverable; captured tasks are retained for retry.

Movie ingestion omits `season` and `episode`. TV ingestion accepts Season 0
and requires an episode of at least 1. Every submitted video, detached audio,
and subtitle source is an HTTP(S) URL without embedded credentials; source
type metadata preserves HLS classification for both video and detached audio.

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
