---
name: pf1e-build
description: "Pathfinder 1e build of 2026-11-12/13: open extension design, package layout, how to verify, what is still open"
metadata:
  node_type: memory
  type: project
  originSessionId: d741c209-3a8b-42f4-9708-f4b0ac8da984
  modified: 2026-11-14T02:45:51.352Z
---

On 2026-11-12 the user asked to "build pathfinder 1e start to finish" with expandable libraries and homebrew support. The first build had a narrow "homebrew" plug-in; the user rejected that ([[open-design-not-plugin-slot]]) and it was rebuilt on 2026-11-13 so third-party subsystems (their examples: Path of War, Psionics, Spheres of Power, Kineticist) can be added from outside. Nothing was committed (the user had not asked).

What exists:
- `easel.wotcogl35.rules` (`server/easel/modules/wotcogl35/`): shared d20 3.x engine. Interfaces `engine@1`, `extension@1`, `content@1`. Derivation is a list of named steps (add/replace/wrap/remove); sources can carry changes, resources (pools readable as `@resources.<id>`), special attacks, toggles and `use` activations; magic systems are a registry (`vancian` supplied); generic registries via `engine.registry(name)`.
- `easel.pf1e.game` (`server/easel/applications/pf1e/`): PF1e tables, core pack, stat block parser, records `Creature` and `Entry`, sheet and library UI. Its own rolls, actions, card buttons and library kinds are registered in `server/core.mjs` through the same registries extensions use.
- `easel.pf1ekineticist.rules` (`modules/pf1e-kineticist/`): the proof extension, with burn resource, kinetic blasts, wild talent library kind, sheet tab, wrapped attack roll, and no core changes.
- `easel.pathofwar.rules` (`modules/pf1e-pathofwar/`, built 2026-11-13 at the user's request): stalker, warder, warlord, 54 maneuvers/stances of levels 1-3, Maneuvers sheet page. Class tables and maneuver effects were written from memory and are unchecked against the book. Building it added the client interface `easel.pf1e.sheetsection@1`, through which a module supplies browser code for its own sheet section types.
- `easel.pf1ehomebrew.example` (`modules/pf1e-homebrew/`): small house-rules example.
- Monsters use "statblock mode"; the old `easel.pf1e.rules` module was deleted.

Verify: `node --test scripts/test-pf1e.mjs`; `./scripts/test-security.ps1 -Package ./internal/server -Run Pathfinder` (set `EASEL_PLAYWRIGHT_MODULE` for the browser half); `node scripts/dev-pf1e.mjs <url> easel.pf1ehomebrew.example,easel.pf1ekineticist.rules,easel.pathofwar.rules`. Design, extension API and limits: `Easel/design/pf1e.md`.

AUDIT 2026-11-13 (user judged the build unprofessional): it does NOT meet `pf1e-reqs/`. Records are untyped (`Entry{kind,data:map}`, `Creature{sheet:map}`) against guardrail #6; wotcogl35 has no data schemas, security or automations (spec 05/06 unbuilt); `easel.d20` kit is unused and derive.mjs duplicates its math; `applications/pf1e/server/security.mjs` is a 6-line placeholder with no GM/unidentified/projection rules; content is JS literals; 13 tests. UI also judged poor ("worse than first-year students"): `client/sheet.mjs` is a 48 KB hand-rolled monolith instead of composing window/tabs, easel.d20 widgets and wotcogl35 panels (spec 08 "Compose, Don't Rebuild"); 8 of 11 spec tabs; breakdowns are `title` tooltips; flat identical grey boxes with no hierarchy; empty `catch {}` blocks. Plan agreed in principle: records (05) → shared panels (06) → rebuild sheet/workspace (08) against an agreed visual reference. Treat this as a prototype needing a foundation rebuild in spec order. See [[spec-is-acceptance-criteria]].

Still open: core pack is a starter set, not the full SRD; only slot-based casting ships (psionics/spheres would register a magic system and sections; none built); attacks roll against no target; `applications/pf1e/OGL.md` needs the official OGL 1.0a text pasted in (writing it verbatim was blocked by the output filter); the "Pathfinder" name needs Paizo's policy checked.

Found on the way: record removal is authorized as action `remove`, not `delete`; the VTT module's `delete` policies were fixed in `modules/vtt/server/security.mjs`.

**Why:** the user counts third-party content as homebrew and wants the whole design open to it.

**How to apply:** read `Easel/design/pf1e.md` first. Add new mechanics as extensions through the registries, never by editing core lists; if an extension cannot do something, open the core up rather than special-casing. Do not patch files with ad-hoc PowerShell string-replace helpers: one corrupted a test file here; use the Edit tool.
