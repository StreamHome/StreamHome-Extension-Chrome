# Product Context

## Why this project exists
Modern streaming ecosystems are fragmented. The user wants a centralized, self-hosted solution that acts as a unified library. External scrapers or extensions can capture raw media streams (video/audio/subtitles) and push them to this server. The server then enriches the raw data, downloading posters, synopses, and cast details, offering a premium streaming experience.

## Problems Solved
- **Media Fragmentation:** Brings content from disparate sources into one unified interface.
- **Data Persistence & Safety:** By reading the `metadata.json` created by the media sender system locally alongside the media files, the backend can automatically recover and rebuild its database if it gets wiped, ensuring no media mapping is ever permanently lost.
- **Automated Cataloging:** Reduces the manual effort of downloading files, renaming them, and matching them with a scraper like Plex or Jellyfin. The ingestion API handles it instantly.

## How it should work
1. **Ingestion:** A POST request containing URLs, TMDB ID, and language is sent to `/api/add-movie`.
2. **Task Queue:** The server adds the item to the database as a `DownloadTask`.
3. **Download & Merge:** `queue.py` and `ffmpeg.py` handle downloading the chunks/streams and merging audio and video into a single MP4/MKV.
4. **Metadata & Asset Cataloging:** The media is added to the SQLite database. Local images (posters and backdrops) are downloaded directly into the media directory. (Note: the `.metadata` subdirectory and its JSON config file are created and managed exclusively by the external media sender system).
5. **Playback:** The user streams content directly via a modern web interface featuring responsive layouts (displaying exactly 5 cards on desktop viewports) and customizable player themes.
