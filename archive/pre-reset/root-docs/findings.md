# Findings

## Applications and source mod

- `Easel/` is the new Go/Sobek implementation; `_Easel/` contains the older implementation.
- The new system has two separate Magic applications: `mtg.game` ports the old Easel Magic application, while `mtgtable.game`, displayed as **MTG**, duplicates a Tabletop Simulator table.
- The selected reference is **MTG 6 player table - scripted**, workshop ID `2293586471`, stored in `../Mods/Workshop/2293586471.json`.
- MTG Table reproduces six colored seats, table artwork, card handling, counters, importers, scripted tools, and timers. It is a manual tabletop rather than a complete Magic rules engine. The original Lua is ported behavior, not executed directly; 3D physics and some accessories are excluded.

## Rendering and navigation

- MTG Table originally offered automatic seat-based flipping, wheel zoom, panning, and Alt-hover enlargement, but no manual camera rotation.
- Recent changes added camera rotation buttons and `[` / `]` shortcuts, a selector to focus any player's area, and an upright **Inspect card** context-menu view. Escape closes inspection.
- Rotation preserves the view center, and wheel zoom remains anchored under the cursor at different angles.
- Shadows, playmat edges, card highlights, and layered deck edges improve depth while retaining the 2D renderer.
- MTG game and browser checks passed, including the added navigation and inspection checks. Camera calculations were also checked at eight angles.

## Components, Kits, and libraries

- The server application manages the lobby, authentication decisions, games, and membership. Each running game has its own runtime, records, permissions, and connections.
- Browser components expose contracts containing properties, events, and slots. Components own their rendering; application code explicitly connects local UI events to authoritative server actions.
- Old Easel's Kits combined reusable browser components, server helpers, data, and permissions. Applications were intended to compose these capabilities and supply game-specific rules. GameKit and RPGKit demonstrate this approach, including shared card-table and renderer abstractions.
- The new system already supports Kits through manifests and versioned interfaces. Library stages register implementations before application stages; dependencies determine initialization order. Server implementation files can load lazily.
- Global libraries declared in `server/easel/server/server.json` are available without explicit application dependencies and load their library code on demand. They do not imply shared mutable game state.
- Packages communicate through interfaces rather than cross-package file imports. The board Kit already shares capabilities between Chess and Checkers, and the Pixi Kit supplies rendering.

## Architectural implication

MTG Table currently concentrates rendering and interactions inside the application. A reusable card-table Kit could own camera controls, inspection, selection, dragging, piles, and visual depth, while MTG supplies seat geometry, artwork, zones, scripted tools, and game-specific behavior. The existing library/interface system supports this separation; the recent visual changes did not perform that refactor.

References: `design/mtgtable.md`, `design/magic.md`, `design/component.md`, `design/interfaces.md`, `design/server.md`, and `../_Easel/docs/COMPONENT_AUTHORING.md`.

## Stable owner namespaces

Manifests now separate `owner`, `host`, package `name`, and release `version`. Qualified identifiers follow `owner.host.member`; bundled packages use owner `easel`. Interface and record namespaces stay stable across package releases and do not depend on the package name. The server creates nested record namespaces, and the browser uses the full owner/host identity when selecting implementations. Legacy alpha saves require separate conversion; no stored game data was deleted.
