# Active Context

## Current Focus
* **Stabilization & Enhancement**: Resolve critical browser extension bugs (RegExp syntax errors, ephemeral background worker state loss, storage write race conditions) and build a robust, premium HLS/DASH stream preview tab with custom CORS/Referer bypass rules.

---

## Active State
* All critical bugs have been resolved (corrected subtitle language regex, introduced `chrome.storage.session` for request headers, implemented promise-based write queue).
* A premium stream preview playback tab (`player.html` / `player.js`) has been implemented using local copies of `hls.min.js` and `dash.all.min.js`.
* Outbound referer/origin headers are dynamically modified on-the-fly via `chrome.declarativeNetRequest` session rules when the player is running.
* Interactive desktop notifications have been integrated to show resolution and stream type details immediately upon discovery.

---

## Next Steps
* Add dynamic parsing of HLS/DASH manifests to extract and present real available stream resolutions directly inside the popup interface instead of relying solely on URL pattern heuristics.
* Introduce auto-click script injection mechanisms to trigger stream initialization on target sites automatically.
* Integrate with custom notification filters to flag only highly specific qualities or sources.
