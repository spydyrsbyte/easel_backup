import { ActorConditions } from "./actor-conditions.mjs";
import {
  PF1E_STACKING_POLICY,
  PF1E_SKILLS,
  PF1E_SIZE_SPECIAL_MODS,
  PF1E_SIZE_AC_ATTACK_MODS,
  PF1E_SIZE_FLY_MODS,
  PF1E_SIZE_STEALTH_MODS,
  preprocessCompositeArmorEnhancements,
  calculateIterativeBAB,
  calculateTWFPenalties,
  calculateNaturalAttack,
  calculateCMB,
  calculateCMD,
  calculateLoadCategory,
  calculateReducedSpeed
} from "../rules-config.mjs";

function getStackingTool() {
  return globalThis.Easel?.Interfaces?.create?.("easel.effects.stacking@1") ?? null;
}

function getAbilitiesTool() {
  return globalThis.Easel?.Interfaces?.create?.("easel.d20.abilities@1") ?? null;
}

function getDefenseTool() {
  return globalThis.Easel?.Interfaces?.create?.("easel.d20.defense@1") ?? null;
}

function getHealthTool() {
  return globalThis.Easel?.Interfaces?.create?.("easel.d20.health@1") ?? null;
}

function getSpellbookTool() {
  return globalThis.Easel?.Interfaces?.create?.("easel.d20.spellbook@1") ?? null;
}

export class ActorDerived extends ActorConditions {
  computeDerived(context = {}) {
    const stacking = getStackingTool();
    const abilitiesTool = getAbilitiesTool();
    const defenseTool = getDefenseTool();
    const healthTool = getHealthTool();
    const spellbookTool = getSpellbookTool();

    const activeModifiers = this.getActiveModifiers(context);
    const condResult = this.expandConditions(this.conditions);
    const stateFlags = condResult.stateFlags;

    const rawSize = String(this.size || "medium").toLowerCase();
    const sizeAcAttackMod = PF1E_SIZE_AC_ATTACK_MODS[rawSize] ?? 0;
    const sizeSpecialMod = PF1E_SIZE_SPECIAL_MODS[rawSize] ?? 0;
    const sizeFlyMod = PF1E_SIZE_FLY_MODS[rawSize] ?? 0;
    const sizeStealthMod = PF1E_SIZE_STEALTH_MODS[rawSize] ?? 0;

    const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
    const abilities = {};

    for (const k of abilityKeys) {
      const rawAb = this.abilities?.[k] ?? {};
      const base = Number(rawAb.base ?? 10);
      const damage = Number(rawAb.damage ?? 0);
      const drain = Number(rawAb.drain ?? 0);
      const penalty = Number(rawAb.penalty ?? 0);

      const relevantMods = activeModifiers.filter((m) => {
        const t = String(m.target ?? "").toLowerCase();
        return t === k || t === `ability.${k}` || t === `ability.${k}.total`;
      });

      let stackedBonus = 0;
      if (stacking) {
        stackedBonus = stacking.resolve(relevantMods, PF1E_STACKING_POLICY, "strongestBonusStackPenalties").total;
      } else {
        stackedBonus = relevantMods.reduce((s, m) => s + (Number(m.value) || 0), 0);
      }

      const total = Math.max(0, base + stackedBonus - drain);
      const damagePenalty = -Math.floor((damage + penalty) / 2);
      const baseMod = Math.floor((total - 10) / 2);
      const mod = baseMod + damagePenalty;

      abilities[k] = {
        base,
        total,
        mod,
        damage,
        drain,
        penalty,
        stackedBonus
      };
    }

    const items = Array.isArray(context.items)
      ? context.items
      : (Array.isArray(this.items) ? this.items : []);

    let totalWeightLbs = 0;
    let equippedArmor = null;
    let equippedShield = null;

    for (const it of items) {
      if (!it) continue;
      const qty = Number(it.quantity ?? 1);
      const w = Number(it.weightLbs ?? 0);
      totalWeightLbs += w * qty;

      if (it.equipped) {
        if (it.armorBonus !== undefined && it.slot === "armor" && !equippedArmor) {
          equippedArmor = it;
        } else if (it.shieldBonus !== undefined && (it.slot === "shield" || it.slot === "offHand") && !equippedShield) {
          equippedShield = it;
        }
      }
    }

    let capacity = null;
    if (abilitiesTool) {
      const sizeMult = rawSize === "large" ? 2 : (rawSize === "huge" ? 4 : (rawSize === "small" ? 0.75 : 1));
      capacity = abilitiesTool.carryingCapacity(abilities.str.total, sizeMult);
    } else {
      const maxLoad = abilities.str.total * 10;
      capacity = {
        light: Math.floor(maxLoad / 3),
        medium: Math.floor((maxLoad * 2) / 3),
        heavy: maxLoad,
        max: maxLoad
      };
    }

    const loadCategory = calculateLoadCategory(totalWeightLbs, capacity);

    let maxDex = null;
    if (loadCategory === "medium") maxDex = 3;
    else if (loadCategory === "heavy" || loadCategory === "overload") maxDex = 1;

    if (equippedArmor && equippedArmor.maxDex !== null && equippedArmor.maxDex !== undefined) {
      const armorMaxDex = Number(equippedArmor.maxDex);
      maxDex = maxDex !== null ? Math.min(maxDex, armorMaxDex) : armorMaxDex;
    }

    let loadAcp = 0;
    if (loadCategory === "medium") loadAcp = -3;
    else if (loadCategory === "heavy" || loadCategory === "overload") loadAcp = -6;

    let armorAcp = 0;
    if (equippedArmor) {
      let baseAcp = Number(equippedArmor.armorCheckPenalty ?? equippedArmor.acp ?? 0);
      if (equippedArmor.isBroken) baseAcp *= 2;
      armorAcp += baseAcp;
    }
    if (equippedShield) {
      let baseAcp = Number(equippedShield.armorCheckPenalty ?? equippedShield.acp ?? 0);
      if (equippedShield.isBroken) baseAcp *= 2;
      armorAcp += baseAcp;
    }
    const totalAcp = Math.min(loadAcp, armorAcp);

    const baseLandSpeed = Number(this.speeds?.land ?? 30);
    const armorCategory = equippedArmor?.armorCategory ??
      (equippedArmor && (equippedArmor.maxDex <= 3 || Number(equippedArmor.armorCheckPenalty ?? equippedArmor.acp ?? 0) <= -4) ? "medium" : "light");
    const weightCategoryForSpeed =
      loadCategory === "overload" ? "overload"
      : (loadCategory === "heavy" || armorCategory === "heavy" ? "heavy"
      : (loadCategory === "medium" || armorCategory === "medium" ? "medium"
      : "light"));
    let effectiveLandSpeed = calculateReducedSpeed(baseLandSpeed, weightCategoryForSpeed);
    if (stateFlags.halfSpeed) {
      effectiveLandSpeed = Math.floor(effectiveLandSpeed / 2);
    }
    if (stateFlags.cannotMove) {
      effectiveLandSpeed = 0;
    }

    let bab = Number(this.baseAtk ?? 0);
    let hd = 0;
    const classLevels = Array.isArray(context.classLevels)
      ? context.classLevels
      : (Array.isArray(this.classLevels) ? this.classLevels : []);

    for (const cl of classLevels) {
      if (!cl) continue;
      hd += Number(cl.classLevel ?? 1);
    }
    if (this.racialHDFormula) {
      const m = String(this.racialHDFormula).match(/^(\d+)d/i);
      if (m) hd += parseInt(m[1], 10);
    }
    if (hd === 0) hd = 1;

    const isUndead = String(this.creatureType || "").toLowerCase() === "undead";
    const hpConMod = isUndead ? abilities.cha.mod : abilities.con.mod;
    const maxHp = Math.max(1, Number(this.health?.maxHp ?? 10) + (hd * hpConMod));

    const iteratives = calculateIterativeBAB(bab);

    const compEnh = preprocessCompositeArmorEnhancements({
      armorBonus: equippedArmor ? (equippedArmor.isBroken ? Math.floor(Number(equippedArmor.armorBonus ?? 0) / 2) : Number(equippedArmor.armorBonus ?? 0)) : 0,
      armorEnhancement: equippedArmor ? Number(equippedArmor.enhancementBonus ?? 0) : 0,
      shieldBonus: equippedShield ? (equippedShield.isBroken ? Math.floor(Number(equippedShield.shieldBonus ?? 0) / 2) : Number(equippedShield.shieldBonus ?? 0)) : 0,
      shieldEnhancement: equippedShield ? Number(equippedShield.enhancementBonus ?? 0) : 0,
      naturalBonus: Number(this.defenses?.naturalAC ?? 0),
      naturalEnhancement: 0
    });

    const acModifiers = [
      { target: "ac", value: compEnh.armor, type: "armor", key: "armor" },
      { target: "ac", value: compEnh.shield, type: "shield", key: "shield" },
      { target: "ac", value: compEnh.natural, type: "natural", key: "natural" },
      { target: "ac", value: sizeAcAttackMod, type: "size", key: "size" },
      ...activeModifiers.filter((m) => {
        const t = String(m.target ?? "").toLowerCase();
        return t === "ac" || t === "ac.normal";
      })
    ];

    let ac = { normal: 10, touch: 10, flatFooted: 10 };
    if (defenseTool) {
      ac = defenseTool.resolveArmorClass({
        base: 10,
        modifiers: [
          ...acModifiers,
          { target: "ac", value: abilities.dex.mod, type: "dex", key: "dex" }
        ],
        policyMap: PF1E_STACKING_POLICY,
        maxDex,
        loseDexToAC: stateFlags.loseDexToAC,
        stackingService: stacking
      });
    } else {
      let dexBonus = stateFlags.loseDexToAC ? Math.min(0, abilities.dex.mod) : abilities.dex.mod;
      if (maxDex !== null && dexBonus > maxDex) dexBonus = maxDex;
      ac.normal = 10 + compEnh.armor + compEnh.shield + compEnh.natural + sizeAcAttackMod + dexBonus;
      ac.touch = 10 + sizeAcAttackMod + dexBonus;
      ac.flatFooted = 10 + compEnh.armor + compEnh.shield + compEnh.natural + sizeAcAttackMod + Math.min(0, dexBonus);
    }

    const baseSaves = {
      fort: Number(this.saveFortBase ?? 0),
      ref: Number(this.saveRefBase ?? 0),
      will: Number(this.saveWillBase ?? 0)
    };
    const saveMods = [
      { target: "fort", value: abilities.con.mod, type: "con", key: "con" },
      { target: "ref", value: abilities.dex.mod, type: "dex", key: "dex" },
      { target: "will", value: abilities.wis.mod, type: "wis", key: "wis" },
      ...activeModifiers.filter((m) => {
        const t = String(m.target ?? "").toLowerCase();
        return t.startsWith("save");
      })
    ];

    let saves = { fort: baseSaves.fort + abilities.con.mod, ref: baseSaves.ref + abilities.dex.mod, will: baseSaves.will + abilities.wis.mod };
    if (defenseTool) {
      saves = defenseTool.resolveSavingThrows({
        saves: baseSaves,
        modifiers: saveMods,
        policyMap: PF1E_STACKING_POLICY,
        stackingService: stacking
      });
    }

    const cmb = calculateCMB({
      bab,
      strMod: abilities.str.mod,
      dexMod: abilities.dex.mod,
      size: rawSize
    });

    const cmd = calculateCMD({
      bab,
      strMod: abilities.str.mod,
      dexMod: abilities.dex.mod,
      maxDex,
      size: rawSize,
      loseDexToAC: stateFlags.loseDexToAC
    });

    const init = abilities.dex.mod + (Number(this.initBonus ?? 0));

    const skills = {};
    for (const [sKey, sDef] of Object.entries(PF1E_SKILLS)) {
      const rawSkill = this.skills?.[sKey] ?? {};
      const ranks = Number(rawSkill.ranks ?? 0);
      const isClassSkill = Boolean(rawSkill.isClassSkill ?? false);
      const csBonus = (isClassSkill && ranks >= 1) ? 3 : 0;
      const acpBonus = sDef.acp ? totalAcp : 0;
      const sizeBonus = sKey === "stealth" ? sizeStealthMod : (sKey === "fly" ? sizeFlyMod : 0);
      const abMod = abilities[sDef.ability]?.mod ?? 0;

      const skillMods = activeModifiers.filter((m) => {
        const t = String(m.target ?? "").toLowerCase();
        return t === `skills.${sKey}` || t === "skills.all";
      });
      const skillModSum = skillMods.reduce((s, m) => s + (Number(m.value) || 0), 0);

      const total = abMod + ranks + csBonus + acpBonus + sizeBonus + skillModSum;
      skills[sKey] = {
        name: sDef.name,
        ability: sDef.ability,
        ranks,
        isClassSkill,
        total,
        canUse: !(sDef.trainedOnly && ranks === 0)
      };
    }

    const classes = {};
    for (const cl of classLevels) {
      if (!cl) continue;
      const cName = String(cl.name ?? cl.className ?? cl.class ?? cl.tag ?? "class").toLowerCase();
      const lvl = Number(cl.classLevel ?? cl.level ?? 1);
      classes[cName] = { level: (classes[cName]?.level ?? 0) + lvl };
    }

    const clVal = Number(this.casterLevel ?? 0);
    const rollData = {
      "@abilities.str.mod": abilities.str.mod,
      "@abilities.dex.mod": abilities.dex.mod,
      "@abilities.con.mod": abilities.con.mod,
      "@abilities.int.mod": abilities.int.mod,
      "@abilities.wis.mod": abilities.wis.mod,
      "@abilities.cha.mod": abilities.cha.mod,
      "@bab": bab,
      "@cl": clVal,
      "@size": rawSize,
      "@armor.acp": totalAcp,
      bab,
      cl: clVal,
      size: rawSize,
      armor: { acp: totalAcp },
      abilities: {
        str: abilities.str,
        dex: abilities.dex,
        con: abilities.con,
        int: abilities.int,
        wis: abilities.wis,
        cha: abilities.cha
      },
      classes,
      attributes: {
        bab,
        acp: totalAcp,
        hd
      }
    };
    for (const [cName, cData] of Object.entries(classes)) {
      rollData[`@classes.${cName}.level`] = cData.level;
    }

    const derived = {
      size: rawSize,
      abilities,
      encumbrance: {
        totalWeightLbs,
        capacity,
        loadCategory,
        maxDex,
        acp: totalAcp
      },
      speed: {
        land: effectiveLandSpeed,
        base: baseLandSpeed
      },
      bab,
      hd,
      iteratives,
      hp: {
        max: maxHp,
        current: Number(this.health?.hp ?? maxHp),
        temp: Number(this.health?.tempHp ?? 0),
        nonlethal: Number(this.health?.nonlethal ?? 0)
      },
      ac: {
        normal: ac.normal,
        touch: ac.touch,
        flatFooted: ac.flatFooted
      },
      saves: {
        fort: saves.fort,
        ref: saves.ref,
        will: saves.will
      },
      cmb,
      cmd,
      init,
      skills,
      stateFlags,
      rollData
    };

    return derived;
  }
}
