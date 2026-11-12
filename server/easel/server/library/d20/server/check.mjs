import { copy, list, record, number, integer, key } from "./support.mjs";
import { random } from "./random.mjs";

export default class CheckTool {
  rollCheck({
    mode = "normal",
    take = null,
    modifiers = [],
    dc = null,
    autoFailOn = 1,
    autoSuccessOn = 20,
    source = null
  } = {}) {
    if (!["normal", "advantage", "disadvantage"].includes(mode))
      throw new Error("Invalid roll mode: " + mode);
    list(modifiers);

    let naturalRoll = 0;
    let dice = [];

    if (take !== null && take !== undefined && take !== 0) {
      integer(take, 1, 20);
      naturalRoll = take;
      dice = [take];
    } else {
      const roller =
        globalThis.Easel?.Interfaces?.create
          ? globalThis.Easel.Interfaces.create("easel.dice.roller@1")
          : null;
      const rollDie = () => {
        if (roller && typeof roller.roll === "function") {
          const res = roller.roll(20, 1, source);
          return integer(res[0], 1, 20);
        }
        const r = random(source);
        return integer(r.integer(1, 21), 1, 20);
      };
      if (mode === "normal") {
        const d = rollDie();
        dice = [d];
        naturalRoll = d;
      } else if (mode === "advantage") {
        const d1 = rollDie();
        const d2 = rollDie();
        dice = [d1, d2];
        naturalRoll = Math.max(d1, d2);
      } else if (mode === "disadvantage") {
        const d1 = rollDie();
        const d2 = rollDie();
        dice = [d1, d2];
        naturalRoll = Math.min(d1, d2);
      }
    }

    let modifierTotal = 0;
    for (const m of modifiers) {
      if (typeof m === "number") {
        modifierTotal += number(m);
      } else if (m && typeof m === "object") {
        if (m.enabled !== false) {
          modifierTotal += number(m.value ?? 0);
        }
      }
    }

    const total = naturalRoll + modifierTotal;
    const isNatural1 = naturalRoll === autoFailOn;
    const isNatural20 = naturalRoll === autoSuccessOn;
    let success = null;

    if (dc !== null && dc !== undefined) {
      number(dc);
      if (isNatural20) success = true;
      else if (isNatural1) success = false;
      else success = total >= dc;
    }

    return {
      naturalRoll,
      dice,
      modifierTotal,
      breakdown: copy(modifiers),
      total,
      dc: dc !== null && dc !== undefined ? dc : null,
      isNatural1,
      isNatural20,
      success
    };
  }

  rollAttack({
    attackModifiers = [],
    critRange = 20,
    critMultiplier = 2,
    confirmModifiers = [],
    targetAC = null,
    targetFlatFootedAC = null,
    concealmentMissChance = 0,
    fortificationChance = 0,
    mode = "normal",
    source = null
  } = {}) {
    list(attackModifiers);
    list(confirmModifiers);
    integer(critRange, 1, 20);
    integer(critMultiplier, 1, 10);
    integer(concealmentMissChance, 0, 100);
    integer(fortificationChance, 0, 100);

    const attack = this.rollCheck({
      mode,
      modifiers: attackModifiers,
      dc: targetAC,
      source
    });

    const threatens =
      !attack.isNatural1 &&
      attack.naturalRoll >= critRange &&
      (targetAC === null || attack.success);

    let confirmation = null;
    if (threatens) {
      confirmation = this.rollCheck({
        mode: "normal",
        modifiers: [...attackModifiers, ...confirmModifiers],
        dc: targetAC,
        source
      });
    }

    let concealment = null;
    const r = random(source);
    if (concealmentMissChance > 0) {
      const roll = integer(r.integer(1, 101), 1, 100);
      concealment = {
        missChance: concealmentMissChance,
        roll,
        missed: roll <= concealmentMissChance
      };
    }

    let fortification = null;
    if (fortificationChance > 0 && threatens && confirmation?.success) {
      const roll = integer(r.integer(1, 101), 1, 100);
      fortification = {
        chance: fortificationChance,
        roll,
        negated: roll <= fortificationChance
      };
    }

    const primaryHit = attack.isNatural1
      ? false
      : attack.isNatural20
      ? true
      : targetAC !== null
      ? attack.total >= targetAC
      : null;
    const confirmed = confirmation
      ? targetAC !== null
        ? confirmation.success
        : null
      : false;
    const isCriticalHit =
      threatens && confirmed === true && (!fortification || !fortification.negated);
    const hits =
      primaryHit === null
        ? null
        : primaryHit && (!concealment || !concealment.missed);

    return {
      attack,
      threatensCritical: threatens,
      critRange,
      critMultiplier,
      confirmation,
      isCriticalHit,
      concealment,
      fortification,
      hits
    };
  }
}
