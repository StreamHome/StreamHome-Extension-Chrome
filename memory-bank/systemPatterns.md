# System Patterns

This document describes the architectural layout, core technical APIs, and implementation patterns used in the **Antigravity Stream Sniffer** extension.

## Architecture Overview
The extension is built on the modern **Manifest V3** browser extension standard. It consists of three primary layers:

```
┌─────────────────────────────────────────────────────────────┐
│                       Popup UI                              │
│  - Settings / API Credential Gate                           │
│  - Task / Folder Creator (with TMDB Autocomplete Search)    │
│  - Active Streams list (grouped by resolution)              │
│  - Launch Preview Button                                    │
└───────────────┬───────────────────────────────▲─────────────┘
                │ Reads/Writes                  │ Listens for changes
                ▼                               │
┌───────────────────────────────────────────────┴─────────────┐
│                     chrome.storage.local                    │
│   Shared data store (tasks, streams, active settings)       │
└───────────────▲───────────────────────────────┬─────────────┘
                │ Writes streams (queued)       │ Reads active state
                │                               ▼
┌───────────────┴─────────────────────────────────────────────┐
│                 Background Service Worker                   │
│  - Sniffs HTTP traffic (chrome.webRequest)                  │
│  - Caches request headers in chrome.storage.session         │
│  - Serializes database writes via sequential promise queue  │
│  - Dispatches desktop discovery notifications               │
│  - Injects dynamic CORS/Referer bypass rules                │
└───────────────────────────────┬─────────────────────────────┘
                                │ Registers dynamic rules
                                ▼
┌─────────────────────────────────────────────────────────────┐
│                  declarativeNetRequest Rules                │
│  Modifies outbound Referer & Origin for preview playback     │
└─────────────────────────────────────────────────────────────┘
```

---

## Technical Stack & Libraries
1. **Core UI styling**: Custom CSS ([styles.css](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/styles.css)) generated using TailwindCSS compilation.
2. **HLS Playback**: [hls.min.js](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/hls.min.js) bundled directly in the extension workspace to enable local video previews.
3. **DASH Playback**: [dash.all.min.js](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/dash.all.min.js) bundled directly in the extension workspace to enable local dash video previews.
4. **Metadata Provider**: TMDB API v3 for cataloging movie and series attributes.

---

## Key Files & Responsibilities
* [manifest.json](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/manifest.json): Configuration, background worker registration, permissions (`webRequest`, `declarativeNetRequest`, `notifications`), and declaring `player.html`, `player.js`, `styles.css`, `hls.min.js`, and `dash.all.min.js` as web-accessible resources.
* [background.js](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/background.js): 
  * Captures requests via `chrome.webRequest.onSendHeaders` and responses via `chrome.webRequest.onResponseStarted`.
  * Caches outbound request headers mapped by `requestId` in asynchronous `chrome.storage.session` to survive service worker idle events.
  * Employs an async Promise serialization queue (`runInQueue`) to guarantee sequential database writes and eliminate storage race conditions.
  * Fires desktop notifications using `chrome.notifications.create` to alert the user when a high-quality stream is sniffed.
  * Manages dynamic header spoofing (DNR Rule 1001) for the preview player tab.
* [popup.html](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Popup/popup.html) / [popup.js](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Popup/popup.js): 
  * Renders views (Auth, Dashboard, Create Task, Streams Grouping, and Deploy Player).
  * Implements live autocomplete search against TMDB multi-search endpoint.
  * Handles local downloads using `chrome.downloads`, triggers preview tabs, and performs server deployment using `fetch` POST requests.
* [player.html](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/player.html) / [player.js](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/player.js):
  * A full-window video/audio player to preview streams in a new tab.
  * Communicates with `background.js` to set/clear DNR rules on load/unload.

---

## Important Patterns

### Dynamic CORS & Referer Spoofing
Many video streaming sites protect playlists (`.m3u8`/`.mpd`) by checking if the browser's request `Referer` or `Origin` header matches their website domain.
* To bypass this inside the preview tab (`player.html`), [background.js](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%2520Extension/background.js) listens for session rules configurations from `player.js`.
* It dynamically adds a `declarativeNetRequest` rule (ID: `1001`) modifying outbound XHR/media calls matching the stream's origin.
* When the preview tab unloads, it signals `background.js` to clear Rule `1001`.

### Storage Serialization Queue
Writing to `chrome.storage.local` is asynchronous. When a video player makes dozens of simultaneous segment/playlist network requests, the sniffer worker catches these concurrently.
* To avoid concurrent `chrome.storage.local.get` / `set` operations from overwriting each other, background.js chains all stream-processing tasks through a single, sequentially executed Promise queue.

### Quality/Resolution Detection
Discovered stream resolutions are detected dynamically using three layered mechanisms:
1. **Dynamic Manifest Parsing**: For HLS (`.m3u8`) and DASH (`.mpd`) streams, `background.js` executes background requests using captured authorization headers to fetch the playlists. Regex-based parsers scan the content for stream attributes (resolution coordinates) to extract all sub-stream qualities.
2. **Video Metadata Grabbing**: For progressive videos (e.g. `.mp4`), the Preview Player (`player.js`) listens for the video element's `loadedmetadata` event and queries `video.videoHeight` directly, sending a message back to the background worker to record the exact resolution.
3. **URL Name Heuristics**: If the manifest fetches fail or are blocked, the extension falls back to scanning the URL path for common patterns (e.g., `1080`, `720`, `fhd`, `hd`) to guess the resolution.

Mirror sources are labeled dynamically by searching for path patterns (e.g. `/mx/` is labeled as `Mirror Source (FHD - MX Premium Line)`).

### Favorite Streams Management
Favorited streams are stored dynamically inside a `favorites` array on each individual tracking task within `chrome.storage.local`.
* The UI detects favorites dynamically, rendering a yellow filled star icon for favorited URLs and a grey outline star for unfavorited ones.
* Toggling a favorite adds or removes the target URL from the `favorites` array and writes it back to storage.
* Reactive storage event listeners trigger automatic layout updates, removing favorited streams from their resolution categories and listing them under a dedicated, open-by-default "★ Favorite Streams" group at the very top of the streams list.
