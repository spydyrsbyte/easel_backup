---
name: application-not-thin
description: "Easel applications are NOT thin wrappers; game-specific pieces belong in the application, not a module"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 61396447-4df2-4121-be72-7613b3d83536
  modified: 2026-10-30T03:31:18.135Z
---

An Easel application is not a thin wrapper around a module. It still follows the lego design (built from kit blocks), but any block that is specific to that game (e.g. Pathfinder schemas, rules, sheets, controller) belongs in the application package itself. Only genuinely reusable pieces go in kits (or a module).

**Why:** User has repeatedly been told the opposite. That rule came from Gemini-written docs (pf1e-reqs/00-Architecture-Guardrails.md, 08-PF1E-Application.md "under 10 lines") and the chess/checkers pattern. It contradicts Easel/design/manifest.md, where the application "owns the game's rules, wiring and persistence". MTG Table (~7,600 lines in the application) is the correct model.

For Pathfinder: the user is building one module shared by PF1e and D&D 3.5, named `easel.wotcogl35.rules` (2026-10-29). Anything that also holds under 3.5 rules stays in that module; anything PF1e-only goes in the PF1e application.

**How to apply:** Never recommend shrinking an application to a delegating stub or moving game-specific code into a module. Treat the "thin application" rules in pf1e-reqs as wrong. Related: [[kit-definition]].
