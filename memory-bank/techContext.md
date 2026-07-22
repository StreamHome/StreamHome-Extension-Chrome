# Technical Context

Last verified: 2026-07-22

## Platform

- Chrome Extension Manifest V3
- Vanilla JavaScript and HTML
- Tailwind CSS 3.4.x for generated utilities
- Authored `ember-ui.css` for the StreamHome theme and component refinements
- Vendored HLS.js and dash.js for preview playback

There is no application framework, bundler, TypeScript layer, or automated test runner in the current repository.

## Key files

- `manifest.json`: permissions, host access, service worker, and extension surfaces.
- `background.js`: network capture and browser-rule orchestration.
- `popup.html`, `popup.js`: main workflow.
- `player.html`, `player.js`: media preview.
- `reader.html`, `reader.js`: subtitle preview.
- `input.css`: Tailwind input.
- `styles.css`: generated Tailwind output; do not hand-edit.
- `ember-ui.css`: authored shared theme layer.
- `tailwind.config.js`: content scanning for popup, player, and reader sources.

## Browser APIs and permissions

The implementation depends on `chrome.storage`, `chrome.tabs`, `chrome.cookies`, `chrome.webRequest`, and `chrome.declarativeNetRequest`. Host permissions are broad because capture and preview sources are user-selected and not known in advance.

## Local development

Install dependencies with npm, then generate CSS with:

```powershell
npm.cmd run build
```

Useful syntax checks:

```powershell
node --check background.js
node --check popup.js
node --check player.js
node --check reader.js
```

Load the repository root as an unpacked extension in a Chromium browser for functional validation. Service-worker logs and popup/player/reader developer tools are separate contexts.

## Constraints

- Manifest V3 service workers may suspend, so durable coordination cannot rely only on process memory.
- `webRequest` events can arrive concurrently and outlive the UI state that initiated them.
- Dynamic request-header rules require careful tab scoping and cleanup.
- The popup viewport is fixed and must accommodate long metadata and task lists without hidden controls.
- Tokens and captured headers are sensitive local data and must never be logged or committed.
