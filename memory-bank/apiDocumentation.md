# External API Documentation

Last verified: 2026-07-22

## TMDB

The popup uses TMDB v3 with the user-supplied TMDB API token.

- Search: `GET https://api.themoviedb.org/3/search/multi`
- Movie details: `GET https://api.themoviedb.org/3/movie/{id}`
- TV details: `GET https://api.themoviedb.org/3/tv/{id}`
- Season details: `GET https://api.themoviedb.org/3/tv/{id}/season/{season_number}`

Search results are restricted by the popup to supported media types. Season number `0` is valid and must not be rejected by truthiness checks.

## TheIntroDB

The popup optionally requests episode skip segments from:

`GET https://api.theintrodb.org/v3/media?tmdb_id={id}`

For TV content, the popup appends `season={season}&episode={episode}`. Movies use only the TMDB ID.

Returned millisecond values are normalized for StreamHome ingestion as seconds:

```json
{
  "intro": [{ "start": 0, "end": 86.4 }],
  "recap": [],
  "credits": [{ "start": 2530.1, "end": 2612.8 }],
  "preview": []
}
```

Missing data is non-fatal; deployment continues without skip markers.

## StreamHome ingestion

The saved server URL is normalized and used as the base for:

`POST {serverUrl}/api/add-movie`

Authentication is sent as `Authorization: Bearer {accessToken}`. The extension submits one selected video URL, an optional audio URL, replay headers for the selected captured video, metadata, selected subtitle tracks, and skip-marker arrays. See `mediaSenderAPI.md` for the current wire shape and compatibility note.

## Browser-side credentials

These are local extension state, not remote API endpoints:

- Active: `serverUrl`, `apiKey`, `tmdbApiKey`
- Logged-out drafts: `draftServerUrl`, `draftApiKey`, `draftTmdbApiKey`

Logout never sends or revokes the token remotely; it removes the active local/cookie representation and keeps a disconnected draft for reuse.
