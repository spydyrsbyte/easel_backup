import Session from "./session.mjs";
import { registerPF1eVision, PF1E_HINDRANCES, PF1E_VISION_PRESETS } from "./vision-pf1e.mjs";
import StatblockParser from "./statblock.mjs";

export default class Game {
  constructor() {
    this.statblockParser = new StatblockParser();
  }

  start(options = {}) {
    this.table = options.table;
    this.publishRoll = options.publishRoll;
    if (globalThis.Easel?.Interfaces?.supports?.("easel.maps.vision@1")) {
      try {
        const visionTool = globalThis.Easel.Interfaces.create("easel.maps.vision@1");
        registerPF1eVision(visionTool);
      } catch {}
    }
    if (globalThis.Easel?.Interfaces?.supports?.("easel.visibility.projection@1")) {
      try {
        const projTool = globalThis.Easel.Interfaces.create("easel.visibility.projection@1");
        registerPF1eVision(projTool);
      } catch {}
    }

    if (globalThis.Application?.events?.register) {
      const reg = globalThis.Application.events.register.bind(globalThis.Application.events);
      reg("easel.pf1e.rollAbility", { valid: 2, actorId: "string", ability: "string", score: "integer", modifier: "integer", rollMode: "string" });
      reg("easel.pf1e.rollSave", { valid: 2, actorId: "string", save: "string", modifier: "integer", dc: "integer", rollMode: "string" });
      reg("easel.pf1e.rollSkill", { valid: 2, actorId: "string", skillId: "string", modifier: "integer", take: "integer", rollMode: "string" });
      reg("easel.pf1e.rollInitiative", { valid: 2, actorId: "string", rollMode: "string" });
      reg("easel.pf1e.useAction", { valid: 2, actorId: "string", actionId: "string", mode: "string", take: "integer", bonus: "integer", conditionalModifiers: "array", actionData: "field", rollMode: "string" });
      reg("easel.pf1e.castSpell", { valid: 2, actorId: "string", spellId: "string", level: "integer", rollMode: "string" });
      reg("easel.pf1e.applyDamage", { valid: 2, actorId: "string", amount: "number", isNonlethal: "boolean", multiplier: "number" });
      reg("easel.pf1e.applyHealing", { valid: 2, actorId: "string", amount: "number" });
      reg("easel.pf1e.identifyItem", { valid: 2, actorId: "string", itemId: "string" });
      reg("easel.pf1e.importStatblock", { valid: 2, statblockText: "string", folderId: "string" });
      reg("easel.pf1e.rest", { valid: 2, actorId: "string", isFullBedrest: "boolean", hd: "integer" });
      reg("easel.pf1e.advanceTurn", { valid: 2, actorId: "string", combatId: "string" });
      reg("easel.pf1e.transferItem", { valid: 2, itemId: "string", targetActorId: "string", targetContainerId: "string" });
      reg("easel.pf1e.transferCoin", { valid: 2, currency: "field", targetActorId: "string", sourceActorId: "string" });
      reg("easel.pf1e.rollResult", { valid: 1, rollId: "string", type: "string", title: "string", dicePayload: "field", card: "field", speaker: "field", rollMode: "string", attackData: "field" });
      reg("easel.pf1e.error", { valid: 1, message: "string" });
      reg("pf1e.damageApplied", { valid: 7, actorId: "string", hp: "integer", nonlethal: "integer" });
      reg("pf1e.usesSpent", { valid: 7, recordType: "string", recordId: "string", cost: "integer" });
      reg("pf1e.restCompleted", { valid: 7, actorId: "string", isFullBedrest: "boolean" });
      reg("pf1e.turnAdvanced", { valid: 7, actorId: "string" });
      reg("pf1e.itemTransferred", { valid: 7, itemId: "string", targetActorId: "string", targetContainerId: "string" });
    }

    this.session = new Session(this);
    this.session.start();
  }

  getCheckTool() {
    if (globalThis.Easel?.Interfaces?.supports?.("easel.d20.check@1")) {
      return globalThis.Easel.Interfaces.create("easel.d20.check@1");
    }
    return null;
  }

  visionConfig() {
    return { hindrances: PF1E_HINDRANCES, presets: PF1E_VISION_PRESETS, fallback: "normal" };
  }

  getRollerTool() {
    if (globalThis.Easel?.Interfaces?.supports?.("easel.dice.roller@1")) {
      return globalThis.Easel.Interfaces.create("easel.dice.roller@1");
    }
    return null;
  }

  getNotationTool() {
    if (globalThis.Easel?.Interfaces?.supports?.("easel.dice.notation@1")) {
      return globalThis.Easel.Interfaces.create("easel.dice.notation@1");
    }
    return null;
  }

  broadcastRoll(payload) {
    if (!payload.rollMode) payload.rollMode = "public";
    if (payload.attackData === undefined) payload.attackData = {};
    if (this.publishRoll) {
      this.publishRoll(payload, this.rollContext);
      return payload;
    }
    if (this.session) {
      this.session.storeMessage({ speaker: payload.speaker, card: payload.card, attackData: payload.attackData });
    }
    if (globalThis.Application?.events?.emit) {
      globalThis.Application.events.emit("easel.pf1e.rollResult", payload);
    }
    return payload;
  }

  rollAbility({ actorId, ability, score = 10, modifier = 0, source }) {
    const chk = this.getCheckTool();
    const rollId = "roll-" + Math.random().toString(36).slice(2, 9);
    let result;
    if (chk) {
      result = chk.rollCheck({ modifiers: [modifier], source });
    } else {
      const d20 = source?.integer ? source.integer(1, 20) : Math.floor(Math.random() * 20) + 1;
      result = { naturalRoll: d20, total: d20 + modifier };
    }

    const payload = {
      rollId,
      type: "ability",
      title: `${ability.toUpperCase()} Check`,
      speaker: { name: actorId || "Actor" },
      dicePayload: {
        id: rollId,
        dice: [{ sides: 20, value: result.naturalRoll, label: String(result.naturalRoll) }]
      },
      card: {
        title: `${ability.toUpperCase()} Check: ${result.total}`,
        total: result.total,
        naturalRoll: result.naturalRoll
      }
    };
    return this.broadcastRoll(payload);
  }

  rollSave({ actorId, save, modifier = 0, dc = 0, source }) {
    const chk = this.getCheckTool();
    const rollId = "roll-" + Math.random().toString(36).slice(2, 9);
    let result;
    if (chk) {
      result = chk.rollCheck({ dc, modifiers: [modifier], source });
    } else {
      const d20 = source?.integer ? source.integer(1, 20) : Math.floor(Math.random() * 20) + 1;
      result = { naturalRoll: d20, total: d20 + modifier, success: dc ? d20 + modifier >= dc : true };
    }

    const payload = {
      rollId,
      type: "save",
      title: `${save.toUpperCase()} Save`,
      speaker: { name: actorId || "Actor" },
      dicePayload: {
        id: rollId,
        dice: [{ sides: 20, value: result.naturalRoll, label: String(result.naturalRoll) }]
      },
      card: {
        title: `${save.toUpperCase()} Save: ${result.total}`,
        total: result.total,
        naturalRoll: result.naturalRoll,
        success: result.success
      }
    };
    return this.broadcastRoll(payload);
  }

  rollSkill({ actorId, skillId, modifier = 0, take = 0, source }) {
    const chk = this.getCheckTool();
    const rollId = "roll-" + Math.random().toString(36).slice(2, 9);
    let result;
    if (chk) {
      result = chk.rollCheck({ take, modifiers: [modifier], source });
    } else {
      const d20 = take > 0 ? take : (source?.integer ? source.integer(1, 20) : Math.floor(Math.random() * 20) + 1);
      result = { naturalRoll: d20, total: d20 + modifier };
    }

    const payload = {
      rollId,
      type: "skill",
      title: `${skillId} Check`,
      speaker: { name: actorId || "Actor" },
      dicePayload: {
        id: rollId,
        dice: [{ sides: 20, value: result.naturalRoll, label: String(result.naturalRoll) }]
      },
      card: {
        title: `${skillId}: ${result.total}`,
        total: result.total,
        naturalRoll: result.naturalRoll
      }
    };
    return this.broadcastRoll(payload);
  }

  rollInitiative({ actorId, modifier = 0, source }) {
    const chk = this.getCheckTool();
    const rollId = "roll-" + Math.random().toString(36).slice(2, 9);
    let result;
    if (chk) {
      result = chk.rollCheck({ modifiers: [modifier], source });
    } else {
      const d20 = source?.integer ? source.integer(1, 20) : Math.floor(Math.random() * 20) + 1;
      result = { naturalRoll: d20, total: d20 + modifier };
    }

    const payload = {
      rollId,
      type: "initiative",
      title: "Initiative",
      speaker: { name: actorId || "Actor" },
      dicePayload: {
        id: rollId,
        dice: [{ sides: 20, value: result.naturalRoll, label: String(result.naturalRoll) }]
      },
      card: {
        title: `Initiative: ${result.total}`,
        total: result.total,
        naturalRoll: result.naturalRoll
      }
    };
    return this.broadcastRoll(payload);
  }

  useAction({
    actorId,
    actionId,
    mode = "normal",
    take = 0,
    bonus = 0,
    conditionalModifiers = [],
    actionData = {},
    source
  }) {
    const rollId = "roll-" + Math.random().toString(36).slice(2, 9);
    const actionName = actionData.name || "Attack";
    const isFullAttack = (mode === "full" || mode === "fast-full");

    // 1. Determine Iterative Attack Sequence
    let strikeBonuses = [];
    if (typeof actionData.attackBonusFormula === "string" && actionData.attackBonusFormula.trim().length > 0) {
      const parts = actionData.attackBonusFormula
        .split("/")
        .map((s) => parseInt(s.trim().replace("+", ""), 10))
        .filter((n) => !isNaN(n));
      if (parts.length > 0) strikeBonuses = parts;
    }
    if (strikeBonuses.length === 0 && actionData.attackBonus !== undefined) {
      strikeBonuses = [Number(actionData.attackBonus) || 0];
    }
    if (strikeBonuses.length === 0) {
      strikeBonuses = [Number(bonus) || 0];
    }
    if (!isFullAttack) {
      strikeBonuses = [strikeBonuses[0]];
    }

    // 2. Parse Critical Threat Range & Multiplier
    let critRange = Number(actionData.critRange || 20);
    let critMultiplier = Number(actionData.critMultiplier || 2);
    const inferType = (n = "") => {
      const l = n.toLowerCase();
      if (l.includes("sword") || l.includes("axe") || l.includes("slash") || l.includes("scimitar") || l.includes("sickle")) return "Slashing";
      if (l.includes("bow") || l.includes("arrow") || l.includes("spear") || l.includes("dagger") || l.includes("pierc") || l.includes("rapier") || l.includes("pick")) return "Piercing";
      if (l.includes("mace") || l.includes("hammer") || l.includes("flail") || l.includes("club") || l.includes("slam") || l.includes("bludgeon") || l.includes("staff")) return "Bludgeoning";
      return "Slashing";
    };

    const rawParts = Array.isArray(actionData.damageParts) && actionData.damageParts.length > 0
      ? actionData.damageParts
      : [{ formula: "1d8+4" }];

    const baseDamageParts = [];
    for (const p of rawParts) {
      let rawStr = typeof p === "string" ? p : (p.formula || "1d8+4");
      const critMatch = rawStr.match(/\((?:(\d+)-20\/)?x(\d+)\)/);
      if (critMatch) {
        if (critMatch[1]) critRange = parseInt(critMatch[1], 10);
        if (critMatch[2]) critMultiplier = parseInt(critMatch[2], 10);
        rawStr = rawStr.replace(critMatch[0], "").trim();
      }
      baseDamageParts.push({
        formula: rawStr || "1d8+4",
        type: p.type || actionData.damageType || inferType(actionName)
      });
    }

    let condTotal = 0;
    for (const cm of conditionalModifiers) condTotal += Number(cm.value || cm.bonus || 0);
    const situationalBonus = Number(bonus || 0);

    const helperRollFormula = (f) => {
      const dice = [];
      const match = f.match(/(\d+)d(\d+)(?:([+-])(\d+))?/i);
      if (match) {
        const numDice = Math.max(1, parseInt(match[1], 10) || 1);
        const sides = Math.max(2, parseInt(match[2], 10) || 6);
        const sign = match[3] === "-" ? -1 : 1;
        const mod = match[4] ? parseInt(match[4], 10) * sign : 0;
        let diceSum = 0;
        for (let d = 0; d < numDice; d++) {
          const val = source?.integer ? source.integer(1, sides) : Math.floor(Math.random() * sides) + 1;
          dice.push({ sides, value: val, label: String(val) });
          diceSum += val;
        }
        const total = Math.max(1, diceSum + mod);
        return { total, dice, formula: `${numDice}d${sides}${mod ? (mod > 0 ? "+" + mod : String(mod)) : ""}` };
      }
      const val = source?.integer ? source.integer(1, 8) : Math.floor(Math.random() * 8) + 1;
      dice.push({ sides: 8, value: val, label: String(val) });
      return { total: val + 3, dice, formula: "1d8+3" };
    };

    const strikes = [];
    const allDice = [];
    let grandDamageTotal = 0;

    for (let i = 0; i < strikeBonuses.length; i++) {
      const baseAtk = strikeBonuses[i];
      const totalAtkMod = baseAtk + condTotal + situationalBonus;

      // Attack Roll
      const d20 = take > 0 ? take : (source?.integer ? source.integer(1, 20) : Math.floor(Math.random() * 20) + 1);
      const atkTotal = d20 + totalAtkMod;
      const isNat20 = (d20 === 20);
      const isNat1 = (d20 === 1);
      const threatensCrit = (d20 >= critRange) && !isNat1;

      allDice.push({ sides: 20, value: d20, label: String(d20), type: "attack" });

      // Crit Confirmation Roll
      let confirmData = null;
      if (threatensCrit) {
        const confirmD20 = source?.integer ? source.integer(1, 20) : Math.floor(Math.random() * 20) + 1;
        const confirmTotal = confirmD20 + totalAtkMod;
        allDice.push({ sides: 20, value: confirmD20, label: String(confirmD20), type: "critConfirm" });
        confirmData = {
          formula: `1d20 + ${totalAtkMod}`,
          naturalRoll: confirmD20,
          modifier: totalAtkMod,
          total: confirmTotal,
          isConfirmed: confirmD20 >= 10 || confirmD20 === 20
        };
      }

      // Damage Roll
      let strikeDamageTotal = 0;
      const strikeDamageDice = [];
      const formulaParts = [];
      for (const bp of baseDamageParts) {
        const r = helperRollFormula(bp.formula);
        strikeDamageTotal += r.total;
        for (const d of r.dice) {
          strikeDamageDice.push(d);
          allDice.push({ ...d, type: "damage" });
        }
        formulaParts.push(r.formula);
      }
      grandDamageTotal += strikeDamageTotal;

      // Critical Damage Roll (Extra dice if threatened/confirmed)
      let critDamageTotal = 0;
      const critDamageDice = [];
      if (threatensCrit && critMultiplier > 1) {
        for (let m = 1; m < critMultiplier; m++) {
          for (const bp of baseDamageParts) {
            const r = helperRollFormula(bp.formula);
            critDamageTotal += r.total;
            for (const d of r.dice) {
              critDamageDice.push(d);
              allDice.push({ ...d, type: "critDamage" });
            }
          }
        }
      }

      const strikeLabel = isFullAttack
        ? `Attack ${i + 1} (${baseAtk >= 0 ? "+" + baseAtk : baseAtk})`
        : actionName;

      const strikeActions = [
        {
          id: "applyDamage",
          label: `Apply ${isFullAttack ? `Atk ${i + 1}` : "Damage"} (${strikeDamageTotal})`,
          payload: { amount: strikeDamageTotal, multiplier: 1, isNonlethal: false }
        },
        {
          id: "applyDamage",
          label: `Half (${Math.floor(strikeDamageTotal / 2)})`,
          payload: { amount: strikeDamageTotal, multiplier: 0.5, isNonlethal: false }
        }
      ];

      if (threatensCrit && critDamageTotal > 0) {
        strikeActions.push({
          id: "applyDamage",
          label: `Crit Total (${strikeDamageTotal + critDamageTotal})`,
          payload: { amount: strikeDamageTotal + critDamageTotal, multiplier: 1, isNonlethal: false }
        });
      }

      strikes.push({
        label: strikeLabel,
        strikeIndex: i,
        baseBonus: baseAtk,
        attackRoll: {
          formula: `1d20 + ${totalAtkMod}`,
          naturalRoll: d20,
          modifier: totalAtkMod,
          total: atkTotal,
          isCrit: isNat20,
          isFumble: isNat1,
          threatensCrit,
          critConfirm: confirmData
        },
        damageRoll: {
          formula: formulaParts.join(" + ") || "1d8+4",
          total: strikeDamageTotal,
          dice: strikeDamageDice,
          type: baseDamageParts[0]?.type || "Slashing"
        },
        critDamageRoll: threatensCrit && critDamageTotal > 0 ? {
          formula: formulaParts.join(" + "),
          total: critDamageTotal,
          dice: critDamageDice,
          type: baseDamageParts[0]?.type || "Slashing"
        } : null,
        actions: strikeActions
      });
    }

    if (actionData.usesCost && globalThis.Application?.automations?.run) {
      try {
        globalThis.Application.automations.run("pf1e.SpendActionUses", [
          actionData.parentRecordType || "Item",
          actionData.parentRecordId || actionId,
          actionData.usesCost
        ]);
      } catch {}
    }

    const topActions = [];
    if (grandDamageTotal > 0) {
      topActions.push({
        id: "applyDamage",
        label: isFullAttack && strikes.length > 1 ? `Apply All Damage (${grandDamageTotal})` : `Apply Damage (${grandDamageTotal})`,
        payload: { amount: grandDamageTotal, multiplier: 1, isNonlethal: false }
      });
      topActions.push({
        id: "applyDamage",
        label: isFullAttack && strikes.length > 1 ? `Apply All Half (${Math.floor(grandDamageTotal / 2)})` : `Half (${Math.floor(grandDamageTotal / 2)})`,
        payload: { amount: grandDamageTotal, multiplier: 0.5, isNonlethal: false }
      });
    }

    const payload = {
      rollId,
      type: "attack",
      title: actionName,
      speaker: { name: actorId || "Actor" },
      dicePayload: {
        id: rollId,
        dice: allDice
      },
      attackData: {
        strikes,
        attack: strikes[0]?.attackRoll,
        damage: strikes[0]?.damageRoll,
        isFullAttack,
        totalDamage: grandDamageTotal,
        saveDC: actionData.saveDC,
        saveType: actionData.saveType
      },
      card: {
        title: actionName,
        mode: isFullAttack ? "Full Attack" : "Single Attack",
        actorName: actorId || "Actor",
        total: strikes[0]?.attackRoll?.total ?? 0,
        attacks: strikes,
        actions: topActions
      }
    };
    return this.broadcastRoll(payload);
  }

  castSpell({ actorId, spellId, level = 1, spellData = {}, source }) {
    if (globalThis.Application?.automations?.run) {
      try {
        globalThis.Application.automations.run("pf1e.SpendActionUses", ["Spell", spellId, 1]);
      } catch {}
    }

    const rollId = "roll-" + Math.random().toString(36).slice(2, 9);
    const roller = this.getRollerTool();
    const notationTool = this.getNotationTool();
    const damageDice = [];
    let damageTotal = 0;

    const dmgFormula = spellData.damageFormula || (level > 0 ? `${level}d6` : "1d3");
    if (notationTool && typeof dmgFormula === "string" && dmgFormula.includes("d")) {
      try {
        const rolled = notationTool.roll(dmgFormula, source);
        damageTotal = rolled.total;
        for (const val of rolled.rolls || []) {
          damageDice.push({ sides: rolled.sides || 6, value: val, label: String(val) });
        }
      } catch {
        const d4 = source?.integer ? source.integer(1, 4) : 3;
        damageTotal = d4 + 1;
        damageDice.push({ sides: 4, value: d4, label: String(d4) });
      }
    } else if (roller && typeof dmgFormula === "string" && dmgFormula.includes("d") && typeof roller.rollNotation === "function") {
      const rolled = roller.rollNotation(dmgFormula, source);
      damageTotal = rolled.total;
      for (const dr of rolled.diceResults || []) {
        damageDice.push({ sides: dr.sides || 6, value: dr.value || 1, label: String(dr.value || 1) });
      }
    } else if (dmgFormula) {
      const d4 = source?.integer ? source.integer(1, 4) : 3;
      damageTotal = d4 + 1;
      damageDice.push({ sides: 4, value: d4, label: String(d4) });
    }

    const payload = {
      rollId,
      type: "spell",
      title: `Cast: ${spellData.name || "Spell"}`,
      speaker: { name: actorId || "Actor" },
      dicePayload: {
        id: rollId,
        dice: damageDice.length > 0 ? damageDice : [{ sides: 20, value: 10, label: "10" }]
      },
      attackData: {
        damage: damageTotal ? { total: damageTotal } : null,
        saveDC: spellData.saveDC || (10 + level + 3),
        saveType: spellData.saveType || "ref"
      },
      card: {
        title: spellData.name || "Spell Cast",
        actions: damageTotal > 0 ? [
          { id: "applyDamage", label: "Apply Full", payload: { amount: damageTotal, multiplier: 1 } },
          { id: "applyDamage", label: "Apply Half", payload: { amount: damageTotal, multiplier: 0.5 } }
        ] : []
      }
    };
    return this.broadcastRoll(payload);
  }

  applyDamage({ actorId, amount = 0, isNonlethal = false, multiplier = 1 }) {
    const effectiveAmount = Math.max(0, Math.floor(amount * multiplier));
    if (globalThis.Application?.automations?.run) {
      return globalThis.Application.automations.run("pf1e.ApplyDamage", [
        actorId,
        effectiveAmount,
        Boolean(isNonlethal)
      ]);
    }
    return { ok: true, amount: effectiveAmount };
  }

  applyHealing({ actorId, amount = 0 }) {
    if (globalThis.Application?.automations?.run) {
      return globalThis.Application.automations.run("pf1e.ApplyDamage", [
        actorId,
        -Math.max(0, amount),
        false
      ]);
    }
    return { ok: true, amount };
  }

  identifyItem({ actorId, itemId, rollDC = 20, source }) {
    const chk = this.getCheckTool();
    let success = true;
    if (chk) {
      const res = chk.rollCheck({ dc: rollDC, modifiers: [5], source });
      success = res.success;
    }
    return { itemId, identified: success };
  }

  importStatblock({ statblockText, folderId = "" }) {
    return this.statblockParser.parse(statblockText);
  }

  rest({ actorId, isFullBedrest = false, hd = 1 }) {
    if (globalThis.Application?.automations?.run) {
      return globalThis.Application.automations.run("pf1e.Rest", [actorId, Boolean(isFullBedrest), Number(hd || 1)]);
    }
    return { ok: true };
  }

  advanceTurn({ actorId, combatId = "" }) {
    if (globalThis.Application?.automations?.run) {
      return globalThis.Application.automations.run("pf1e.AdvanceTurn", [actorId]);
    }
    return { ok: true };
  }

  transferItem({ itemId, targetActorId, targetContainerId = "" }) {
    if (globalThis.Application?.automations?.run) {
      return globalThis.Application.automations.run("pf1e.TransferItem", [
        itemId,
        targetActorId,
        targetContainerId
      ]);
    }
    return { itemId, targetActorId, targetContainerId };
  }

  transferCoin({ currency = {}, targetActorId, sourceActorId = "" }) {
    if (globalThis.Application?.automations?.run) {
      try {
        return globalThis.Application.automations.run("pf1e.TransferCoin", [
          sourceActorId,
          targetActorId,
          currency
        ]);
      } catch {}
    }
    return { ok: true, currency, targetActorId, sourceActorId };
  }

  syncBrokenState({ actorId, itemId, currentHp = 0, maxHp = 10 }) {
    const isBroken = currentHp <= Math.floor(maxHp / 2);
    if (globalThis.Application?.events?.emit) {
      globalThis.Application.events.emit("easel.pf1e.itemBrokenState", {
        actorId,
        itemId,
        broken: isBroken
      });
    }
    return { itemId, broken: isBroken };
  }
}
