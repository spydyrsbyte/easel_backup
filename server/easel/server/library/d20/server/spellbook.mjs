import { copy, list, record, number, integer } from "./support.mjs";
import { random } from "./random.mjs";

export default class SpellbookTool {
  bonusSlotsForAbility(abilityModifier, maxSpellLevel = 9) {
    number(abilityModifier);
    integer(maxSpellLevel, 1, 9);

    const slots = [0];
    for (let lvl = 1; lvl <= maxSpellLevel; lvl++) {
      slots.push(
        abilityModifier >= lvl ? Math.floor((abilityModifier - lvl + 4) / 4) : 0
      );
    }
    return slots;
  }

  resolveSpellDC({
    base = 10,
    spellLevel,
    abilityModifier,
    modifiers = [],
    policyMap = {},
    stackingService = null
  } = {}) {
    number(base);
    integer(spellLevel, 0, 9);
    number(abilityModifier);
    list(modifiers);
    record(policyMap);

    const stacking = stackingService;

    let stackedBonus = 0;
    if (stacking && typeof stacking.resolve === "function") {
      const res = stacking.resolve(
        modifiers,
        policyMap,
        "strongestBonusStackPenalties"
      );
      stackedBonus = res.total;
    } else {
      stackedBonus = modifiers
        .filter((m) => m && m.enabled !== false)
        .reduce((sum, m) => sum + (Number(m.value) || 0), 0);
    }

    const total = base + spellLevel + abilityModifier + stackedBonus;

    return {
      total,
      dc: total,
      breakdown: {
        base,
        spellLevel,
        abilityModifier,
        stackedBonus,
        modifiers: copy(modifiers)
      }
    };
  }

  rollConcentration(
    {
      casterLevel,
      abilityModifier,
      modifiers = [],
      dc = null,
      mode = "normal",
      autoFailOn = null,
      autoSuccessOn = null,
      source = null
    } = {},
    checkService = null
  ) {
    number(casterLevel);
    number(abilityModifier);
    list(modifiers);

    const allMods = [
      { name: "Caster Level", value: casterLevel },
      { name: "Ability", value: abilityModifier },
      ...modifiers
    ];

    const checker =
      checkService ??
      (globalThis.Easel?.Interfaces?.create
        ? globalThis.Easel.Interfaces.create("easel.d20.check@1")
        : null);

    if (checker && typeof checker.rollCheck === "function") {
      return checker.rollCheck({
        mode,
        modifiers: allMods,
        dc,
        autoFailOn,
        autoSuccessOn,
        source
      });
    }

    const r = random(source);
    const naturalRoll = integer(r.integer(1, 21), 1, 20);
    let modTotal = casterLevel + abilityModifier;
    for (const m of modifiers) {
      if (typeof m === "number") modTotal += number(m);
      else if (m && typeof m === "object" && m.enabled !== false) {
        modTotal += number(m.value ?? 0);
      }
    }
    const total = naturalRoll + modTotal;
    const isNatural1 = naturalRoll === 1;
    const isNatural20 = naturalRoll === 20;
    const success =
      dc !== null && dc !== undefined
        ? (autoSuccessOn !== null && naturalRoll === autoSuccessOn) ||
          ((autoFailOn === null || naturalRoll !== autoFailOn) && total >= number(dc))
        : null;

    return {
      naturalRoll,
      dice: [naturalRoll],
      modifierTotal: modTotal,
      breakdown: copy(allMods),
      total,
      dc: dc !== null && dc !== undefined ? dc : null,
      isNatural1,
      isNatural20,
      success
    };
  }

  rollCasterLevelCheck(
    {
      casterLevel,
      modifiers = [],
      targetSR = null,
      mode = "normal",
      autoFailOn = null,
      autoSuccessOn = null,
      source = null
    } = {},
    checkService = null
  ) {
    number(casterLevel);
    list(modifiers);

    const allMods = [{ name: "Caster Level", value: casterLevel }, ...modifiers];

    const checker =
      checkService ??
      (globalThis.Easel?.Interfaces?.create
        ? globalThis.Easel.Interfaces.create("easel.d20.check@1")
        : null);

    if (checker && typeof checker.rollCheck === "function") {
      return checker.rollCheck({
        mode,
        modifiers: allMods,
        dc: targetSR,
        autoFailOn,
        autoSuccessOn,
        source
      });
    }

    const r = random(source);
    const naturalRoll = integer(r.integer(1, 21), 1, 20);
    let modTotal = casterLevel;
    for (const m of modifiers) {
      if (typeof m === "number") modTotal += number(m);
      else if (m && typeof m === "object" && m.enabled !== false) {
        modTotal += number(m.value ?? 0);
      }
    }
    const total = naturalRoll + modTotal;
    const isNatural1 = naturalRoll === 1;
    const isNatural20 = naturalRoll === 20;
    const success =
      targetSR !== null && targetSR !== undefined
        ? (autoSuccessOn !== null && naturalRoll === autoSuccessOn) ||
          ((autoFailOn === null || naturalRoll !== autoFailOn) && total >= number(targetSR))
        : null;

    return {
      naturalRoll,
      dice: [naturalRoll],
      modifierTotal: modTotal,
      breakdown: copy(allMods),
      total,
      dc: targetSR !== null && targetSR !== undefined ? targetSR : null,
      isNatural1,
      isNatural20,
      success
    };
  }
}
