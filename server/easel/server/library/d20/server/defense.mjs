import { copy, list, record, number, integer, key } from "./support.mjs";

const TOUCH_EXCLUDED_TYPES = new Set([
  "armor",
  "shield",
  "natural",
  "naturalarmor",
  "armorenhancement",
  "shieldenhancement",
  "naturalenhancement",
  "naturalarmorenhancement"
]);

function modType(m) {
  return String(m.key ?? m.bonusType ?? m.type ?? "")
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function processDex(modifiers, maxDex, loseDex) {
  const result = [];
  for (const m of modifiers) {
    if (!m || m.enabled === false) continue;
    const t = modType(m);
    const val = number(m.value ?? 0);
    if (t === "dex" || t === "dexterity") {
      if (loseDex) {
        if (val < 0) result.push(copy(m));
      } else if (val > 0 && maxDex !== null && maxDex !== undefined) {
        const capped = copy(m);
        capped.value = Math.min(val, number(maxDex));
        result.push(capped);
      } else {
        result.push(copy(m));
      }
    } else if (t === "dodge") {
      if (!loseDex) result.push(copy(m));
    } else {
      result.push(copy(m));
    }
  }
  return result;
}

function resolveWithStacking(modifiers, policyMap, stackingService) {
  const stacking = stackingService;

  const defaultPolicies = {
    dodge: "stack",
    circumstance: "stack",
    untyped: "stackBySource",
    ...policyMap
  };

  if (stacking && typeof stacking.resolve === "function") {
    return stacking.resolve(
      modifiers,
      defaultPolicies,
      "strongestBonusStackPenalties"
    );
  }

  const groups = new Map();
  const unstacked = [];
  for (const m of modifiers) {
    const t = modType(m);
    const pol = defaultPolicies[t] ?? "strongestBonusStackPenalties";
    if (pol === "stack" || pol === "sum" || !t) {
      unstacked.push(copy(m));
    } else {
      if (!groups.has(t)) groups.set(t, []);
      groups.get(t).push(copy(m));
    }
  }

  const active = [...unstacked];
  const suppressed = [];

  for (const [t, listMods] of groups.entries()) {
    const bonuses = listMods.filter((m) => number(m.value) >= 0);
    const penalties = listMods.filter((m) => number(m.value) < 0);
    if (bonuses.length > 0) {
      const best = bonuses.reduce((a, b) => (a.value >= b.value ? a : b));
      active.push(best);
      for (const b of bonuses) {
        if (b !== best) suppressed.push(b);
      }
    }
    for (const p of penalties) active.push(p);
  }

  const total = active.reduce((sum, m) => sum + number(m.value), 0);
  return { total, active, suppressed };
}

export default class DefenseTool {
  resolveArmorClass({
    base = 10,
    modifiers = [],
    policyMap = {},
    maxDex = null,
    loseDexToAC = false,
    stackingService = null
  } = {}) {
    number(base);
    list(modifiers);
    record(policyMap);

    const normalMods = processDex(modifiers, maxDex, loseDexToAC);
    const normalRes = resolveWithStacking(normalMods, policyMap, stackingService);

    const touchCandidates = modifiers.filter(
      (m) => !TOUCH_EXCLUDED_TYPES.has(modType(m))
    );
    const touchMods = processDex(touchCandidates, maxDex, loseDexToAC);
    const touchRes = resolveWithStacking(touchMods, policyMap, stackingService);

    const flatFootedMods = processDex(modifiers, null, true);
    const flatFootedRes = resolveWithStacking(
      flatFootedMods,
      policyMap,
      stackingService
    );

    return {
      normal: base + normalRes.total,
      touch: base + touchRes.total,
      flatFooted: base + flatFootedRes.total,
      breakdowns: {
        normal: normalRes,
        touch: touchRes,
        flatFooted: flatFootedRes
      }
    };
  }

  resolveSavingThrows({
    saves = { fort: 0, ref: 0, will: 0 },
    modifiers = [],
    policyMap = {},
    stackingService = null
  } = {}) {
    record(saves);
    list(modifiers);
    record(policyMap);

    const result = {};
    const breakdowns = {};

    for (const [keyName, baseVal] of Object.entries(saves)) {
      const baseNum = number(baseVal);
      const k = String(keyName).toLowerCase();
      const relevantMods = modifiers.filter((m) => {
        if (!m || m.enabled === false) return false;
        const target = String(m.target ?? m.save ?? m.savingThrow ?? "all")
          .toLowerCase()
          .replace(/[\s_-]/g, "");
        return (
          target === k ||
          target === "all" ||
          target === "saves" ||
          target === "savingthrow" ||
          target === "savingthrows"
        );
      });
      const stacked = resolveWithStacking(relevantMods, policyMap, stackingService);
      result[keyName] = baseNum + stacked.total;
      breakdowns[keyName] = stacked;
    }

    result.breakdowns = breakdowns;
    return result;
  }
}
