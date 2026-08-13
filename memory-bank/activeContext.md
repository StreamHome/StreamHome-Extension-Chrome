# Active Context

Last verified: 2026-08-13

## Current state

The StreamHome Chrome extension is operational. The deployment workspace now
separates new ingestion from completed-playback metadata editing. The latest
completed work is:

- `fddd7a9`: completed the Edit playback workspace with a canonical
  load-before-edit state model, completed/not-ready/error/loading target
  states, single-open Ember accordions, marker save/discard/confirmed-clear
  behavior, explicit subtitle and dubbing add/replace forms, immutable replace
  identifiers, confirmed deletes, globally locked mutations, canonical reloads
  after every write, conflict-safe dirty marker drafts, and form-mode draft
  restoration.
- `26f2cb1`: moved preview opening into the service worker so captured
  Referer, Origin, User-Agent, Cookie, and Authorization headers are installed
  before player navigation, scoped to the created tab, kept out of the player
  URL, and removed when that tab closes.
- `1fee842`: made preview wait for the asynchronous DNR header-rule update
  before HLS.js, DASH, or direct playback starts, eliminating the manifest
  request race that produced immediate `manifestLoadError` failures.
- `1dd3532`: added fixed New ingestion and Edit playback tabs, an Ember
  metadata editor for skip markers, subtitle sidecars, and external dubbing
  sidecars, persisted mode/form drafts, server-owned collection loading,
  two-click marker clearing, captured-source prefills, and explicit operation
  error states at the 410 x 600 popup size.
- `b8a8e91`: added the service-worker MediaSender allowlist for ingestion,
  metadata reads, marker replacement, subtitle mutations, and dubbing
  mutations, with strict route/body validation, normalized FastAPI errors, a
  five-minute timeout, and safe persistent operation summaries.
- `64671c3`: aligned ingestion with the current MediaSender contract: movie
  payloads omit season/episode, TV accepts Season 0 and requires episode 1 or
  later, sources must be credential-free HTTP(S) URLs, and detected HLS video
  and audio retain their source types.

- `42d18ba`: parsed HLS and DASH audio declarations into structured,
  episode-scoped tracks; rendered accessible dubbing choices beside subtitles;
  preserved the selection through live updates and drafts; submitted the
  selected URL through `audio_url`; and selected matching HLS audio during
  preview when HLS.js exposes it.

- `4aa10b8`: removed the intermediate captured-stream and saved-deployment
  surfaces, made movie cards and TV episode choices open one live deployment
  workspace, placed listening and detected-media selection at the top, updated
  new captures in place, and enabled preview/download/deployment only after a
  source is selected or explicitly overridden where applicable.

- `4cdefaa`: replaced source-dependent quality choices with a canonical
  `4K` through `144p` ladder, normalized detected and legacy resolution labels,
  and persisted the selected value through drafts, saved records, and deployment.
- `25a9fbc`: added a themed Delete action to every deployment subtitle row and
  persisted removals to task, episode, draft, or saved-record state while
  preserving unrelated tracks and media.
- `3905eb8`: kept extension-owned subtitle and manifest fetches marked as
  internal through response correlation, preventing movie-review subtitle
  verification from entering a different movie's active listening task.
- `0110b59`: limited Recommended Streams to one highest-confidence source,
  preferring an explicit video tag and resolving equal learned scores by stable
  capture order while leaving losing candidates in their normal categories.
- `6a73a11`: replaced unused host-only favorite signatures with a shared,
  versioned structural URL learner that migrates existing task feedback,
  recommends related sources, ranks learned matches, and drives background
  video/audio auto-tagging.
- `7b3c31b`: made compatible subtitle tracks active by default after successful
  content verification, persisted broken results, disabled broken selections,
  and excluded them from draft selections, saved records, and deployment
  payloads.
- `6ce8af1`: extended content-language analysis to every downloadable subtitle
  track, showing verified matches, correcting mismatches, and retaining the
  original declared language and source in deployment drafts.
- `66f4068`: fixed content-language detection for protected subtitle URLs by
  applying captured request headers through a temporary service-worker rule
  and retrying without Range when a source rejects ranged requests.
- `f30fac1`: added content-based language detection for unknown subtitle
  tracks, with bounded authenticated sampling, confidence thresholds, explicit
  Ember status text, draft persistence, and deployment payload integration.
- `c353d79`: removed the subtitle list's inner scrollbar, made language the
  authoritative visible track label, and rebuilt custom subtitle entry with
  semantic Ember form and action styling.
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
- Subtitle-language samples and manifest inspections initiated by the extension
  carry an internal request marker. That marker is correlated by request ID in
  session storage with an immediate in-memory race guard, consumed at response
  start, and rejected before media classification. Opening or reviewing another
  movie therefore cannot add its internally fetched subtitles to the active
  listening task, while unmarked site service-worker requests remain eligible
  for the normal capture gates.
- HLS, DASH, direct media, and subtitle requests are detected from network traffic. Chunk/static asset requests and non-success responses are ignored.
- HLS `EXT-X-MEDIA:TYPE=AUDIO` declarations and DASH audio adaptation sets are
  stored as structured tracks with stable identity, language, label, source
  type, default state, manifest ownership, and deployability. Relative audio
  URLs are resolved against their manifest. URI-less or segmented
  manifest-managed tracks remain visible so their existence is not hidden, but
  cannot be selected as a detached `audio_url`. A failed manifest refresh
  preserves previously discovered tracks.
- Favorites and manual video/audio tags train a shared local recommendation
  model. It compares stable URL structure such as normalized CDN families,
  path tails, filenames, embedded media extensions, and query-key names without
  storing query values. Existing task favorites and tags are migrated once,
  repeated structural choices increase confidence, and weak host-only favorite
  history cannot recommend every source from one CDN. Only the highest-scoring
  eligible favorite/video match appears in the Recommended Streams group;
  other matches remain in their normal quality categories. Video/audio matches
  also retain the existing background auto-tag behavior.
- Movie cards open the live deployment workspace directly. TV cards retain the
  required season/episode choice, then open the same workspace with exact
  episode scope.
- The deployment header owns the listening toggle. Detected media is rendered
  as a live, keyboard-operable radio list; `chrome.storage.onChanged` adds new
  captures without navigation. Preview and download remain disabled until a
  detected source is selected, and deployment also accepts the explicit video
  override.
- The deployment surface has keyboard-operable New ingestion and Edit playback
  tabs. Edit playback derives `m_<tmdb>` or
  `ep_<tmdb>_s<season>_e<episode>`, hides listening and ingestion actions, and
  keeps every editor hidden and disabled until canonical server metadata is
  loaded for a completed mutable target. Its compact target card and three
  single-open accordions expose skip markers, application-owned subtitle
  sidecars, and application-owned external dubbing sidecars. Marker edits are
  local until Save changes; Discard restores the server baseline and Clear all
  requires confirmation. Track replacement locks the track ID or language,
  requires a new HTTP(S) source, and deletion requires inline confirmation.
  Every successful mutation reloads canonical server state, while all editor
  controls are locked during a write. Dirty marker drafts are restored only
  when their saved baseline still matches StreamHome. General playback
  language lists are never treated as deletable sidecars. The current server
  reference does not define the required GET read route, so unsupported
  servers receive an explicit compatibility error.
- Series streams are stored per episode so navigating between episodes does not leak streams across episode boundaries.
- Preview playback supports HLS.js, dash.js, and direct media. When a selected
  dubbing URL belongs to the HLS master, the player matches it by URL with
  language/name fallbacks and selects the corresponding HLS.js audio track.
  Preview request-header rules can cover the video and audio hosts and are
  removed together. Subtitle preview uses the dedicated reader surface.
- Subtitle tracks expand to their full list height inside the deployment
  content, display normalized language names and codes instead of source-host
  labels, and retain checked selections when a custom track is added. The
  custom subtitle fields use the shared Ember surface, form, and compact
  primary-action contracts.
- Every HTTP(S) subtitle track is sampled through the background service worker
  and analyzed with Chrome's native language detector, including tracks whose
  URL or manual entry already declares a language. Matching declarations show
  `Verified from subtitle text`; mismatches switch the visible and deployed
  language to the detected value and show `Corrected from ...`. Previously
  unknown tracks show `Detected from subtitle text`. The original label, URL,
  declared language, and declaration source remain stored in the draft.
  Low-confidence or inaccessible known tracks keep their declared language
  with an explicit verification warning, while unknown tracks remain Unknown
  rather than accepting a guess.
  Pending tracks remain inactive. Verified, corrected, or detected tracks
  receive a one-time default selection after their check succeeds. Uncertain,
  unavailable, or unsupported tracks are persisted as Broken, rendered with
  the Ember error treatment, disabled, and excluded from selection and
  deployment. A user's later manual deselection is retained across subsequent
  subtitle rerenders and draft persistence.
  Every subtitle row also exposes an accessible Ember destructive action.
  Deleting a captured track removes it from the current movie or exact episode,
  including its favorite/tag, captured-header, and quality references. Manual
  draft tracks are removed from their owning context, and other subtitle
  selections remain unchanged.
  Sampling uses a URL-scoped request-header rule limited to service-worker
  requests, includes source credentials, and falls back from a bounded Range
  request to a bounded full response so URLs that work in the reader are also
  available to detection. The temporary rule is always removed afterward.
- The deployment surface shows TheIntroDB lookup progress, found marker ranges,
  empty results, and recoverable errors before submission.
- If TheIntroDB has no markers or its lookup fails, users can add intro, recap,
  credits, or preview ranges as `HH:MM:SS`. Manual ranges are stored in
  milliseconds in the deployment draft and converted to the server's
  second-based `start` / `end` payload at submission. Found TheIntroDB markers
  take precedence over the manual fallback.
- The quality selector always offers `4K`, `2K`, `1080p`, `720p`, `480p`,
  `360p`, `240p`, and `144p`. Detected `2160p` / `1440p` and legacy labels are
  normalized to the matching choice; unknown format labels default to `1080p`.
  The selected quality is retained in the media/episode deployment draft and
  submitted payload.
- Deployment drafts are scoped to the media or exact episode rather than an
  individual captured source. They also remember the selected source,
  language, selected audio-track identity and URL, custom paths, subtitle
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
The subtitle follow-up passed a seven-track 410 × 600 browser scenario:
the subtitle list had visible overflow with equal client/content heights,
language labels contained no source text, English remained selected after a
Portuguese custom track was added and selected, inputs cleared after the add,
and the page had no horizontal overflow or runtime errors.
Content-based subtitle detection passed `node --check` for `popup.js` and
`background.js`, duplicate-ID and HTML/JavaScript ID-contract checks,
`git diff --check`, and a nine-track browser scenario at popup dimensions.
Turkish text was detected and rendered as `Turkish · TR` with 97% confidence;
short and unavailable samples remained Unknown with honest terminal states.
The full subtitle list had equal client/content heights, no inner or horizontal
overflow, and no runtime errors. Draft serialization retained the original
label while persisting `tr`, its detected source, and confidence; a selected
track produced `{ language: "tr", url }` in the deployment payload. A direct
background harness confirmed the 128 KiB range cap, captured-header reuse, and
safe rejection of unsupported URLs.
The protected-source follow-up reproduced a Portuguese VTT requiring captured
Referer, Origin, User-Agent, Cookie, and Authorization headers while rejecting
Range. Detection retrieval succeeded through the full-request fallback, still
capped the sample at 128 KiB, retained genuine HTTP 403 and unsupported-URL
failures, and left no temporary request-header rules installed. JavaScript
syntax, deployment-context guards, and `git diff --check` also passed.
The all-track verification follow-up passed `node --check popup.js`,
HTML/JavaScript ID-contract and duplicate-ID checks, `git diff --check`, and a
410 × 600 browser scenario. English, Turkish, German, French, and Japanese
declarations were verified; a Spanish declaration containing English text was
corrected to `English · EN`; an unknown Portuguese track was detected as
`Portuguese · PT`; known Italian and Russian tracks retained their declared
language when verification was uncertain or unavailable. A manually declared
Spanish track containing Portuguese was corrected while retaining
`label: "Spanish"`, `declaredLanguage: "es"`, and
`declaredLanguageSource: "manual"`. Draft and deployment checks confirmed the
corrected `en` and detected `pt` payload languages. Nine rows retained equal
client/content heights, visible overflow, no horizontal overflow, and no
runtime errors.
The compatible-selection follow-up passed `node --check popup.js`,
HTML/JavaScript ID-contract and duplicate-ID checks, `git diff --check`, and a
410 × 600 browser scenario. Seven compatible base tracks were checked
automatically; uncertain Italian and unavailable Russian tracks were labeled
Broken, disabled, and unchecked. Manually unchecking English remained
effective after a compatible custom Portuguese correction completed and
auto-selected. Draft serialization persisted both broken reasons and the
one-time default state, omitted broken URLs from `selectedSubtitleUrls`, and
retained the manual deselection. The deployment payload contained only the
seven still-selected compatible tracks. Ten rows retained equal client/content
heights, visible overflow, no horizontal overflow, and no runtime errors.
The recommendation-learning change passed syntax checks for
`stream-learning.js`, `popup.js`, and `background.js`, HTML script-order and
duplicate-ID checks, and `git diff --check`. Direct scenarios covered the
reported numbered-CDN `/txt/master.txt` shape, alphabetic CDN shards, stable
HLS and DASH filenames, unrelated chunk rejection, repeated feedback,
single-feedback removal, migration from existing task history, and legacy
video-signature compatibility. Stored examples were also checked not to retain
query values. A local browser visual check was attempted, but the browser
security policy rejected the extension's `file:` URL, so no new visual-browser
result is claimed for this change.
The single-recommendation follow-up passed `node --check` for
`stream-learning.js` and `popup.js` plus `git diff --check`. A three-candidate
scenario confirmed that all three could qualify internally while exactly one
highest-score result was selected. Equal scores retained the first captured
candidate, an explicit video tag outranked learned candidates, and empty or
invalid candidate collections produced no recommendation. The browser's
existing local-`file:` restriction still prevented visual popup inspection.
The internal-request isolation follow-up passed `node --check background.js`
and `git diff --check`. A mocked webRequest harness confirmed that marked
subtitle requests are rejected before active-task storage access with both
session storage and the in-memory fallback, while an unmarked `tabId: -1`
service-worker subtitle request still reaches the normal capture gate. A
delayed session-write scenario also confirmed that the synchronous memory guard
blocks a fast response and that the late write leaves no stale marker.
The subtitle-deletion follow-up passed `node --check popup.js`, CSS parsing,
semantic action and accessible-label source checks, and `git diff --check`.
Mocked scenarios confirmed movie cleanup, exact-episode cleanup including
Season 0 scope propagation, deployment-draft rerendering with retained
unrelated subtitles, and immediate saved-record persistence. The known browser
policy still blocks local extension `file:` pages, so no visual-browser result
is claimed for this change.
The video-quality follow-up passed `node --check popup.js`, popup duplicate-ID
and quality-selector contract checks, and `git diff --check`. A direct behavior
harness confirmed the exact eight-option order, mapped `2160` / legacy
`4K (2160p)` to `4K`, mapped `1440p` to `2K`, retained a selected `240p`, and
defaulted non-quality format labels to `1080p`. Source inspection confirmed the
same canonical getter feeds deployment drafts and the ingestion payload; the
saved-record path checked at that time was later retired by `4aa10b8`. The
known local-`file:` browser restriction prevented a new
visual-browser claim.
The live-deployment consolidation passed the Tailwind build,
`node --check popup.js`, duplicate-ID and HTML/JavaScript ID-contract checks,
`git diff --check`, and a 410 Ã— 600 browser fixture. The fixture confirmed an
initially unselected workspace with disabled Preview/Download/Send actions, a
selected source enabling all three, and a listening update that added a new
source live, changed the count from two to three, and kept Preview disabled
until selection. Existing `custom_records` storage data was not deleted, but
the saved-deployment UI and all of its read/write paths were removed.
The dubbing-track follow-up passed the Tailwind build, syntax checks for
`background.js`, `popup.js`, and `player.js`, duplicate-ID and
HTML/JavaScript ID-contract checks, `git diff --check`, and direct HLS/DASH
manifest parsing scenarios. The HLS scenario resolved a Turkish audio playlist
whose URL contained `1080p` as audio rather than video, preserved a quoted
comma in its label, and kept a URI-less Japanese track visible but
nondeployable. The DASH scenario distinguished a deployable direct audio URL
from a segmented manifest-managed representation. A 410-pixel browser fixture
showed Original, Turkish HLS, English direct, and disabled Japanese embedded
rows without horizontal overflow or console errors. Starting listening added
a new German HLS row live while preserving the selected Turkish track, its
hidden audio URL, and the deployment language.
The MediaSender update passed syntax checks for `background.js` and `popup.js`,
Tailwind regeneration, duplicate-ID and HTML/JavaScript lookup checks, direct
service-worker route/body/error/storage scenarios, and `git diff --check`. The
background harness covered all allowlisted methods, Season 0 identity,
rejection of episode 0, unsafe identities, unknown operations and body fields,
FastAPI 422 parsing, authentication headers, and the absence of secrets/source
data from operation summaries. A 410 x 600 browser fixture covered metadata
loading, marker add/replace/two-click clear, captured subtitle collision IDs,
HLS dubbing prefill, successful PUT/DELETE flows, a 409 error with controls
restored, tab keyboard navigation, hidden ingestion controls in edit mode, one
vertical scroll region, no horizontal overflow, and no console errors or
warnings.
The preview ordering fix passed `node --check` for `background.js` and
`player.js` plus `git diff --check`; the background message now acknowledges
rule installation before the player initializes its media engine.
The completed preview transport passed syntax checks for `background.js`,
`popup.js`, and `player.js`, `git diff --check`, and a mocked open-tab/DNR
harness. The harness verified Cookie and Authorization installation, exact tab
scope, two-host video/audio rules, navigation only after rule completion, and
that credential/header values do not enter the player URL.
The repository does not yet have an automated test suite.

Repository work is governed by the root `AGENTS.md`. Agents must receive clear
user authorization before acting, maintain a plan, commit each logical change,
push every commit, and follow implementation work with a separately committed
and pushed memory-bank update.

## Known follow-ups

- Add automated tests for credential lifecycle, task/tab capture gates, and series episode isolation.
- Resolve deployment semantics for manifest-managed audio tracks that do not
  expose a standalone audio URL.
- Add and document `GET /api/media/{media_id}/metadata` in StreamHome so the
  extension can list existing application-owned playback metadata before a
  mutation.

This memory bank records verified project context, but the implementation and current Git history remain the source of truth when they disagree.
