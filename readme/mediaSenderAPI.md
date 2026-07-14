# Media Sender System API

The Media Sender System (custom browser extension or traffic sniffer) sends media stream payloads directly to the StreamHome Media Server via the `/api/add-movie` ingestion endpoint. 

---

## Authentication
Every request to the ingestion endpoint must include an HTTP Authorization header containing the server's API Bearer Token.

* **Header Format:** `Authorization: Bearer <API_BEARER_TOKEN>`
* **Active Token (from .env):** `30e051ad8f3a7d80010428da572f4974`

---

## Ingestion Endpoint Details
* **URL:** `http://localhost:8000/api/add-movie`
* **Method:** `POST`
* **Content-Type:** `application/json`

---

## API Request Fields (JSON Schema)

| Field Name | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `tmdb_id` | Integer | Yes | The Movie Database (TMDB) identifier for the movie or TV show. |
| `media_type` | String | Yes | Type of media asset: `"movie"` or `"tv"` (or `"series"`). |
| `video_url` | String | Yes | Direct HTTP stream manifest or video file source URL (e.g. `.m3u8` or `.mp4`). |
| `audio_url` | String | No | Detached audio stream URL (used if video and audio chunks are sent separately). |
| `season` | Integer | No | Season number. Required only for TV episodes (e.g., `1`). |
| `episode` | Integer | No | Episode number. Required only for TV episodes (e.g., `1`). |
| `headers` | Object | No | Key-value dictionary of HTTP headers (e.g., `Referer`, `User-Agent`, `Cookie`) needed to losslessly download the streams. |
| `subtitles` | Array | No | Array of subtitle sources containing `{ "language": string, "url": string }` blocks. |
| `quality` | String | No | Target capture resolution label (e.g. `"1080p"`, `"720p"`). |
| `language` | String | No | Standard two-letter language code of the audio track (e.g. `"en"`, `"tr"`). Overrides original TMDB language. |

---

## Ingestion Payload Samples

### 1. Movie Ingestion Sample (e.g., Fight Club)
```json
{
  "tmdb_id": 550,
  "media_type": "movie",
  "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  "audio_url": null,
  "headers": {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://streamprovider.org/movie/fight-club"
  },
  "subtitles": [
    {
      "language": "en",
      "url": "https://streamprovider.org/subtitles/fight-club-en.vtt"
    },
    {
      "language": "tr",
      "url": "https://streamprovider.org/subtitles/fight-club-tr.vtt"
    }
  ],
  "quality": "1080p",
  "language": "en"
}
```

### 2. TV Series Episode Ingestion Sample (e.g., Game of Thrones Season 1, Episode 1)
```json
{
  "tmdb_id": 1399,
  "media_type": "tv",
  "season": 1,
  "episode": 1,
  "video_url": "https://streamprovider.org/series/got_s01e01_video.m3u8",
  "audio_url": "https://streamprovider.org/series/got_s01e01_audio.m3u8",
  "headers": {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://piratestreaming.tv",
    "Cookie": "session_id=abc123xyz"
  },
  "subtitles": [
    {
      "language": "en",
      "url": "https://piratestreaming.tv/subs/got_1_1_en.vtt"
    }
  ],
  "quality": "1080p",
  "language": "en"
}
```

---

## Integration Execution Samples

### 1. Browser Extension JavaScript Fetch Example
```javascript
const payload = {
  tmdb_id: 550,
  media_type: "movie",
  video_url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
  headers: {
    "User-Agent": navigator.userAgent,
    "Referer": window.location.href
  },
  quality: "1080p",
  language: "en"
};

fetch("http://localhost:8000/api/add-movie", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer 30e051ad8f3a7d80010428da572f4974"
  },
  body: JSON.stringify(payload)
})
.then(res => res.json())
.then(data => {
  console.log("Ingestion Success:", data);
})
.catch(err => {
  console.error("Ingestion Failed:", err);
});
```

### 2. terminal Curl Command Example
```bash
curl -X POST "http://localhost:8000/api/add-movie" \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer 30e051ad8f3a7d80010428da572f4974" \
     -d '{
       "tmdb_id": 550,
       "media_type": "movie",
       "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
       "quality": "1080p",
       "language": "en"
     }'
```

### 3. Python Integration Script Example
```python
import requests

url = "http://localhost:8000/api/add-movie"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer 30e051ad8f3a7d80010428da572f4974"
}

payload = {
    "tmdb_id": 550,
    "media_type": "movie",
    "video_url": "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
    "quality": "1080p",
    "language": "en"
}

response = requests.post(url, json=payload, headers=headers)
print("Status:", response.status_code)
print("Response JSON:", response.json())
```

---

## API Response Schema

### Success Response (`201 Created`)
```json
{
  "status": "success",
  "taskId": "7d9539bf-811c-4b5b-a621-e970b13dc00a",
  "title": "Fight Club",
  "message": "Media download task queued successfully."
}
```

### Error Responses
* **Unauthorized (`401 Unauthorized`):** If the Authorization header is missing or incorrect.
  ```json
  {
    "detail": "Invalid or missing API Bearer token."
  }
  ```
* **Validation Error (`422 Unprocessable Entity`):** If any required parameter is missing or has incorrect types.
