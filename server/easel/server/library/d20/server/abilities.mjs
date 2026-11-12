import { copy, list, record, number, integer, key } from "./support.mjs";

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"];

export const DEFAULT_POINT_BUY_COSTS = {
  7: -4,
  8: -2,
  9: -1,
  10: 0,
  11: 1,
  12: 2,
  13: 3,
  14: 5,
  15: 7,
  16: 10,
  17: 13,
  18: 17
};

const CARRYING_CAPACITY_BASE = [
  0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  115, 130, 150, 175, 200, 230, 260, 300, 350, 400
];

export default class AbilitiesTool {
  abilityModifier(score) {
    if (score === null || score === undefined) return 0;
    if (typeof score !== "number" || !Number.isFinite(score))
      throw new TypeError("Expected finite number for score");
    return Math.floor((score - 10) / 2);
  }

  resolveAbility(raw, stackingService) {
    record(raw);
    const base = raw.base;
    if (base !== null && base !== undefined) number(base);
    const modifiers = list(raw.modifiers ?? []);
    const damage = integer(raw.damage ?? 0, 0, 10000);
    const drain = integer(raw.drain ?? 0, 0, 10000);
    const penalty = integer(raw.penalty ?? 0, 0, 10000);
    const maxCap =
      raw.maxCap !== null && raw.maxCap !== undefined ? number(raw.maxCap) : null;
    const directReduction = !!raw.directReduction;

    if (base === null || base === undefined) {
      return {
        base: null,
        total: null,
        modifier: 0,
        damage,
        drain,
        penalty,
        breakdown: {
          base: null,
          total: null,
          modifier: 0,
          drain,
          stackedBonus: 0,
          damagePenalty: 0,
          maxCap
        }
      };
    }

    let stackedBonus = 0;
    const stacking = stackingService;

    if (stacking && typeof stacking.resolve === "function") {
      const res = stacking.resolve(
        modifiers,
        raw.policies ?? {},
        "strongestBonusStackPenalties"
      );
      stackedBonus = res.total;
    } else {
      stackedBonus = modifiers
        .filter((m) => m && m.enabled !== false)
        .reduce((sum, m) => sum + (Number(m.value) || 0), 0);
    }

    let total = 0;
    if (directReduction) {
      total = Math.max(0, base + stackedBonus - drain - damage - penalty);
    } else {
      total = Math.max(0, base + stackedBonus - drain);
    }

    const baseMod = this.abilityModifier(total);
    const damagePenalty = directReduction
      ? 0
      : -Math.floor((damage + penalty) / 2);
    const rawModifier = baseMod + damagePenalty;
    const modifier = maxCap !== null ? Math.min(rawModifier, maxCap) : rawModifier;

    return {
      base,
      total,
      modifier,
      damage,
      drain,
      penalty,
      breakdown: {
        base,
        total,
        modifier,
        baseMod,
        stackedBonus,
        drain,
        damagePenalty,
        maxCap
      }
    };
  }

  pointBuyCost(scores, costTable = DEFAULT_POINT_BUY_COSTS) {
    record(costTable);
    let entries = [];
    if (Array.isArray(scores)) {
      entries = scores;
    } else if (scores && typeof scores === "object") {
      entries = Object.values(scores);
    } else {
      throw new TypeError("Expected array or object of scores");
    }
    let totalCost = 0;
    for (const val of entries) {
      const s = integer(val, 0, 100);
      if (!(s in costTable))
        throw new RangeError("Score " + s + " not found in point buy table");
      totalCost += number(costTable[s]);
    }
    return totalCost;
  }

  carryingCapacity(strength, multiplier = 1) {
    const str = integer(strength, 0, 200);
    number(multiplier);
    if (multiplier <= 0) throw new RangeError("Multiplier must be positive");
    let maxLoad = 0;
    if (str <= 20) {
      maxLoad = CARRYING_CAPACITY_BASE[str] ?? 0;
    } else {
      const baseScore = 11 + ((str - 21) % 10);
      const factor = 4 ** (1 + Math.floor((str - 21) / 10));
      maxLoad = (CARRYING_CAPACITY_BASE[baseScore] ?? 400) * factor;
    }
    maxLoad = Math.round(maxLoad * multiplier);
    const light = Math.floor(maxLoad / 3);
    const medium = Math.floor((maxLoad * 2) / 3);
    const heavy = maxLoad;
    return { light, medium, heavy, max: heavy };
  }
}
