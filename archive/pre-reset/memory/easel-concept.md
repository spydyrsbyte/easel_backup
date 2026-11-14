---
name: easel-concept
description: "What Easel is — a VTT platform with developer experience first, built Lego-style from Kits and Libraries; multi-server isolation rules"
metadata:
  node_type: memory
  type: project
  originSessionId: d741c209-3a8b-42f4-9708-f4b0ac8da984
  modified: 2026-11-12T01:31:27.192Z
---

Easel is a VTT / tabletop game platform whose first priority is the developer experience. The backend exists to support Kits and Libraries so games are built in a "Lego-like" way: a kit is a series of controls that stack on top of each other to build out a concept faster (see [[kit-definition]], [[application-not-thin]]).

Decisions made 2026-11-11 while finishing the platform (EASEL-COMPLETION-REVIEW.md):
- One installation can run several logical servers with **no cross talk**: accounts, games, data, settings are all per-server, not installation-wide.
- Suspended games keep only durable records and scheduled events; JS state is rebuilt on resume; timers do not fire while suspended.
- Export/import: accounts are separate per server, so imports map accounts explicitly.
- Editions (GM / Group / Unrestricted) are built with Go build tags from one codebase.
- Package update channels: HTTPS JSON manifest, plus a local directory source for tests.

**Why:** AI-written designs and reviews of Easel tend to forget the core concept. The user wants to be told when a design or implementation drifts from the kit/Lego model or when their design itself has problems.

**How to apply:** Check new platform work against the kit/library building-block model and flag conflicts to the user rather than silently working around them.
