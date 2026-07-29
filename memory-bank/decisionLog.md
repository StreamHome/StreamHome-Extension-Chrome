# Decision Log

Last verified: 2026-07-29

## 1. Ignore media chunks

Segment/chunk requests create noise and do not represent reusable stream sources. Capture retains manifests, direct media, and subtitle resources while filtering typical chunk/static extensions and MIME types.

## 2. Use network interception rather than content scripts

The extension observes request and response metadata through Manifest V3 browser APIs. This avoids injecting logic into streaming sites and keeps capture independent of page markup.

## 3. Ignore OPTIONS and unsuccessful responses

CORS preflight requests and non-2xx responses are not playable media. They are rejected before expensive parsing or storage work.

## 4. Scope capture to both task and tab

A request is accepted only while a capture task is active and its tab ID matches the sender tab. The same state is checked again after asynchronous manifest fetches to prevent prefetched or late responses from entering a new task.

## 5. Serialize capture persistence

Request headers are correlated through `chrome.storage.session` with an in-memory fallback, and task mutations are serialized. This avoids lost updates when several network responses arrive together.

## 6. Keep series streams episode-scoped

Each episode owns its discovered streams. Changing the selected episode must not make the previous episode's variants deployable.

## 7. Use per-tab preview bypass rules

Dynamic request-header rules are keyed from the preview tab ID, with a reserved fallback only when necessary. Player and reader surfaces install and remove their own rule so concurrent previews do not overwrite one global rule.

## 8. Adopt StreamHome's Ember UI system

The popup, player, and reader share an authored `ember-ui.css` layer using the original project's dark brown, ember-orange, peach, grid, and scanline language. Tailwind remains responsible for utilities; the Ember layer carries the product identity and component refinements.

## 9. Separate active credentials from remembered drafts

Logout should disconnect without forcing users to retype long tokens. Active values are cleared from cookies and active storage keys, while draft keys preserve the form values and do not trigger automatic login.

## 10. Prefer explicit component CSS for critical geometry

Capture-card dimensions and hierarchy are defined with supported utilities and targeted CSS. Unsupported utility tokens such as `p-4.5` must not be relied on because they silently produce no rule.

## 11. Version the verified memory snapshot

The directory remains matched by `.gitignore` for incidental local notes. The user explicitly requested the verified project memory to be committed, so these known files are force-added and become normal tracked documentation.

## 12. Store deployment drafts per context

Deployment controls must survive popup closure without leaking choices into another title, episode, source, or saved deployment. Task draft keys include media identity, episode scope, and a stable hash of the selected source; saved deployments use their record ID. Each draft stores the form controls and subtitle state under its own `chrome.storage.local` key, while `activeDeploymentKey` identifies the surface to restore. Saved-deployment writes are awaited before navigation or submission continues.

## 13. Give buttons semantic Ember roles

Buttons must not carry legacy cyan, purple, slate, emerald, or amber utility colors as their visual contract. Primary, secondary, icon, destructive, inline, toggle, and stream-action roles are defined in `ember-ui.css`; JavaScript changes semantic state through attributes or role classes. Child SVGs inherit `currentColor`, destructive actions use `--ember-error`, listening and stream selections use Ember orange/peach, disabled deployment is muted, and successful deployment uses `--ember-success`.

## 14. Require an authorized, committed, and pushed workflow

Repository actions begin only after a direct user request or clear confirmation.
Agents must plan before editing, keep changes atomic, commit each logical
change, and push immediately after every commit. Completed repository work is
then reflected in the tracked memory bank through a separate commit and push.
If the scope is missing or ambiguous, the agent asks for permission instead of
acting.

## 15. Verify every subtitle language from bounded content

URL-derived and manually supplied language values are declarations, not final
truth. Every HTTP(S) subtitle track is checked from its text. The background
worker fetches a bounded 128 KiB sample with a timeout. Protected URLs receive
captured source headers through a temporary URL-scoped rule limited to requests
without a tab; the worker tries Range first and falls back to a credentialed
full request while preserving the byte cap, then removes the rule. The popup
strips subtitle formatting and uses Chrome's native language detector. It
accepts only sufficiently long, confident results and scopes async completion
to the active deployment. Matches are verified; mismatches use the detected
language for display and deployment; unknown tracks are detected. The original
label, URL, declared language, and declaration source are preserved. An
uncertain or unavailable check never overwrites a known declaration and never
guesses an unknown language.

## 16. Activate only compatible subtitles by default

A subtitle is not selected while its content check is pending. Verified,
corrected, and detected tracks are compatible and receive a one-time automatic
selection. Short, low-confidence, unavailable, and unsupported tracks are
persisted as Broken, disabled in the checklist, and excluded from draft
selection, saved records, and deployment payloads. `defaultSelectionApplied`
ensures the automatic policy runs once; afterward, a user's manual deselection
remains authoritative across asynchronous rerenders and popup restoration.

## 17. Learn stream choices from structural URL evidence

Exact host-plus-extension signatures do not generalize across CDN shards,
disguised manifests, or stable paths, and the former favorite signatures were
never consumed by the recommendation renderer. One shared versioned learner
now serves popup recommendations and background auto-tagging. It stores
query-value-free structural examples separately for favorite, video, and audio
feedback, counts repeated choices, migrates existing task and episode state,
and retains legacy video/audio behavior. Strong filename or path-tail matches
can generalize across normalized CDN families; host-only favorite history
cannot recommend every resource from that provider. Removing a choice reduces
only that example rather than deleting a rule that may still be supported by
other tasks.

## 18. Promote only the strongest recommendation

Several sources can share enough learned structure to cross the recommendation
threshold, but presenting every qualifying source does not help the user make a
choice. The popup now scores all eligible non-favorite video streams and moves
only one winner into Recommended Streams. Explicit video and audio tags remain
stronger signals than learned similarity; otherwise the highest learned score
wins. Equal scores keep the first captured source for deterministic behavior,
and every losing candidate remains visible in its normal quality category.

## 19. Correlate and reject extension-owned media fetches

Extension subtitle verification and manifest inspection fetch external media
while a user may be listening for another movie. Chrome reports these
service-worker responses with `tabId: -1`, the same shape used by legitimate
website service-worker traffic, so rejecting every no-tab request would break
capture. The existing `X-StreamHome-Sniffer` request marker must instead survive
request correlation. Internal records are persisted in session storage and
also placed in memory immediately to close the asynchronous-write race.
`onResponseStarted` consumes the record and returns before media
classification. Unmarked no-tab traffic continues through the normal active
task and tab gates.

## 20. Delete subtitle tracks from their owning context

A subtitle row needs a destructive action separate from selection and preview.
Deletion first updates the active checklist and deployment draft while
preserving all other checked tracks. Captured subtitles must also be removed
from their movie or exact TV episode, together with favorite/tag references,
captured headers, and quality metadata; using an explicit episode scope avoids
deleting from whichever episode happens to be active later. Saved deployment
subtitles are written back immediately. The storage operation is awaited so
the row cannot reappear after navigation or popup restoration.
