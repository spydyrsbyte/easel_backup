import { copy, list, number, record, key } from "./support.mjs";
const VALID_POLICIES = new Set([
  "replace",
  "reject",
  "stack",
  "sum",
  "strongest",
  "highest",
  "bonusStrongestPenaltyStack",
  "strongestBonusStackPenalties",
  "sumBySource",
  "stackBySource",
]);
const effectKey = (e) => key(e.key ?? e.bonusType ?? e.type);
export default class StackingTool {
  combine(effects, incoming, policy = "replace") {
    list(effects);
    record(incoming);
    const incKey = effectKey(incoming);
    let resolvedPolicy = policy;
    if (policy && typeof policy === "object") {
      record(policy);
      for (const [k, p] of Object.entries(policy)) {
        key(k);
        if (!VALID_POLICIES.has(p)) throw new Error("Unknown stacking policy");
      }
      resolvedPolicy = policy[incKey] ?? "replace";
    }
    if (!VALID_POLICIES.has(resolvedPolicy))
      throw new Error("Unknown stacking policy");
    const same = effects.filter((e) => effectKey(record(e)) === incKey),
      others = effects.filter((e) => effectKey(record(e)) !== incKey);
    if (!same.length) return [...copy(effects), copy(incoming)];
    if (resolvedPolicy === "reject") throw new Error("Effect present");
    if (resolvedPolicy === "stack" || resolvedPolicy === "sum")
      return [...copy(effects), copy(incoming)];
    if (resolvedPolicy === "replace")
      return [...copy(others), copy(incoming)];
    if (resolvedPolicy === "strongest" || resolvedPolicy === "highest")
      return [
        ...copy(others),
        copy(
          [...same, incoming].reduce((a, b) =>
            number(a.value) >= number(b.value) ? a : b,
          ),
        ),
      ];
    if (
      resolvedPolicy === "bonusStrongestPenaltyStack" ||
      resolvedPolicy === "strongestBonusStackPenalties"
    ) {
      const all = [...same, incoming],
        bonuses = all.filter((e) => number(e.value) >= 0),
        penalties = all.filter((e) => number(e.value) < 0),
        best = bonuses.length
          ? [
              bonuses.reduce((a, b) =>
                number(a.value) >= number(b.value) ? a : b,
              ),
            ]
          : [];
      return [...copy(others), ...copy(best), ...copy(penalties)];
    }
    if (
      resolvedPolicy === "sumBySource" ||
      resolvedPolicy === "stackBySource"
    ) {
      number(incoming.value);
      for (const e of same) number(e.value);
      if (incoming.source === undefined || incoming.source === null)
        return [...copy(effects), copy(incoming)];
      const incSource = key(incoming.source),
        sameSource = same.filter(
          (e) =>
            e.source !== undefined &&
            e.source !== null &&
            key(e.source) === incSource,
        ),
        diffSource = same.filter(
          (e) =>
            e.source === undefined ||
            e.source === null ||
            key(e.source) !== incSource,
        ),
        winner = [...sameSource, incoming].reduce((a, b) =>
          number(a.value) >= number(b.value) ? a : b,
        );
      return [...copy(others), ...copy(diffSource), copy(winner)];
    }
    throw new Error("Unknown stacking policy");
  }
  resolve(effects, policies = {}, defaultPolicy = "strongest") {
    list(effects);
    let policyMap = policies,
      fallbackPolicy = defaultPolicy;
    if (typeof policies === "string") {
      fallbackPolicy = policies;
      policyMap = {};
    } else {
      record(policyMap);
    }
    if (!VALID_POLICIES.has(fallbackPolicy))
      throw new Error("Unknown stacking policy");
    for (const [k, p] of Object.entries(policyMap)) {
      key(k);
      if (!VALID_POLICIES.has(p)) throw new Error("Unknown stacking policy");
    }
    const groups = new Map();
    effects.forEach((e, index) => {
      record(e);
      const k = effectKey(e);
      number(e.value);
      if (e.enabled === false) return;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push({ index, effect: e });
    });
    const activeIndices = new Set();
    for (const [k, items] of groups.entries()) {
      const policy = policyMap[k] ?? fallbackPolicy;
      if (policy === "reject") {
        if (items.length > 1) throw new Error("Effect present");
        activeIndices.add(items[0].index);
      } else if (policy === "stack" || policy === "sum") {
        for (const item of items) activeIndices.add(item.index);
      } else if (policy === "replace") {
        activeIndices.add(items[items.length - 1].index);
      } else if (policy === "strongest" || policy === "highest") {
        const winner = items.reduce((a, b) =>
          a.effect.value >= b.effect.value ? a : b,
        );
        activeIndices.add(winner.index);
      } else if (
        policy === "bonusStrongestPenaltyStack" ||
        policy === "strongestBonusStackPenalties"
      ) {
        const bonuses = items.filter((item) => item.effect.value >= 0),
          penalties = items.filter((item) => item.effect.value < 0);
        if (bonuses.length) {
          const winner = bonuses.reduce((a, b) =>
            a.effect.value >= b.effect.value ? a : b,
          );
          activeIndices.add(winner.index);
        }
        for (const item of penalties) activeIndices.add(item.index);
      } else if (policy === "sumBySource" || policy === "stackBySource") {
        const bySource = new Map();
        for (const item of items) {
          if (item.effect.source === undefined || item.effect.source === null) {
            activeIndices.add(item.index);
          } else {
            const s = key(item.effect.source);
            if (!bySource.has(s)) bySource.set(s, []);
            bySource.get(s).push(item);
          }
        }
        for (const srcItems of bySource.values()) {
          const winner = srcItems.reduce((a, b) =>
            a.effect.value >= b.effect.value ? a : b,
          );
          activeIndices.add(winner.index);
        }
      }
    }
    const active = [],
      suppressed = [];
    effects.forEach((e, index) => {
      if (activeIndices.has(index)) active.push(copy(e));
      else suppressed.push(copy(e));
    });
    const total = active.reduce((sum, e) => number(sum + e.value), 0);
    return { total, active, suppressed };
  }
}
