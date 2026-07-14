This extension, **Antigravity Stream Sniffer**, was created to solve a specific workflow problem for administrators and developers of self-hosted media streaming platforms and OTT (Over-the-Top) platforms.

## Purpose & Value Proposition
When managing a private streaming platform, acquiring high-quality media sources is often a manual, tedious, and multi-step process. 

This extension streamlines this workflow:
1. **Source Discovery**: The user browses the web to find a desired film or series on external video hosting/streaming sites.
2. **Automated Interception**: While the video plays, the extension transparently sniffs the network traffic to find HLS (`.m3u8`), DASH (`.mpd`), and progressive video (`.mp4`/`.webm`) links.
3. **Credentials & Authentication Capture**: Modern streaming sources are protected by temporal signatures, referer restrictions, or session cookies. The extension automatically captures these headers (e.g., `Cookie`, `Authorization`, `Referer`, `User-Agent`, `Origin`).
4. **Server Integration**: With one click, the stream URL and its exact authentication headers are dispatched to the user's self-hosted server (`/api/add-movie`), allowing the server backend (e.g., via FFmpeg) to download, combine, and host the media on their own platform.

---

## Target Audience
* Operators of personal/private streaming services (like Plex, Jellyfin, or custom media architectures).
* Developers testing streaming pipeline integrations.

---

## User Experience & Flows
```
[ User Searches TV/Movie on popup (via TMDB) ]
                      │
                      ▼
[ User Creates Tracking Folder / Episode Target ]
                      │
                      ▼
[ User activates "Sniffing" on a video platform ]
                      │
                      ▼
[ Network Sniffer captures .m3u8/.mpd URLs & headers ]
                      │
                      ▼
[ Popup groups streams by quality (1080p, 720p, etc.) ]
                      │
                      ▼
 ┌────────────────────┴────────────────────┐
 ▼                                         ▼
[ Preview in local player ]       [ Deploy to central server ]
                                  (Transfers URL + headers)
```
