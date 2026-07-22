# Product Context

Last verified: 2026-07-22

## Purpose

StreamHome Capture is a Chrome extension for collecting playable media sources from sites a user is already browsing, enriching them with TMDB metadata, previewing them, and sending a curated record to a StreamHome server.

## Primary workflow

1. Connect a StreamHome server and TMDB token.
2. Search for a movie or series, or create a custom record.
3. For a series, select the season and episode, including valid Season 0 specials.
4. Start listening in the source tab and play the desired media.
5. Review learned source tags, detected stream qualities, headers, and subtitles.
6. Preview the selected stream or subtitle when needed.
7. Deploy the selected video, optional audio, subtitles, metadata, and replay headers to StreamHome.

## User experience goals

- Make the current capture state unmistakable: idle, listening, processing, ready, error, or deployed.
- Keep dense technical information readable in the popup's 410 × 600 viewport.
- Avoid accidental cross-tab and cross-episode capture.
- Preserve long credential values after logout without silently reconnecting.
- Feel like part of StreamHome through the Ember dark-brown and orange visual identity.
- Support keyboard use and meaningful labels for interactive controls.

## Scope boundaries

The extension discovers and submits source metadata; it is not the StreamHome media server, a downloader, a DRM circumvention tool, or a recommendation engine. It relies on user-authorized access and browser-visible network traffic.
