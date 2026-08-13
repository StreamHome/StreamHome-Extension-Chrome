# StreamHome MediaSender Contract

Last verified: 2026-08-13

This document records the contract implemented by the Chrome extension. The
StreamHome reference in `StreamHome-memory-bank/mediasenderAPI.md` remains the
server-side authority; the extension code and current Git history remain the
implementation source of truth.

## Authentication and transport

Every MediaSender request is sent by `background.js`, not directly by the
popup. The service worker reads the active `serverUrl` and `apiKey`, validates
an HTTP(S) base URL without embedded credentials, adds
`Authorization: Bearer <integration-key>`, and applies a five-minute timeout.
The popup sends only an allowlisted operation name and the fields required for
that operation.

The integration key requires StreamHome's `ingest` permission. Operation state
is stored under `mediaSenderOperations` so a popup closure does not lose the
safe pending/success/error summary. Stored summaries never contain the API key,
source URLs, source headers, or response bodies.

FastAPI errors are read from `detail.code` and `detail.message`. The UI has
explicit handling for authentication, permission, media-readiness, size,
validation, upstream, and capability failures.

## Ingestion

### `POST {serverUrl}/api/add-movie`

The extension submits one selected HTTP(S) video source and may include one
detached HTTP(S) audio source, captured replay headers, compatible subtitles,
quality/language intent, and skip markers.

For HLS sources, `video_source_type` and `audio_source_type` are set to `hls`.
Other supported HTTP(S) sources use `auto` or omit the optional field. A URL
whose path happens to contain a quality label such as `1080p` is not treated as
video when manifest inspection has identified it as an audio rendition.

Movie payloads completely omit `season` and `episode`. TV payloads include a
non-negative season and a positive episode; Season 0 is valid.

Representative TV payload:

```json
{
  "tmdb_id": 1399,
  "media_type": "tv",
  "season": 0,
  "episode": 1,
  "video_url": "https://media.example/show/master.m3u8",
  "video_source_type": "hls",
  "audio_url": "https://media.example/show/tr/1080p.m3u8",
  "audio_source_type": "hls",
  "headers": {
    "Referer": "https://source.example/"
  },
  "quality": "1080p",
  "language": "tr",
  "subtitles": [
    {
      "language": "en",
      "url": "https://media.example/show/en.vtt"
    }
  ],
  "skip_markers": {
    "intro": [{ "start": 10, "end": 80 }],
    "recap": [],
    "credits": [],
    "preview": []
  }
}
```

All video, audio, and subtitle inputs must be absolute HTTP(S) URLs without
URL-embedded credentials. Local filesystem paths are not converted to a
server `/media` path.

## Playback metadata identity

Playback mutations use the canonical StreamHome media ID:

- movie: `m_<tmdb_id>`;
- episode: `ep_<tmdb_id>_s<season>_e<episode>`.

The service worker validates these values before constructing a request.
Mutations require a completed canonical media source; processing,
external-only, missing, or cache-only records may return `409 Conflict`.

## Metadata read compatibility endpoint

### `GET {serverUrl}/api/media/{media_id}/metadata`

The Edit playback interface needs a server read endpoint to show existing
skip markers, application-owned subtitle sidecars, and application-owned
external dubbing sidecars before replacing or deleting them. The extension
currently calls this route and accepts camelCase or snake_case collection
names for those three application-owned groups.

The response may wrap the collections in `metadata` or return them at the top
level. `status` should identify a completed/ready/success state and `mutable`
should be `true`; absent values remain compatible with the original collection
shape, but explicit non-ready or immutable values keep all editors blocked.
The extension reloads this route after every successful PATCH, PUT, or DELETE
and treats that read as canonical rather than applying an optimistic local
collection update.

The current StreamHome reference document defines `PATCH` on this path but
does not yet document `GET`. Therefore this is an explicit compatibility
requirement, not a claim that every deployed server already supports it. A
missing endpoint or media record produces a visible read-compatibility error;
the extension does not infer deletable tracks from the general playback
language list.

## Replace skip markers

### `PATCH {serverUrl}/api/media/{media_id}/metadata`

This operation replaces the complete marker document. It accepts only:

```json
{
  "skip_markers": {
    "recap": [],
    "intro": [{ "start": 120, "end": 210 }],
    "credits": [{ "start": 3400, "end": 3600 }],
    "preview": []
  }
}
```

The editor supports intro, recap, credits, and preview ranges, enforces a
positive duration and a 128-range total, and sends an empty object to clear all
markers. Clearing requires a second confirmation click.

## Subtitle sidecars

### `PUT {serverUrl}/api/media/{media_id}/subtitles/{track_id}`

Adds or replaces one application-owned subtitle:

```json
{
  "language": "en",
  "label": "English CC",
  "url": "https://media.example/subtitle-en.srt",
  "headers": {
    "Referer": "https://source.example/"
  }
}
```

The client-selected track ID contains 1-64 letters, numbers, underscores, or
hyphens. A detected subtitle pre-fills a stable ID such as `en-main`; a
collision receives a numeric suffix. Captured source headers are reused only
for the matching URL.

### `DELETE {serverUrl}/api/media/{media_id}/subtitles/{track_id}`

Deletes only the selected application-owned subtitle sidecar. Embedded or
otherwise server-owned subtitle tracks are outside this editor's ownership.

## External dubbing sidecars

### `PUT {serverUrl}/api/media/{media_id}/audio/{language}`

Adds or replaces one application-owned external dubbing language:

```json
{
  "url": "https://media.example/audio-tr.m4a",
  "source_type": "auto",
  "headers": {
    "Referer": "https://source.example/"
  }
}
```

`source_type` is `hls` for captured HLS audio renditions and `auto` otherwise.
This distinction prevents an HLS dubbing URL containing `1080p` from being
misclassified as a video-quality result. The mutation does not retransmit or
replace the completed main video.

### `DELETE {serverUrl}/api/media/{media_id}/audio/{language}`

Deletes only the application-owned external sidecar for that normalized
language. Embedded audio is intentionally not exposed as deletable metadata.

## Allowlisted operation map

| Popup operation | Method and path |
| --- | --- |
| `ingest` | `POST /api/add-movie` |
| `get_metadata` | `GET /api/media/{media_id}/metadata` |
| `replace_markers` | `PATCH /api/media/{media_id}/metadata` |
| `put_subtitle` | `PUT /api/media/{media_id}/subtitles/{track_id}` |
| `delete_subtitle` | `DELETE /api/media/{media_id}/subtitles/{track_id}` |
| `put_audio` | `PUT /api/media/{media_id}/audio/{language}` |
| `delete_audio` | `DELETE /api/media/{media_id}/audio/{language}` |

Unknown operations and unknown body fields are rejected before network access.
