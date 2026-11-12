import { copy, list, record, number, integer } from "./support.mjs";

const PHYSICAL_TYPES = new Set([
  "bludgeoning",
  "piercing",
  "slashing",
  "physical"
]);

export default class DamageTypesTool {
  resolveDamageInstances({
    instances = [],
    dr = [],
    resistances = {},
    immunities = [],
    vulnerabilities = [],
    hardness = 0
  } = {}) {
    list(instances);
    list(dr);
    record(resistances);
    list(immunities);
    list(vulnerabilities);
    number(hardness);

    const clean = (s) => String(s ?? "").toLowerCase().replace(/[\s_-]/g, "");
    const normImmunities = immunities.map(clean);
    const normVulnerabilities = vulnerabilities.map(clean);

    const parsedDR = dr.map((rule) => {
      record(rule);
      const amount = integer(rule.amount ?? 0, 0, 10000);
      const rawBypass = Array.isArray(rule.bypass)
        ? rule.bypass
        : [rule.bypass ?? ""];
      const bypassList = rawBypass.map(clean);
      return { amount, bypassList };
    });

    const processed = [];

    for (const inst of instances) {
      record(inst);
      const origAmount = number(inst.amount);
      let cur = origAmount;
      const types = list(inst.types ?? []).map(String);
      const cleanTypes = types.map(clean);
      const isNonlethal = !!inst.isNonlethal;

      const isImmune = cleanTypes.some((t) => normImmunities.includes(t));
      let isVulnerable = false;
      let resisted = 0;
      let absorbedByHardness = 0;

      if (isImmune) {
        cur = 0;
      } else {
        isVulnerable = cleanTypes.some((t) => normVulnerabilities.includes(t));
        if (isVulnerable) {
          cur = Math.floor(cur * 1.5);
        }

        if (hardness > 0 && cur > 0) {
          absorbedByHardness = Math.min(cur, hardness);
          cur -= absorbedByHardness;
        }

        if (cur > 0) {
          for (const [resType, resVal] of Object.entries(resistances)) {
            const cRes = clean(resType);
            if (cleanTypes.includes(cRes)) {
              const resNum = number(resVal);
              const absorbed = Math.min(cur, resNum);
              resisted += absorbed;
              cur -= absorbed;
            }
          }
        }
      }

      const isPhysical =
        cleanTypes.length === 0 ||
        cleanTypes.some((t) => PHYSICAL_TYPES.has(t));

      let applicableDR = 0;
      if (isPhysical && !isImmune && cur > 0 && parsedDR.length > 0) {
        const nonBypassed = parsedDR.filter((rule) => {
          const bypassed = rule.bypassList.some(
            (b) =>
              b !== "-" &&
              b !== "none" &&
              b !== "all" &&
              b !== "" &&
              cleanTypes.includes(b)
          );
          return !bypassed;
        });
        if (nonBypassed.length > 0) {
          applicableDR = Math.max(...nonBypassed.map((r) => r.amount));
        }
      }

      processed.push({
        origAmount,
        cur,
        types,
        isNonlethal,
        isImmune,
        isVulnerable,
        resisted,
        absorbedByHardness,
        absorbedByDR: 0,
        applicableDR
      });
    }

    let bestCandidate = null;
    for (const item of processed) {
      if (item.applicableDR > 0 && item.cur > 0) {
        if (!bestCandidate || item.cur > bestCandidate.cur) {
          bestCandidate = item;
        }
      }
    }

    if (bestCandidate) {
      const absorbed = Math.min(bestCandidate.cur, bestCandidate.applicableDR);
      bestCandidate.absorbedByDR = absorbed;
      bestCandidate.cur -= absorbed;
    }

    let totalLethal = 0;
    let totalNonlethal = 0;
    const breakdownPerInstance = [];

    for (const item of processed) {
      const finalAmount = Math.max(0, item.cur);
      if (item.isNonlethal) totalNonlethal += finalAmount;
      else totalLethal += finalAmount;

      breakdownPerInstance.push({
        originalAmount: item.origAmount,
        types: copy(item.types),
        finalAmount,
        absorbedByDR: item.absorbedByDR,
        absorbedByHardness: item.absorbedByHardness,
        resisted: item.resisted,
        isImmune: item.isImmune,
        isVulnerable: item.isVulnerable,
        isNonlethal: item.isNonlethal
      });
    }

    return {
      totalLethal,
      totalNonlethal,
      totalDamage: totalLethal + totalNonlethal,
      breakdownPerInstance
    };
  }
}
