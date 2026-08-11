# External API Documentation

Last verified: 2026-08-11

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

## StreamHome MediaSender

The saved server URL is normalized and MediaSender requests are sent by the
background service worker with `Authorization: Bearer {integrationKey}`.

- `POST /api/add-movie`: queue movie or TV ingestion;
- `GET /api/media/{media_id}/metadata`: extension compatibility endpoint for
  loading editable playback metadata;
- `PATCH /api/media/{media_id}/metadata`: replace all skip markers;
- `PUT` / `DELETE /api/media/{media_id}/subtitles/{track_id}`: add, replace, or
  remove one application-owned subtitle sidecar;
- `PUT` / `DELETE /api/media/{media_id}/audio/{language}`: add, replace, or
  remove one application-owned external dubbing sidecar.

The current StreamHome reference documents the mutations but not the GET read
route. Servers without that compatibility endpoint produce a visible editor
read error. See `mediaSenderAPI.md` for the exact extension operation map,
payload rules, ownership boundary, and persisted operation-state policy.

## Browser-side credentials

These are local extension state, not remote API endpoints:

- Active: `serverUrl`, `apiKey`, `tmdbApiKey`
- Logged-out drafts: `draftServerUrl`, `draftApiKey`, `draftTmdbApiKey`

Logout never sends or revokes the token remotely; it removes the active local/cookie representation and keeps a disconnected draft for reuse.
