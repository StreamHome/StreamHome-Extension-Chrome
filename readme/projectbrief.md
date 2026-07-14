# Project Brief

## Project Name
The Project - StreamHome Media Server

## Core Purpose
To build a robust, locally-hosted (with cloud storage capabilities) media server that acts as a personal streaming platform. The system securely ingests network-sniffed streaming URLs sent automatically from a custom browser extension, downloads and losslessly merges separated video/audio chunks using FFmpeg, enriches the titles with metadata from TMDB, and serves them through a sleek web interface.

## Key Requirements
- **Automated Network Ingestion:** Expose an API endpoint that accepts raw media stream parameters, detached source URLs, customizable target headers, language track overrides, and subtitle inputs sent directly from the browser extension.
- **Traffic Sniffing Integration:** A detached browser extension that acts identically to Video DownloadHelper, capturing active network traffic streams (.m3u8 manifests and direct media chunks) from third-party pirate streaming sites without relying on DOM obfuscation workarounds.
- **Asynchronous Processing Queue:** A background queue manager that pulls tasks from a sequential index and offloads heavy, long-running FFmpeg rendering and stream containment processes into dedicated background execution threads to protect the web server loop from freezing.
- **Rich Metadata Enrichment:** Automatic fetching of localized movie, series, and episode metadata from TMDB, including cast listings, plot descriptions, production details, and direct artwork downloads.
- **Self-Contained Portability:** Automatic downloading of high-quality assets (posters, backdrops, episode stills) straight into the title's dedicated directory structure on the hard drive rather than a global cache directory, ensuring all media folders remain completely portable.
- **Bulletproof Persistence Cache:** A lightweight SQLite database configured in Write-Ahead Logging (WAL) mode acting as a rapid query index. This layout is fully backed by an automated disk scanning recovery loop that reads independent local .metadata/metadata.json registries on server startup to fully rebuild missing or corrupted database records from scratch.
- **Admin CLI Control Center:** An interactive, terminal-based administration panel (cli.py) utilizing arrow-key navigation loop arrays for configuring storage modes, generating 32-character API tokens, registering accounts with bcrypt hashing, and monitoring live worker cues.
- **Multi-Theme Frontend Matrix:** A sleek, customizable TypeScript web UI supporting dynamic layout switches (including Netflix, Prime Video, Apple TV, and Gemini configurations) using client cookies to hold active profile settings during the core system testing phase.

## Target Audience
Personal use; acting as a highly optimized, automated streaming pipeline that strips away the manual overhead of downloading, renaming, formatting, and manual scraping.