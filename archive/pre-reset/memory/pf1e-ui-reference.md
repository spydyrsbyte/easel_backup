---
name: pf1e-ui-reference
description: The visual acceptance bar for the PF1e sheet/workspace is the Foundry VTT PF1 system sheet
metadata:
  node_type: memory
  type: feedback
  originSessionId: 71f1c48f-3fc7-44be-b002-02c6d9c5b22f
  modified: 2026-11-14T02:48:02.125Z
---

On 2026-11-13 the user named the Foundry VTT PF1 system character sheet as the standard the Easel PF1e UI must meet (after judging the existing UI worse than first-year student work).

**Why:** the user wants a recognisably professional, dense, play-ready d20 sheet, and Foundry PF1 is their mental model of that.

**How to apply:** reference templates live in `c:\Steam\Programming\Easel\_referenceOnly\Data\systems\pf1\templates\actors\` (no `public/`; spec 08's path is wrong), with `parts/actor-*.hbs` per tab. Match its information layout, tab set, hierarchy and density (spec 08 lists the 11 tabs). Use it as a layout/UX reference built from Easel kit bricks and Easel styling; do not copy its CSS, art or assets verbatim. Compare with screenshots side by side before calling UI work done. See [[spec-is-acceptance-criteria]], [[pf1e-build]].
