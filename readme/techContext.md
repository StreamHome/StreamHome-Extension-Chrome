# Technical Context

## Core Technologies
- **Python:** 3.10+ (specifically running on Python 3.14 on the host based on environment traces).
- **FastAPI:** Core web framework for routing and API endpoints.
- **SQLModel:** ORM based on SQLAlchemy and Pydantic.
- **SQLite:** Lightweight relational database (`database.db`).
- **FFmpeg:** Underlying engine for video/audio manipulation and merging.
- **httpx & aiofiles:** For asynchronous HTTP requests (TMDB) and non-blocking file I/O operations.

## Development Setup
- Project is located in `c:\Users\deniz\Desktop\.all\Projects\The Project\server`.
- The entry point for the server is `main.py`, typically run via `uvicorn main:app --reload`.
- The entry point for the admin interface is `cli.py`.

## Constraints & Limitations
- Running on a Windows host requires specific async loop policies (e.g., `WindowsProactorEventLoopPolicy`) for subprocess management (FFmpeg).
- `subprocess` calls must avoid locking the main async event loop.
- Network requests to TMDB must gracefully handle rate limits and timeouts.
- Storage could become a bottleneck; there is integration support for `rclone` to move completed files to the cloud.
