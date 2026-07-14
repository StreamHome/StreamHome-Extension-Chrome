# Decision Log

This log tracks key architectural and design decisions made during the development of the **Antigravity Stream Sniffer** extension.

---

## Log Entry 1: Adopting Manifest V3 (MV3)
* **Status**: Accepted
* **Context**: Chrome and Chromium-based browsers are deprecating Manifest V2.
* **Decision**: Implement the extension using Manifest V3 standards. Use Service Workers (`background.js`) rather than persistent background pages, and utilize declarative rules for network header modifications where possible.

---

## Log Entry 2: Dynamic Referer Spoofing via `declarativeNetRequest`
* **Status**: Accepted
* **Context**: Streams often enforce CORS/Referer protections. In MV3, the blocking `webRequest` API is restricted or deprecated for modifying headers.
* **Decision**: Register dynamic rules dynamically under ID `1001` via `chrome.declarativeNetRequest.updateDynamicRules` when the local `player.html` tab launches. This updates headers asynchronously and securely.

---

## Log Entry 3: Storing Credentials via Cookies + Local Storage Fallback
* **Status**: Accepted
* **Context**: Extension configuration (Server URL, API Key, TMDB Key) must persist and be readable across both popup views and background contexts.
* **Decision**: Store values in extension cookies (scoped to localhost) for cross-context access, with a fallback to `chrome.storage.local` if cookie permissions or access fails.

---

## Log Entry 4: Outgoing Header Cache Expiry
* **Status**: Accepted
* **Context**: Outgoing request headers are tracked in a JavaScript `Map` inside `background.js` by `requestId` so they can be matched with corresponding response headers when they complete. Since not all requests trigger a response that we intercept, this map could grow indefinitely.
* **Decision**: Set up a `setInterval` sweep every 60 seconds that deletes entries in `activeRequestHeaders` older than 5 minutes.

---

## Log Entry 5: Media File Size Filter (500 KB Threshold)
* **Status**: Accepted
* **Context**: Websites load many small media components (images, audio clips, thumbnails, short advertisement clips, SVG icons) that clutter the sniffer UI.
* **Decision**: Filter out any progressive stream source response if `content-length` is present and less than 500,000 bytes (500 KB).

---

## Log Entry 6: Migrating to `chrome.storage.session` for Temporary Header Tracking
* **Status**: Accepted
* **Context**: Keeping outbound request headers in a local memory-bound JavaScript `Map` inside `background.js` works but causes data loss whenever Chrome suspends or terminates the extension's service worker due to inactivity.
* **Decision**: Store temporary request headers mapped by `requestId` using Chrome's built-in `chrome.storage.session` API. This persists the captured headers across background worker lifecycles while keeping them separate from disk persistence.

---

## Log Entry 7: sequential Promise Queue for Storage Updates
* **Status**: Accepted
* **Context**: Network media sniffing triggers dozens of concurrent network requests. Reading and writing tasks concurrently to `chrome.storage.local` causes race conditions where one stream update overwrites another.
* **Decision**: Queue all `chrome.storage.local` write operations through a sequential promise-based queue wrapper (`runInQueue`). Each update waits for the previous one to resolve before reading/writing data.

---

## Log Entry 8: Bundling Local Player Libraries
* **Status**: Accepted
* **Context**: Content Security Policies (CSP) in Manifest V3 restrict extensions from executing remote scripts (such as loading `hls.js` or `dash.js` CDN scripts) to prevent code injection.
* **Decision**: Bundle minified libraries (`hls.min.js` and `dash.all.min.js`) locally in the extension's root directory and declare them in `web_accessible_resources` inside `manifest.json`.

---

## Log Entry 9: Dynamic declarativeNetRequest Session Rules for Header Spoofing
* **Status**: Accepted
* **Context**: Creating static/dynamic DNR rules persists them indefinitely, potentially polluting rule indices or causing unexpected side-effects across browsing sessions.
* **Decision**: Use session-scoped rules (`chrome.declarativeNetRequest.updateSessionRules`) under Rule ID `1001` when the preview player runs. These rules automatically clear when the browser session ends or when explicitly cleared when the player tab unloads.

---

## Log Entry 10: Dynamic Video Quality Detection via Parsers and Player Metadata
* **Status**: Accepted
* **Context**: URL name matching is heuristic and fails to identify resolutions when filenames lack quality labels (e.g. `index.m3u8` or `manifest.mpd`). Moreover, adaptive multi-resolution feeds cannot reveal their sub-streams from the URL string alone.
* **Decision**: Upgrade sniffing by fetching and parsing manifest contents asynchronously in the background. If fetches fail, fallback to URL pattern matching. For direct video chunks (`.mp4`), query native height properties during play inside the preview tab and message the details back to the background worker.

---

## Log Entry 11: Custom Local Overrides and Video-as-Audio Dropdown Selection
* **Status**: Accepted
* **Context**: Standard HTML5 file selectors return restricted `C:\fakepath\...` strings for security reasons, which prevents the local ingestion server from retrieving absolute computer files. Furthermore, audio tracks on video sites are occasionally formatted as `.m3u8` stream segments, miscategorizing them as video tracks.
* **Decision**: Inject text input overrides for custom files and URLs in the UI, enabling manual absolute path overrides that are packageable within the payload. Simultaneously, display all captured video files inside the Audio Track select dropdown so alternate audio channels can be mapped without writing new heuristics.
