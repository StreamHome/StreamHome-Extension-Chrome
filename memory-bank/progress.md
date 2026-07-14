# Project Progress

## Fully Functional Features

### 1. Connection & Session Setup
* **Credential Manager**: Persists settings (Server URL, API Key, and TMDB Key) across browser sessions using secure extension cookies, falling back to local storage if cookies are disabled.
* **Disconnect Handler**: Allows switching servers or keys cleanly by clearing local state.

### 2. Task Management
* **TMDB Live Autocomplete**: Real-time multi-title searching using TMDB API.
* **Episodic Detection**: Automatically toggles input fields for Season and Episode details when a TV/Series is selected.
* **Folder Storage**: Saves task objects under `chrome.storage.local`.

### 3. Background Sniffer Engine
* **Interception Filters**: Ignores non-media requests (images, CSS, JS, fonts) and segment files (`.ts`, `.m4s`, `.m2ts`) to avoid UI overload. Discards media files under 500 KB to filter out advertising clips.
* **Credential Grabber**: Automatically matches incoming stream payloads with outgoing headers.
* **Session Storage Header Capture**: Uses MV3-recommended `chrome.storage.session` to cache request headers asynchronously, ensuring zero state loss if the background service worker goes idle or is terminated.
* **Memory Protection**: Automatically sweeps and cleans temporary request-header session storage records older than 5 minutes.
* **Serialized Write Queue**: Implements an async serialized promise chain to write to local storage sequentially, completely avoiding data overwrite/race conditions.
* **Real-time Notifications**: Triggers a native system notification with stream information (e.g., format and resolution) when a new media URL is detected for the active task.

### 4. Grouped Traffic Visualization
* **Dynamic Resolution Categorization**: Filters streams into HSL-colored accordions (1080p, 720p, etc.) based on parsed resolutions or heuristic guesses.
* **Dynamic Quality Detection (Manifest Parser)**: Automatically fetches HLS (`.m3u8`) and DASH (`.mpd`) manifests in the background, dynamically parsing and recording their sub-stream resolutions (e.g. `1080p`, `720p`).
* **Progressive Metadata Grabber**: Collects real video resolution properties (like height coords) during progressive video playback in the Preview Player.
* **Mirror Identification**: Recognizes known mirror nodes (`mx`, `ma`, `m8`) and maps them to descriptive naming labels.
* **Robust Subtitle Matcher**: Fully resolves language tags (e.g., English vs Turkish) from subtitle paths using error-free, dynamically constructed regex matching.
* **Favorite Streams Toggler**: Allows users to star individual stream sources. Favorited streams are persisted inside local storage and dynamically moved to a dedicated "Favorite Streams" group at the top of the accordion view.

### 5. Media Playback & Action Controls
* **CORS Referer Bypass**: Intercepts and modifies outgoing request headers (`Referer`, `Origin`, `User-Agent`) dynamically matching the stream's origin using `chrome.declarativeNetRequest` session rules (Rule ID `1001`) during player preview.
* **Stream Preview Player**: A full-window dark-mode player ([player.html](file:///C:/Users/deniz/Desktop/.all/Projects/The%20Project%20Extension/player.html)) equipped with bundled, local-compliant copies of `hls.min.js` and `dash.all.min.js` to preview both HLS (`.m3u8`) and DASH (`.mpd`) video feeds securely.
* **Browser Download**: Triggers a direct file download inside Chrome.
* **Remote Server Deploy**: Packages the stream URL, type, TMDB metadata, and matched headers into a JSON payload and dispatches it to `/api/add-movie`.
* **Custom Local Sources Override**: Provides dedicated text boxes allowing users to input absolute local file paths (e.g. `C:\Movies\movie.mp4`) or custom URLs, completely bypassing sniffed streams if desired.
* **Unified Audio Selection**: Merges both audio-only streams and video-only/unified streams inside the Audio Track dropdown selection, allowing users to pair any video source as an alternate audio channel.

---

## Future Enhancements
* **Auto-sniffing Automation**: Incorporate automatic web-automation mechanisms or browser scripts to auto-click play on detected streaming links.
