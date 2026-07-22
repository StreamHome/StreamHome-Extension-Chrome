# Decision Log

Last verified: 2026-07-22

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
