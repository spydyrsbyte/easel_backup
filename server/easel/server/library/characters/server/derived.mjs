import { bounded, copy, list, number, record, key, unique } from "./support.mjs";
function service(name) {
  const value = globalThis.Easel?.Interfaces?.create?.(name);
  if (!value) throw new Error("Derived values require " + name);
  return value;
}
function ownPath(obj, name) {
  let cur = obj;
  for (const seg of String(name).split(".")) {
    if (
      cur === null ||
      cur === undefined ||
      typeof cur !== "object" ||
      !Object.prototype.hasOwnProperty.call(cur, seg)
    )
      return undefined;
    cur = cur[seg];
  }
  return cur;
}
function lookupValue(ctx, name) {
  if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
  if (Object.prototype.hasOwnProperty.call(ctx, "@" + name))
    return ctx["@" + name];
  return ownPath(ctx, name);
}
function hasValue(ctx, name) {
  const v = lookupValue(ctx, name);
  return v !== undefined && v !== null;
}
function filterStackedModifiers(sorted, policies) {
  if (policies === undefined || policies === null) return sorted;
  const eligible = sorted.filter((m) => (m.op ?? "add") === "add" && (m.key ?? m.bonusType ?? m.type) != null);
  const active = service("easel.effects.stacking@1").resolve(eligible, policies, "strongest").active;
  const indices = new Set(active.map((m) => m.index));
  return sorted.filter((m) => (m.op ?? "add") !== "add" || (m.key ?? m.bonusType ?? m.type) == null || indices.has(m.index));
}
export default class DerivedTool {
  evaluate(inputs, definitions) {
    if (arguments[2] !== undefined) {
      const opts = record(arguments[2]);
      if (opts.breakdown)
        return this.evaluateWithBreakdown(
          inputs,
          definitions,
          opts.modifiers ?? {},
          opts.policies,
        );
      return this.evaluateWithBreakdown(
        inputs,
        definitions,
        opts.modifiers ?? {},
        opts.policies,
      ).values;
    }
    return this.evaluateWithBreakdown(inputs, definitions).values;
  }
  evaluateWithBreakdown(inputs, definitions, modifiers = {}, policies = undefined) {
    record(inputs);
    record(modifiers);
    for (const [k, mods] of Object.entries(modifiers)) {
      key(k);
      for (const m of list(mods)) {
        record(m);
        number(m.value);
      }
    }
    unique(list(definitions).map((d) => key(record(d).id)));
    const values = copy(inputs),
      breakdowns = {},
      pending = definitions.map((d) => {
        const explicitInputs = d.inputs ?? d.deps;
        let deps,
          ast = null;
        if (d.op === "formula") {
          ast = d.formula;
          if (explicitInputs !== undefined) {
            deps = list(explicitInputs).map((item) => key(item));
          } else {
            deps = service("easel.rules.formula@1").variables(d.formula);
          }
        } else {
          deps = list(explicitInputs).map((item) => key(item));
        }
        return { ...d, deps, ast };
      });
    while (pending.length) {
      const at = pending.findIndex((d) =>
        d.deps.every(
          (id) => !pending.some((p) => p.id === id) && hasValue(values, id),
        ),
      );
      if (at < 0) throw new Error("Missing or cyclic dependency");
      const d = pending.splice(at, 1)[0],
        terms = d.op === "formula" ? [] : d.deps.map((id) => number(lookupValue(values, id)));
      let value;
      if (d.op === "sum") value = terms.reduce((a, b) => a + b, 0);
      else if (d.op === "product") value = terms.reduce((a, b) => a * b, 1);
      else if (d.op === "min" && terms.length) value = Math.min(...terms);
      else if (d.op === "max" && terms.length) value = Math.max(...terms);
      else if (d.op === "average" && terms.length)
        value = terms.reduce((a, b) => a + b, 0) / terms.length;
      else if (d.op === "floor" && terms.length)
        value = Math.floor(
          terms.reduce((a, b) => a + b, 0) * number(d.factor ?? 1),
        );
      else if (d.op === "ceil" && terms.length)
        value = Math.ceil(
          terms.reduce((a, b) => a + b, 0) * number(d.factor ?? 1),
        );
      else if (d.op === "scale" && terms.length) {
        if (Array.isArray(d.factors)) {
          if (d.factors.length !== terms.length)
            throw new RangeError("Mismatched scale factors");
          value = terms.reduce(
            (sum, t, i) => sum + t * number(d.factors[i]),
            0,
          );
        } else if (d.factors && typeof d.factors === "object") {
          record(d.factors);
          for (const [fk, fv] of Object.entries(d.factors)) {
            key(fk);
            number(fv);
          }
          value = terms.reduce(
            (sum, t, i) => sum + t * number(d.factors[d.deps[i]] ?? 1),
            0,
          );
        } else {
          const factor = number(d.factor);
          value = terms.reduce((a, b) => a + b * factor, 0);
        }
      } else if (d.op === "clamp" && terms.length) {
        value = bounded(
          terms.reduce((a, b) => a + b, 0) + number(d.offset ?? 0),
          d.min,
          d.max,
        );
      } else if (d.op === "formula") {
        value = number(service("easel.rules.formula@1").evaluate(d.ast, values));
      } else throw new Error("Unknown derived operator");
      let base =
        d.op === "clamp"
          ? number(value)
          : number(value + number(d.offset ?? 0));
      if (d.op !== "clamp" && (d.min !== undefined || d.max !== undefined)) {
        const min = d.min === undefined ? base : number(d.min),
          max = d.max === undefined ? base : number(d.max);
        base = bounded(base, min, max);
      }
      const modList = [
        ...(d.modifiers === undefined ? [] : list(d.modifiers)),
        ...(modifiers[d.id] === undefined ? [] : list(modifiers[d.id])),
      ];
      let finalValue = base;
      const applied = [],
        sorted = modList
          .map((m, index) => {
            record(m);
            return {
              ...copy(m),
              index,
              priority: number(m.priority ?? 0),
            };
          })
          .sort((a, b) => a.priority - b.priority || a.index - b.index),
        activeMods = filterStackedModifiers(
          sorted,
          d.policies ?? d.stacking ?? policies,
        );
      for (const m of activeMods) {
        if (m.enabled === false) continue;
        const before = finalValue,
          op = m.op ?? "add";
        number(m.value);
        if (op === "add") finalValue += m.value;
        else if (op === "multiply") finalValue *= m.value;
        else if (op === "override") finalValue = m.value;
        else throw new Error("Unknown modifier");
        number(finalValue);
        applied.push({
          id: String(m.id ?? m.source ?? m.index),
          before,
          after: finalValue,
        });
      }
      values[d.id] = finalValue === 0 ? 0 : finalValue;
      breakdowns[d.id] = {
        base: base === 0 ? 0 : base,
        value: values[d.id],
        applied,
      };
    }
    return { values, breakdowns };
  }
}
