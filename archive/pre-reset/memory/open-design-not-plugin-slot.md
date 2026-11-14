---
name: open-design-not-plugin-slot
description: "\"Support homebrew\" means the whole game is open to hooking and modification, not a dedicated homebrew module or interface"
metadata:
  node_type: memory
  type: feedback
  originSessionId: d741c209-3a8b-42f4-9708-f4b0ac8da984
  modified: 2026-11-13T00:57:36.220Z
---

When the user asks for homebrew or house-rule support, they mean the design is open enough that anything can be hooked or modified: rules steps, roll kinds, sheet actions, library kinds, UI sections. They do not mean a special "homebrew" plug-in type, module or interface.

**Why:** On 2026-11-12 the Pathfinder build added an `easel.wotcogl35.homebrew@1` interface and an example homebrew module. The user said "I did not mean to have a Homebrew module, I meant ... everything was open enough with a design that allowed you to hook things or modify things."

**How to apply:** Build game logic as named, replaceable and wrappable pieces in registries that the application itself also uses, so an extension works the same way the core does. Avoid closed `switch` blocks and fixed lists. Don't label the extension point "homebrew". Related: [[pf1e-build]], [[kit-definition]].
