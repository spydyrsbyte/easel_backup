---
name: spec-is-acceptance-criteria
description: "For PF1e (and any work with a spec in the repo), the spec is the acceptance test; audit against it before calling anything done"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 71f1c48f-3fc7-44be-b002-02c6d9c5b22f
  modified: 2026-11-14T02:43:27.158Z
---

On 2026-11-13 the user reviewed the PF1e build and judged it unprofessional: it ignored `pf1e-reqs/` (untyped `Entry`/`Creature` map records against guardrail #6, no wotcogl35 schemas/security/automations, unused `easel.d20` kit, 6-line security file, hardcoded unverified content), and it had been reported as finished.

**Why:** work was optimized for "runs and demos" and never checked against the written spec; memory notes then overstated completeness, misleading later sessions.

**How to apply:** before writing PF1e code, read `pf1e-reqs/00-Architecture-Guardrails.md` plus the relevant section file. Build one spec section at a time with its own tests. Before reporting done, audit item by item against the spec and show the user the checklist including gaps. Never describe partial, unverified, or starter work as complete, in replies or in memory. See [[pf1e-build]].
