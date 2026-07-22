# StreamHome Media Sender Contract

Last verified: 2026-07-22

This document describes what the Chrome extension currently sends. It is not a complete specification of the StreamHome server.

## Endpoint

`POST {serverUrl}/api/add-movie`

The request is authenticated with the saved StreamHome access token and sent as JSON.

## Payload responsibilities

The extension assembles:

- TMDB identity and media type.
- Season and episode selection for TV content.
- One selected `video_url` and an optional `audio_url`.
- Source request headers needed to replay protected or referer-bound media. Captured headers are included only when the captured video URL itself is selected, not when a custom video URL overrides it.
- Selected subtitle tracks.
- Optional intro and credits segments from TheIntroDB.
- Optional custom record metadata supplied in the popup.

Representative current shape:

```json
{
  "tmdb_id": 12345,
  "media_type": "tv",
  "season": 1,
  "episode": 2,
  "video_url": "https://origin.example/master.m3u8",
  "audio_url": null,
  "headers": {
    "referer": "https://source.example/"
  },
  "quality": "1080p",
  "language": "en",
  "subtitles": [
    {
      "url": "https://origin.example/en.vtt",
      "language": "en"
    }
  ],
  "skip_markers": {
    "intro": [{ "start": 0, "end": 86.4 }],
    "recap": [],
    "credits": [{ "start": 2530.1, "end": 2612.8 }],
    "preview": []
  }
}
```

The fixed top-level fields are `video_url`, `audio_url`, `media_type`, `tmdb_id`, `season`, `episode`, `headers`, `quality`, `language`, `subtitles`, and `skip_markers`. Subtitle entries contain `language` and `url`. TheIntroDB values are accepted in either second-based `start`/`end` or millisecond `start_ms`/`end_ms` form, rounded to two decimal seconds, and normalized into the four marker arrays.

## Movie compatibility note

The current popup implementation emits `season: null` and `episode: null` for movies. The StreamHome server memory bank describes omission of those fields as the preferred movie contract. Until the implementation is aligned and verified, documentation must not claim that the extension omits them.

## Response handling

A successful response marks deployment complete in the popup. HTTP failures and network errors are surfaced to the user and do not delete the captured task, allowing correction or retry.
