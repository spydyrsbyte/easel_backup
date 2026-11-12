import { ActorDerived } from "./layers/actor-derived.mjs";
import { ItemPhysical, WeaponPhysical, ArmorPhysical } from "./layers/item-physical.mjs";
import { definitions } from "./automations.mjs";
import {
  PF1E_STACKING_POLICY,
  PF1E_DERIVED_DEFINITIONS,
  PF1E_SKILLS,
  PF1E_CONDITIONS,
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
} from "./rules-config.mjs";
import {
  PF1E_HINDRANCES,
  PF1E_VISION_PRESETS,
  registerPF1eVision,
  recordIllusionDisbelief,
  applyViewerPresentationOverrides
} from "./vision-pf1e.mjs";

function mixin(Target, Source) {
  const parent = Object.getPrototypeOf(Source.prototype);
  if (parent && parent !== Object.prototype) mixin(Target, { prototype: parent });
  for (const name of Object.getOwnPropertyNames(Source.prototype)) {
    if (name === "constructor") continue;
    const desc = Object.getOwnPropertyDescriptor(Source.prototype, name);
    if (desc) Object.defineProperty(Target.prototype, name, desc);
  }
}

export class Actor extends (globalThis.easel?.pf1e?.Actor ?? class {}) {}
mixin(Actor, ActorDerived);

export class Character extends (globalThis.easel?.pf1e?.Character ?? class {}) {}
mixin(Character, ActorDerived);

export class NPC extends (globalThis.easel?.pf1e?.NPC ?? class {}) {}
mixin(NPC, ActorDerived);

export class Item extends (globalThis.easel?.pf1e?.Item ?? class {}) {}
mixin(Item, ItemPhysical);

export class Weapon extends (globalThis.easel?.pf1e?.Weapon ?? class {}) {}
mixin(Weapon, WeaponPhysical);

export class Armor extends (globalThis.easel?.pf1e?.Armor ?? class {}) {}
mixin(Armor, ArmorPhysical);

export class Spellbook extends (globalThis.easel?.pf1e?.Spellbook ?? class {}) {}
export class Spell extends (globalThis.easel?.pf1e?.Spell ?? class {}) {}
export class Buff extends (globalThis.easel?.pf1e?.Buff ?? class {}) {}
export class Action extends (globalThis.easel?.pf1e?.Action ?? class {}) {}

export {
  PF1E_STACKING_POLICY,
  PF1E_DERIVED_DEFINITIONS,
  PF1E_SKILLS,
  PF1E_CONDITIONS,
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
  calculateReducedSpeed,
  PF1E_HINDRANCES,
  PF1E_VISION_PRESETS,
  registerPF1eVision,
  recordIllusionDisbelief,
  applyViewerPresentationOverrides,
  definitions
};

if (globalThis.Server?.events?.on) {
  globalThis.Server.events.on("Load.Automation.Ready", () => {
    if (globalThis.Application?.automations?.define) {
      for (const def of definitions()) {
        globalThis.Application.automations.define(def);
      }
    }
  });
}
