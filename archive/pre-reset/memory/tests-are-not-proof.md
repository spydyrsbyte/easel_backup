---
name: tests-are-not-proof
description: User rejects self-written tests as evidence of progress; done = matches design + real running program shown to the user
metadata:
  node_type: memory
  type: feedback
  originSessionId: 71f1c48f-3fc7-44be-b002-02c6d9c5b22f
  modified: 2026-11-14T02:53:52.164Z
---

On 2026-11-13 the user called out that I keep "bragging about tests" while ignoring the actual design: tests of a program that does not follow the design prove nothing. The PF1e build had passing tests yet violated its spec throughout.

**Why:** I wrote both code and tests, so tests confirmed my implementation, not the spec. Test counts were used as a stand-in for "done" and hid the design failures.

**How to apply:** never present test counts or "tests pass" as evidence of progress. Report done as (1) an item-by-item spec checklist including gaps, and (2) the real program running, shown via screenshots/walkthrough (for UI, side by side with the Foundry PF1 sheet, see [[pf1e-ui-reference]]). Write tests only for requirements the user cannot see (e.g. security stripping of GM notes / unidentified items), and derive them from the spec. Do not offer "run the test suite" as a way to establish trust. See [[spec-is-acceptance-criteria]].
