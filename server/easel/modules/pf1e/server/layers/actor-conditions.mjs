import { ActorBase } from "./actor-base.mjs";
import { PF1E_CONDITIONS } from "../rules-config.mjs";

export class ActorConditions extends ActorBase {
  expandConditions(inputConditions = {}) {
    const raw = inputConditions ?? this.conditions ?? {};
    let conditions = {};
    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (typeof item === "string") {
          const k = item.toLowerCase();
          conditions[k] = (conditions[k] || 0) + 1;
        } else if (item && typeof item === "object") {
          for (const [k, v] of Object.entries(item)) {
            if (typeof v === "number") conditions[k] = (conditions[k] || 0) + v;
            else if (v) conditions[k] = (conditions[k] || 0) + 1;
          }
        }
      }
    } else if (typeof raw === "object") {
      conditions = { ...raw };
    }

    const fatigueCount = (conditions.fatigued === true ? 1 : (Number(conditions.fatigued) || 0)) + (Number(conditions.fatiguedCount) || 0);
    if (fatigueCount >= 2 || (conditions.fatigued && conditions.exhausted)) {
      conditions.exhausted = true;
      conditions.fatigued = false;
    } else if (fatigueCount === 1) {
      conditions.fatigued = true;
    }

    const shakenCount = (conditions.shaken === true ? 1 : (Number(conditions.shaken) || 0)) + (Number(conditions.shakenCount) || 0);
    if ((conditions.shaken && conditions.frightened) || shakenCount >= 3) {
      conditions.panicked = true;
      conditions.frightened = false;
      conditions.shaken = false;
    } else if (shakenCount >= 2) {
      conditions.frightened = true;
      conditions.shaken = false;
    } else if (shakenCount === 1 && !conditions.frightened && !conditions.panicked) {
      conditions.shaken = true;
    }

    const stateFlags = {
      loseDexToAC: false,
      cannotTakeActions: false,
      cannotTakeStandardActions: false,
      cannotMove: false,
      halfSpeed: false,
      cannotRunOrCharge: false,
      meleeAgainstBonus: 0,
      rangedACBonus: 0,
      meleeACPenalty: 0,
      dropsItems: false,
      mustFlee: false
    };

    const modifiers = [];

    const addMod = (target, value, type = "penalty", key = "penalty") => {
      modifiers.push({
        target,
        value,
        type,
        key,
        op: "add",
        source: "condition",
        enabled: true
      });
    };

    if (conditions.blinded) {
      stateFlags.loseDexToAC = true;
      addMod("ac.normal", -2);
      addMod("skills.acr", -4);
      addMod("skills.clm", -4);
      addMod("skills.dev", -4);
      addMod("skills.esc", -4);
      addMod("skills.fly", -4);
      addMod("skills.rid", -4);
      addMod("skills.slt", -4);
      addMod("skills.ste", -4);
      addMod("skills.swm", -4);
      addMod("skills.per", -4);
    }

    if (conditions.dazzled) {
      addMod("attack", -1);
      addMod("skills.per", -1);
    }

    if (conditions.deafened) {
      addMod("init", -4);
      addMod("skills.per", -4);
    }

    if (conditions.entangled) {
      addMod("attack", -2);
      addMod("ability.dex.total", -4);
      stateFlags.halfSpeed = true;
      stateFlags.cannotRunOrCharge = true;
    }

    if (conditions.exhausted) {
      addMod("ability.str.total", -6);
      addMod("ability.dex.total", -6);
      stateFlags.halfSpeed = true;
    } else if (conditions.fatigued) {
      addMod("ability.str.total", -2);
      addMod("ability.dex.total", -2);
      stateFlags.cannotRunOrCharge = true;
    }

    if (conditions.panicked) {
      addMod("save.fort", -2);
      addMod("save.ref", -2);
      addMod("save.will", -2);
      addMod("skills.all", -2);
      stateFlags.dropsItems = true;
      stateFlags.mustFlee = true;
    } else if (conditions.frightened) {
      addMod("attack", -2);
      addMod("save.fort", -2);
      addMod("save.ref", -2);
      addMod("save.will", -2);
      addMod("skills.all", -2);
      stateFlags.mustFlee = true;
    } else if (conditions.shaken) {
      addMod("attack", -2);
      addMod("save.fort", -2);
      addMod("save.ref", -2);
      addMod("save.will", -2);
      addMod("skills.all", -2);
    }

    if (conditions.grappled) {
      addMod("attack", -2);
      addMod("cmb", -2);
      addMod("ability.dex.total", -4);
      stateFlags.cannotRunOrCharge = true;
    }

    if (conditions.pinned) {
      stateFlags.loseDexToAC = true;
      stateFlags.cannotMove = true;
      addMod("ac.normal", -4);
    }

    if (conditions.helpless) {
      stateFlags.loseDexToAC = true;
      stateFlags.meleeAgainstBonus = 4;
    }

    if (conditions.invisible) {
      addMod("attack", 2);
      addMod("skills.ste", 20);
    }

    if (conditions.nauseated) {
      stateFlags.cannotTakeStandardActions = true;
    }

    if (conditions.paralyzed) {
      stateFlags.loseDexToAC = true;
      stateFlags.cannotMove = true;
      stateFlags.cannotTakeActions = true;
      stateFlags.cannotTakeStandardActions = true;
      stateFlags.meleeAgainstBonus = 4;
    }

    if (conditions.prone) {
      addMod("attack.melee", -4);
      stateFlags.meleeACPenalty = -4;
      stateFlags.rangedACBonus = 4;
    }

    if (conditions.sickened) {
      addMod("attack", -2);
      addMod("damage", -2);
      addMod("save.fort", -2);
      addMod("save.ref", -2);
      addMod("save.will", -2);
      addMod("skills.all", -2);
    }

    if (conditions.squeezing) {
      addMod("attack", -4);
      addMod("ac.normal", -4);
      stateFlags.halfSpeed = true;
    }

    if (conditions.staggered) {
      stateFlags.cannotTakeStandardActions = false;
    }

    if (conditions.stunned) {
      stateFlags.loseDexToAC = true;
      stateFlags.cannotTakeActions = true;
      stateFlags.cannotTakeStandardActions = true;
      stateFlags.dropsItems = true;
      addMod("ac.normal", -2);
    }

    if (conditions.dazed) {
      stateFlags.cannotTakeActions = true;
      stateFlags.cannotTakeStandardActions = true;
    }

    if (conditions.cowering) {
      stateFlags.loseDexToAC = true;
      stateFlags.cannotTakeActions = true;
      stateFlags.cannotTakeStandardActions = true;
      addMod("ac.normal", -2);
    }

    if (conditions.unconscious || conditions.dying) {
      stateFlags.loseDexToAC = true;
      stateFlags.cannotMove = true;
      stateFlags.cannotTakeActions = true;
      stateFlags.cannotTakeStandardActions = true;
      stateFlags.meleeAgainstBonus = 4;
    }

    if (conditions.dead) {
      stateFlags.cannotMove = true;
      stateFlags.cannotTakeActions = true;
      stateFlags.cannotTakeStandardActions = true;
    }

    return {
      conditions,
      stateFlags,
      modifiers
    };
  }
}
