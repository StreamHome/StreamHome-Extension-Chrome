# Active Context

## Current Focus
- Polishing and maintaining responsive visual states, smooth transitions, and core user profile settings in the React-TypeScript Vite media client and FastAPI SQLite server.

## Recent Changes
- **2FA Security Hardening (TOTP & Lockouts):**
  - Integrated `pyotp` into the authentication backend (`routes/auth.py`).
  - Added user account failed login tracking and lockout mechanisms (15-minute lockouts after 5 consecutive password or verification failures) protecting against brute force.
  - Upgraded the Admin Control Center (`cli.py`) with a dedicated "Manage Users & 2FA Security Center" sub-menu supporting new registrations, password resets, 2FA setups, and administrative account unlocks.
  - Completely removed the old SMTP email/OTP verification systems, dependencies (`aiosmtplib`), and settings.
  - Implemented client-side Login Screen and secure TOTP input dialogs with high-fidelity passcode entry cells.
  - Added a responsive 2FA configuration card widget inside the client settings tab allowing users to view status, register TOTP keys via QR codes (using a fallback QR Server API), verify setups, or disable active 2FA parameters.
- **Profile Settings Draft Theme Decoupling:** Introduced a local form draft state `editProfileTheme` in `Dashboard.tsx` to hold chosen dropdown preferences, preventing active layout color/font shifts or checkbox highlights from previewing changes before clicking the "Save Changes" button.
- **Details View Auto-Dismiss on Tab Switch:** Resolved details view page lock by updating `handleTabChange` inside `App.tsx` to automatically call `setSelectedMovieForDetails(null)` and strip the `movie` query parameter, ensuring menu selections dismiss the details view instantly.
- **Netflix Theme Redesigns & Elements:**
  - **Active Tab Underline Glow:** Styled navbar tabs with a red active glow underline indicator (`shadow-[0_2px_10px_rgba(229,9,20,0.6)]`) and Bebas Neue logo.
  - **Netflix Movie Card Hover Details:** Designed cards to scale zoom smoothly on hover (`scale-[1.08]`) showing a bottom red outline border, Bebas Neue headings, Montserrat metadata badges, and an info View Details CTA.
  - **Immersive Details Modal:** Enhanced `#movie-details-modal` with a dark-red boundary glow (`shadow-[0_0_50px_rgba(229,9,20,0.15)]`), dynamic spring animation entrance, taller cinematic billboard background (`h-40 sm:h-52 md:h-64`), steep overlay gradients, and blocky active buttons (`rounded-sm` with active-down scaling).
  - **Local Downloaded Badge:** Embedded a circular frosted `Database` badge in the top-left corner of movie cards indicating offline/locally stored server video assets.
- **Cinematic Keyframe Animations & Spacing Tweaks:**
  - Added `.animate-kenburns` (slow panning zoom) and `.animate-fade-in-up` (spring slide fade-in) inside `index.css` and applied them to hero banner elements and tab page containers.
  - Resolved Ken Burns zoom backdrop image overflow by adding `overflow-hidden` to `#featured-banner` to clip the zooming background assets cleanly.
  - Spaced out buttons and rows for the Netflix theme by raising the billboard content bottom alignment (`bottom-20 md:bottom-24`) and reducing catalog negative top-margins (`-mt-4 md:-mt-6`).
- **Complete SVOD Tag Removal:** Removed all references of 'SVOD' (case-insensitive) from all layouts (e.g. Gemini brand logo, membership status, gdrive mount labels), description fields in `metadata.json`, code comments, and logging formats.
- **Dynamic Rclone Settings Toggle & Fallback Resilience:** Designed a persistent settings system utilizing `settings.json` (disabled by default) to toggle the storage engine dynamically between `LOCAL` and `CLOUD`. Integrated toggle switches and subpath input fields in Settings view with automatic save-on-blur. Implemented automated fallback handlers that redirect assets from temporary folders to local media catalog directories if the cloud upload pipeline crashes.
- **CLI Storage Settings TUI & Account Management:** Refactored `cli.py` storage engine and remote path prompts into an arrow-selectable sub-menu displaying values dynamically. Renamed User Center to "Account Management", removed the "Unlock User" option, and skipped email prompts for password resets/2FA setup, automatically targeting the registered default admin account.
- **Automated Setup Wizard & Dependency Auto-Installers:** Created `setup.bat` (Windows) and `setup.sh` (Linux/macOS) to install Python 3.11, Node.js 20, local portable **FFmpeg/FFprobe** binaries, and **Rclone**. Implemented an interactive CLI TUI wizard (`cli.py --setup`) featuring dynamic ASCII banner parsing, admin register/2FA setup, verified TMDB token checks against Movie ID `290250` via httpx, and storage setup.
- **Global Structured Logging & Print Cleanup:** Integrated standard python logging using `RotatingFileHandler` writing logs to `server/temp/app.log` (5MB max size, 3 backup files) and console stream, replacing all raw `print()` statements in route/service logic.
- **Database Schema Auto-Migrations:** Added `error_message`, `has_video`, `has_audio`, and `scan_quality` fields to `DownloadTask`, with dynamic startup auto-migrations in `db.py`.
- **Media Ingestion & Stream Scanner:** Enforced 5GB disk checking, ffprobe stream media component probing, and non-blocking REST notifications containing metadata sent to `VIDEO_SENDER_API_URL`. Implemented worker task retry loops with exponential backoff.
- **Startup Integrity Cleanups:** Added database cleanup hooks in `main.py` on startup to reset any dangling tasks in `DOWNLOADING`, `MERGING`, or `MOVING_CLOUD` to `FAILED` with an "Interrupted by server shutdown/restart" error log.
- **Transcode File Caching:** Created segment segment/file caching in `routes/stream.py` under `server/temp/transcode_cache/`. Cached dynamic transcode output is served directly via `FileResponse` for range-seek support.
- **Admin TUI Upgrades (cli.py):** Added setting options to view, set, or clear `VIDEO_SENDER_API_URL` and implemented a fully interactive task scrolling list and detailed inspector pane in the Monitor Queue panel.

## Next Steps
- Continue verifying production build size optimizations and client-side page load times under low-bandwidth simulation.
- Prepare the implementation plan for **Rclone Upload Progress Tracking** or **Automatic Subtitle Auto-Conversion (VTT to SRT)** when ready.
