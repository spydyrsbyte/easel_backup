# 01 — Core Kits: Rules, Stacking, Derived Stats, & Resources

> **Concern Tier:** 1 — Core Generic RP Kits (`Easel/server/easel/server/library/`)
> **Prerequisite Reading:** [`00-Architecture-Guardrails.md`](00-Architecture-Guardrails.md)

---

## 1. Overview & Purpose

Before building any D&D or PF1e logic, the Core RP Kits need four foundational server calculation bricks ready for real-world RPG stat graphs and resource tracking:
1. **`easel.effects.stacking@1`** *(refine in-place)*: Support per-type stacking policies (e.g., `"strongest"` vs. `"stack"` per bonus key, plus rules where penalties always stack while only the highest positive bonus applies) in a single pass.
2. **`easel.characters.derived@1`** *(refine in-place)*: Support formula expressions and stacked modifier resolution at each node of the topological dependency graph while returning per-stat source breakdowns (`applied` audit trail).
3. **`easel.rules.formula@1`** *(new brick)*: Safe deterministic expression evaluator supporting `@path` variable lookups and standard RPG math functions (`floor`, `ceil`, `round`, `min`, `max`, `clamp`, `abs`, ternary `? :`).
4. **`easel.resources.charges@1`** *(new brick)*: Generic charge/use pool tracker supporting per-use deduction, daily/rest reset policies, and recharge formulas.

---

## 2. What It Is Pulling & Where From

| Target Brick | Source / Reference to Pull From | What to Reuse / Adapt |
|---|---|---|
| `easel.effects.stacking@1` | [`Easel/server/easel/server/library/effects/server/stacking.mjs`](../Easel/server/easel/server/library/effects/server/stacking.mjs)<br>[`_referenceOnly/Data/systems/pf1/help/en/Rules.md`](../_referenceOnly/Data/systems/pf1/help/en/Rules.md) | Keep existing `combine(effects, incoming, policy)` signature working for existing callers; add `resolve(effects, policies={})` (or overloaded `policy` object) that groups a list of `{key, value, source, ...}` modifiers by `key`, applies each key's policy (`strongest`, `stack`, `replace`, `strongestBonusStackPenalties`), and returns `{active, rejected, total}`. |
| `easel.characters.derived@1` | [`Easel/server/easel/server/library/characters/server/derived.mjs`](../Easel/server/easel/server/library/characters/server/derived.mjs)<br>[`Easel/server/easel/server/library/rules/server/modifier.mjs`](../Easel/server/easel/server/library/rules/server/modifier.mjs) | Keep existing `evaluate(inputs, definitions)` topological sort and cycle detection (`sum`, `product`, `min`, `max`, `average`); add support for `floor`, `ceil`, `formula` ops, and optional `modifiers` + `breakdown: true` so derived nodes can output both their resolved numeric value and the list of contributing sources. |
| `easel.rules.formula@1` | [`Easel/internal/automation/value.go`](../Easel/internal/automation/value.go)<br>[`_referenceOnly/Data/systems/pf1/help/en/Formulas.md`](../_referenceOnly/Data/systems/pf1/help/en/Formulas.md) | Pure recursive-descent tokenizer/evaluator in JS (never `eval` or `new Function`!). Resolves `@a.b.c` paths against a supplied `context` object, basic arithmetic (`+`, `-`, `*`, `/`, `%`, `**`), comparisons (`==`, `!=`, `<`, `<=`, `>`, `>=`), ternary (`cond ? a : b`), and functions (`floor`, `ceil`, `round`, `min`, `max`, `clamp`, `abs`, `ifelse`). |
| `easel.resources.charges@1` | [`Easel/server/easel/server/library/resources/server/pool.mjs`](../Easel/server/easel/server/library/resources/server/pool.mjs)<br>[`_referenceOnly/Data/systems/pf1/template.json`](../_referenceOnly/Data/systems/pf1/template.json#L795-L802) (`resource` template) | Pure methods `spend(resource, amount=1)`, `restore(resource, {period, amount})`, and `evaluateMax(resource, maxValue)` returning a proposed replacement `{value, max, per}` without mutating inputs. |

---

## 3. How to Build Each Piece

### 3.1 `easel.rules.formula@1`
- **Files to Create/Update**:
  - `Easel/server/easel/server/library/rules/server/formula.mjs`
  - `Easel/server/easel/server/library/rules/contracts/formula.server.md`
  - `Easel/server/easel/server/library/rules/manifest.json` (add `{"name": "formula@1", "file": "server/formula.mjs"}` under `server.interfaces`)
  - `Easel/server/easel/server/library/rules/catalog.json` (add `formula` member entry with test examples)
- **Methods**:
  - `evaluate(expression, context = {})` → returns finite number (throws on syntax error, division by zero, unknown function, or unresolved `@path` when strict).
  - `variables(expression)` → returns unique list of `@path` strings referenced by the expression (so `derived@1` can automatically infer dependency edges from formulas!).

### 3.2 In-Place Refinement of `easel.effects.stacking@1`
- **Files to Update**:
  - `Easel/server/easel/server/library/effects/server/stacking.mjs`
  - `Easel/server/easel/server/library/effects/contracts/stacking.server.md`
  - `Easel/server/easel/server/library/effects/catalog.json`
- **Methods**:
  - Preserve `combine(effects, incoming, policy = "replace")` so all existing tests pass unchanged.
  - Add `resolve(effects, policies = {}, defaultPolicy = "strongest")`:
    - Accepts an array of effect objects `{id?, key, value, source?}` and a policy map `{[key]: "strongest" | "stack" | "replace" | "bonusStrongestPenaltyStack"}`.
    - Returns `{ total, active: [...], suppressed: [...] }` so callers get both the net modifier and the exact breakdown of which bonuses won and which were suppressed by stacking rules.

### 3.3 In-Place Refinement of `easel.characters.derived@1`
- **Files to Update**:
  - `Easel/server/easel/server/library/characters/server/derived.mjs`
  - `Easel/server/easel/server/library/characters/contracts/derived.server.md`
  - `Easel/server/easel/server/library/characters/catalog.json`
- **Methods**:
  - Preserve `evaluate(inputs, definitions)` for `sum`, `product`, `min`, `max`, `average` with `offset`.
  - Add operators `floor`, `ceil`, `clamp` (`min`/`max` bounds on the definition), and `scale` (`factor` per input), and add `evaluateWithBreakdown(inputs, definitions, modifiers = {})` which returns `{ values, breakdowns }`.

### 3.4 `easel.resources.charges@1`
- **Files to Create/Update**:
  - `Easel/server/easel/server/library/resources/server/charges.mjs`
  - `Easel/server/easel/server/library/resources/contracts/charges.server.md`
  - `Easel/server/easel/server/library/resources/manifest.json`
  - `Easel/server/easel/server/library/resources/catalog.json`
- **Methods**:
  - `spend(pool, cost = 1)` → validates `value >= cost` and `cost >= 0`, returns updated `{...pool, value: pool.value - cost}`.
  - `restore(pool, { period, amount = null } = {})` → if `pool.per === period` (e.g. `"day"`, `"rest"`, `"round"`), restores `value` up to `pool.max` (or adds `amount` clamped to `pool.max`).

---

## 4. Anti-Spaghetti Guardrails for Section 01

- **DO NOT** hardcode PF1e bonus names (`"morale"`, `"deflection"`, `"dodge"`) or PF1e stat names (`"cmb"`, `"cmd"`, `"fort"`) inside `easel.effects`, `easel.characters`, `easel.rules`, or `easel.resources`. Those Core Kits must remain 100% genre-agnostic!
- **DO NOT** use JavaScript `eval()` or `Function()` inside `formula.mjs`. Write a small, deterministic tokenizer + parser (~80 lines) using only `./support.mjs`.
- **DO NOT** import across Kit folders (e.g., `derived.mjs` must not `import` from `../../effects/server/stacking.mjs`). If a brick only uses `./support.mjs`, keep it zero-dependency; if it needs another interface, declare `"required": {"interfaces": [...]}` in `manifest.json` and instantiate via `Easel.Interfaces.create(...)`.
- **DO NOT** add code comments.

---

## 5. Verification

Run both the Node kit contract suite and the Go Sobek kit integration suite:
```powershell
node --test scripts/test-kits.mjs
go test ./internal/session -run Kit
```
All existing and newly added `catalog.json` examples and failure checks must pass.
