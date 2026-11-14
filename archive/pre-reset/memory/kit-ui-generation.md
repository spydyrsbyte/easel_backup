---
name: kit-ui-generation
description: "2026-11-12 UI pass — second-generation kit components, the Easel Tabletop VTT and the new chess/checkers table; how to work on them and what is still open"
metadata:
  node_type: memory
  type: project
  originSessionId: d741c209-3a8b-42f4-9708-f4b0ac8da984
  modified: 2026-11-12T22:18:34.738Z
---

On 2026-11-12 the kits got a second generation of browser components (shared `ui.mjs` + `kit.css`, `.ez-*` classes, `--ez-*` tokens) and two full game interfaces built from them: `easel.tabletop.game` (system-neutral VTT; map and shadowbox models ported from the old Node prototype in `_Easel`) and a new board table for chess/checkers. Design doc: `Easel/design/kit-ui.md`.

Canonical shared files live in `server/easel/server/library/client/`; after editing run `node scripts/sync-kit-support.mjs`. Components are declared once in `scripts/register-kit-ui.mjs` (writes contracts, manifests, catalogs). Visual work loop: `scripts/dev-server.ps1` (private PostgreSQL in `bin/dev/`, port 5199) plus `dev-shot.mjs`, `dev-two.mjs`, `dev-board.mjs`, `dev-kit.mjs`; restart the dev server after kit/module edits because games snapshot packages at start.

After the pass the user deliberately deleted the `pf1e`, `mtg` and `mtgtable` application folders because they used first-generation code; do not restore them, rebuild on the new components instead. The follow-up cleanup also removed the PF1e module's browser half, the VTT module's old binders, and the 13 superseded first-generation kit components (map@1, shadowbox@1, fog@1, ruler@1, vttworkspace@1, toolstrip@1, window@1, chatlog@1, journal@1, browser@1, directory@1, compendium@1, encounter@1); the PF1e server rules remain for a fresh Pathfinder application built on `easel.vtt.tabletop@1`. The rest of the first-generation toolbox stays: unused kit members are building blocks, not dead code. Still open: hex grids are modelled but not drawn; wall geometry is sent to players' browsers; chess has no check/checkmate/castling/en passant (king capture, resign or agreed draw end a game); board clocks are informational only.

**Why:** The user said the kits "feel like 2005" and wanted a professional VTT (most important) and board game UI with a Foundry/Roll20 feel but not a copy, and loved the `_Easel` map and shadowbox concepts.

**How to apply:** Build new game UI by composing these components per [[kit-definition]] and [[application-not-thin]]; who-sees-what stays on the server per [[game-roles-not-hard-permissions]]. Record fields of type `field` cannot be assigned whole from server JavaScript (set members one at a time); an application's `initialize` must await an async controller `mount`. See [[platform-completion-state]] for the platform side.
