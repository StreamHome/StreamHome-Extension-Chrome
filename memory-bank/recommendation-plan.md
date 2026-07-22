# Extension Roadmap

Last verified: 2026-07-22

This legacy filename previously contained a copied StreamHome server recommendation plan. The extension does not implement recommendations; this file now records extension-specific improvement candidates until the filename can be retired in a deliberate documentation cleanup.

## Priority 1: regression coverage

Create deterministic tests around:

- active task and active tab gates before and after manifest parsing;
- concurrent storage mutations;
- episode-scoped stream selection;
- Season 0 selection;
- active credential and disconnected-draft transitions.
- deployment-draft save, restore, and per-context isolation.

## Priority 2: manifest depth

Improve alternate-audio discovery, labeling, and preview selection across HLS and DASH without reintroducing segment noise.

## Priority 3: ingestion alignment

Verify the current server contract and change movie payloads to omit `season` and `episode` if required. Add a contract test before updating this memory bank to describe the new shape.

## Priority 4: frontend resilience

Test long titles, many task cards, narrow text translations, keyboard-only operation, and high zoom in the fixed popup viewport. Preserve Ember identity while keeping operational information legible.

## Not planned here

Recommendation-engine ranking, collaborative filtering, and server database work are outside this extension repository.
