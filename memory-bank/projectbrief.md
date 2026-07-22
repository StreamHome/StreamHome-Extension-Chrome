# Project Brief

Last verified: 2026-07-22

## Project

StreamHome Capture is a Manifest V3 Chrome extension that turns browser-observed media traffic into curated records for a StreamHome server.

## Problem

Streaming sources often expose several manifests, qualities, subtitles, and request-header requirements. Manually identifying the correct resources and entering their metadata into StreamHome is slow and error-prone.

## Solution

The extension provides a compact workflow that:

- identifies a movie or episode through TMDB;
- listens only in the chosen tab;
- extracts useful manifests, direct media, subtitles, and replay headers;
- lets the user review and preview the result;
- submits the selected record to StreamHome.

## Success criteria

- Captures are deterministic and isolated by task, tab, and episode.
- The popup communicates state clearly within 410 × 600 pixels.
- The UI follows StreamHome's Ember design language.
- Credentials remain local, and logout disconnects without losing typed values.
- Deployment failures are recoverable and understandable.

## Non-goals

The repository does not implement the StreamHome React application, FastAPI server, transcoding pipeline, or recommendation system. Those belong to the original StreamHome project and may only be used as integration and design references.
