# System Patterns

Last verified: 2026-07-22

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
- active credentials: `serverUrl`, `apiKey`, `tmdbApiKey`;
- disconnected drafts: `draftServerUrl`, `draftApiKey`, `draftTmdbApiKey`.

Logout first writes drafts, then removes credential cookies and active keys. Drafts populate the form but never count as an authenticated session.

## Preview request headers

Some sources require captured headers such as Referer or Origin. Player and reader tabs install a dynamic session rule scoped to their tab and remove it when finished. Rule IDs derive from tab IDs to avoid one preview replacing another.

## UI system

`styles.css` is generated from `input.css` by Tailwind. `ember-ui.css` is authored directly and supplies StreamHome identity: deep brown surfaces, ember-orange actions, peach text, thin borders, square terminal-like controls, subtle grid/scanline texture, and short state transitions.

Critical popup geometry is expressed with valid Tailwind utilities plus explicit component CSS. Dynamic cards provide keyboard activation and accessible names; destructive nested controls stop event propagation.

## Deployment boundary

The popup combines TMDB metadata, selected captured sources, request headers, subtitles, and optional skip markers, then posts them to the configured StreamHome ingestion endpoint. Errors remain recoverable; captured tasks are retained for retry.

## Verification pattern

For frontend changes, the minimum current checks are:

- rebuild `styles.css` when Tailwind classes change;
- run `node --check` for changed JavaScript;
- check HTML/JavaScript ID contracts and duplicate IDs;
- inspect popup/player/reader in a browser at their real dimensions;
- run `git diff --check` before committing.
