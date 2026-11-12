export const PF1E_STACKING_POLICY = {
  alchemical: "highest",
  armor: "highest",
  bab: "highest",
  circumstance: "sumBySource",
  competence: "highest",
  deflection: "highest",
  dodge: "sum",
  enhancement: "highest",
  inherent: "highest",
  insight: "highest",
  luck: "highest",
  morale: "highest",
  natural: "highest",
  profane: "highest",
  racial: "sum",
  resistance: "highest",
  sacred: "highest",
  shield: "highest",
  size: "highest",
  trait: "highest",
  untyped: "sum",
  penalty: "sum"
};

export const PF1E_SIZE_SPECIAL_MODS = {
  fine: -8,
  diminutive: -4,
  tiny: -2,
  small: -1,
  medium: 0,
  large: 1,
  huge: 2,
  gargantuan: 4,
  colossal: 8
};

export const PF1E_SIZE_AC_ATTACK_MODS = {
  fine: 8,
  diminutive: 4,
  tiny: 2,
  small: 1,
  medium: 0,
  large: -1,
  huge: -2,
  gargantuan: -4,
  colossal: -8
};

export const PF1E_SIZE_STEALTH_MODS = {
  fine: 16,
  diminutive: 12,
  tiny: 8,
  small: 4,
  medium: 0,
  large: -4,
  huge: -8,
  gargantuan: -12,
  colossal: -16
};

export const PF1E_SIZE_FLY_MODS = {
  fine: 8,
  diminutive: 6,
  tiny: 4,
  small: 2,
  medium: 0,
  large: -2,
  huge: -4,
  gargantuan: -6,
  colossal: -8
};

export const PF1E_SKILLS = {
  acr: { name: "Acrobatics", ability: "dex", acp: true, trainedOnly: false },
  apr: { name: "Appraise", ability: "int", acp: false, trainedOnly: false },
  art: { name: "Artistry", ability: "int", acp: false, trainedOnly: false },
  blf: { name: "Bluff", ability: "cha", acp: false, trainedOnly: false },
  clm: { name: "Climb", ability: "str", acp: true, trainedOnly: false },
  crf: { name: "Craft", ability: "int", acp: false, trainedOnly: false },
  dip: { name: "Diplomacy", ability: "cha", acp: false, trainedOnly: false },
  dev: { name: "Disable Device", ability: "dex", acp: true, trainedOnly: true },
  dis: { name: "Disguise", ability: "cha", acp: false, trainedOnly: false },
  esc: { name: "Escape Artist", ability: "dex", acp: true, trainedOnly: false },
  fly: { name: "Fly", ability: "dex", acp: true, trainedOnly: false },
  han: { name: "Handle Animal", ability: "cha", acp: false, trainedOnly: true },
  hea: { name: "Heal", ability: "wis", acp: false, trainedOnly: false },
  int: { name: "Intimidate", ability: "cha", acp: false, trainedOnly: false },
  kar: { name: "Knowledge (arcana)", ability: "int", acp: false, trainedOnly: true },
  kdu: { name: "Knowledge (dungeoneering)", ability: "int", acp: false, trainedOnly: true },
  ken: { name: "Knowledge (engineering)", ability: "int", acp: false, trainedOnly: true },
  kge: { name: "Knowledge (geography)", ability: "int", acp: false, trainedOnly: true },
  khi: { name: "Knowledge (history)", ability: "int", acp: false, trainedOnly: true },
  klo: { name: "Knowledge (local)", ability: "int", acp: false, trainedOnly: true },
  kna: { name: "Knowledge (nature)", ability: "int", acp: false, trainedOnly: true },
  kno: { name: "Knowledge (nobility)", ability: "int", acp: false, trainedOnly: true },
  kpl: { name: "Knowledge (planes)", ability: "int", acp: false, trainedOnly: true },
  kre: { name: "Knowledge (religion)", ability: "int", acp: false, trainedOnly: true },
  lin: { name: "Linguistics", ability: "int", acp: false, trainedOnly: true },
  lor: { name: "Lore", ability: "int", acp: false, trainedOnly: true },
  per: { name: "Perception", ability: "wis", acp: false, trainedOnly: false },
  prf: { name: "Perform", ability: "cha", acp: false, trainedOnly: false },
  pro: { name: "Profession", ability: "wis", acp: false, trainedOnly: true },
  rid: { name: "Ride", ability: "dex", acp: true, trainedOnly: false },
  sen: { name: "Sense Motive", ability: "wis", acp: false, trainedOnly: false },
  slt: { name: "Sleight of Hand", ability: "dex", acp: true, trainedOnly: true },
  spl: { name: "Spellcraft", ability: "int", acp: false, trainedOnly: true },
  ste: { name: "Stealth", ability: "dex", acp: true, trainedOnly: false },
  sur: { name: "Survival", ability: "wis", acp: false, trainedOnly: false },
  swm: { name: "Swim", ability: "str", acp: true, trainedOnly: false },
  umd: { name: "Use Magic Device", ability: "cha", acp: false, trainedOnly: true }
};

export const PF1E_CONDITIONS = {
  blinded: {
    loseDexToAC: true,
    acPenalty: -2,
    skillPenaltyStrDex: -4,
    perceptionSightFail: true
  },
  dazzled: {
    attackPenalty: -1,
    perceptionSightPenalty: -1
  },
  deafened: {
    initPenalty: -4,
    perceptionSoundFail: true,
    spellFailureVerbalPercent: 20
  },
  entangled: {
    attackPenalty: -2,
    dexPenalty: -4,
    halfSpeed: true,
    cannotRunOrCharge: true
  },
  exhausted: {
    strPenalty: -6,
    dexPenalty: -6,
    halfSpeed: true
  },
  fatigued: {
    strPenalty: -2,
    dexPenalty: -2,
    cannotRunOrCharge: true
  },
  frightened: {
    attackPenalty: -2,
    savePenalty: -2,
    skillPenalty: -2,
    mustFlee: true
  },
  shaken: {
    attackPenalty: -2,
    savePenalty: -2,
    skillPenalty: -2
  },
  panicked: {
    savePenalty: -2,
    skillPenalty: -2,
    dropsItems: true,
    mustFlee: true
  },
  grappled: {
    attackPenalty: -2,
    dexPenalty: -4,
    cannotTwoHand: true,
    cannotRunOrCharge: true
  },
  pinned: {
    loseDexToAC: true,
    acPenalty: -4,
    cannotMove: true,
    limitedActions: true
  },
  helpless: {
    loseDexToAC: true,
    effectiveDex: 0,
    meleeAgainstBonus: 4
  },
  incorporeal: {
    noArmorNaturalAC: true,
    chaDeflectionMinOne: true
  },
  invisible: {
    attackBonusVsSighted: 2,
    ignoresTargetDexAC: true,
    stealthBonus: 20
  },
  nauseated: {
    cannotTakeStandardActions: true,
    singleMoveOnly: true
  },
  paralyzed: {
    helpless: true,
    effectiveStr: 0,
    effectiveDex: 0,
    cannotMove: true,
    cannotTakeActions: true
  },
  prone: {
    meleeAttackPenalty: -4,
    meleeACPenalty: -4,
    rangedACBonus: 4
  },
  sickened: {
    attackPenalty: -2,
    damagePenalty: -2,
    savePenalty: -2,
    skillPenalty: -2
  },
  squeezing: {
    attackPenalty: -4,
    acPenalty: -4,
    halfSpeed: true
  },
  staggered: {
    singleActionOnly: true
  },
  stunned: {
    loseDexToAC: true,
    acPenalty: -2,
    dropsItems: true,
    cannotTakeActions: true
  },
  dazed: {
    cannotTakeActions: true
  },
  cowering: {
    loseDexToAC: true,
    acPenalty: -2,
    cannotTakeActions: true
  },
  unconscious: {
    helpless: true,
    effectiveDex: 0,
    cannotTakeActions: true
  },
  dying: {
    unconscious: true,
    cannotTakeActions: true
  },
  dead: {
    cannotTakeActions: true,
    cannotMove: true
  }
};

export const PF1E_DERIVED_DEFINITIONS = [
  { id: "size", deps: [], op: "formula", formula: "@size_base" },
  { id: "ability.str.total", deps: ["size"], op: "formula", formula: "@ability_str_base + @ability_str_bonus - @ability_str_drain" },
  { id: "ability.dex.total", deps: ["size"], op: "formula", formula: "@ability_dex_base + @ability_dex_bonus - @ability_dex_drain" },
  { id: "ability.con.total", deps: ["size"], op: "formula", formula: "@ability_con_base + @ability_con_bonus - @ability_con_drain" },
  { id: "ability.int.total", deps: ["size"], op: "formula", formula: "@ability_int_base + @ability_int_bonus - @ability_int_drain" },
  { id: "ability.wis.total", deps: ["size"], op: "formula", formula: "@ability_wis_base + @ability_wis_bonus - @ability_wis_drain" },
  { id: "ability.cha.total", deps: ["size"], op: "formula", formula: "@ability_cha_base + @ability_cha_bonus - @ability_cha_drain" },
  { id: "ability.str.mod", deps: ["ability.str.total"], op: "formula", formula: "floor((@ability.str.total - 10) / 2) - floor((@ability_str_damage + @ability_str_penalty) / 2)" },
  { id: "ability.dex.mod", deps: ["ability.dex.total"], op: "formula", formula: "floor((@ability.dex.total - 10) / 2) - floor((@ability_dex_damage + @ability_dex_penalty) / 2)" },
  { id: "ability.con.mod", deps: ["ability.con.total"], op: "formula", formula: "floor((@ability.con.total - 10) / 2) - floor((@ability_con_damage + @ability_con_penalty) / 2)" },
  { id: "ability.int.mod", deps: ["ability.int.total"], op: "formula", formula: "floor((@ability.int.total - 10) / 2) - floor((@ability_int_damage + @ability_int_penalty) / 2)" },
  { id: "ability.wis.mod", deps: ["ability.wis.total"], op: "formula", formula: "floor((@ability.wis.total - 10) / 2) - floor((@ability_wis_damage + @ability_wis_penalty) / 2)" },
  { id: "ability.cha.mod", deps: ["ability.cha.total"], op: "formula", formula: "floor((@ability.cha.total - 10) / 2) - floor((@ability_cha_damage + @ability_cha_penalty) / 2)" },
  { id: "encumbrance", deps: ["ability.str.total", "size"], op: "formula", formula: "@carried_weight" },
  { id: "armorLimits", deps: ["ability.str.total", "size"], op: "formula", formula: "@armor_acp" },
  { id: "bab", deps: [], op: "formula", formula: "@bab_base" },
  { id: "hd", deps: [], op: "formula", formula: "@hd_base" },
  { id: "hp.max", deps: ["hd", "ability.con.mod"], op: "formula", formula: "max(1, @hp_base + (@hd * ifelse(@is_undead, @ability.cha.mod, @ability.con.mod)) + @hp_bonus)" },
  { id: "ac.normal", deps: ["size", "ability.dex.mod", "encumbrance", "armorLimits"], op: "formula", formula: "10 + @ac_armor + @ac_shield + min(@ability.dex.mod, @ac_max_dex) + @ac_size + @ac_natural + @ac_deflection + @ac_dodge + @ac_other" },
  { id: "ac.touch", deps: ["size", "ability.dex.mod", "encumbrance", "armorLimits"], op: "formula", formula: "10 + min(@ability.dex.mod, @ac_max_dex) + @ac_size + @ac_deflection + @ac_dodge + @ac_other_touch" },
  { id: "ac.flatFooted", deps: ["size", "encumbrance", "armorLimits"], op: "formula", formula: "10 + @ac_armor + @ac_shield + min(0, @ability.dex.mod) + @ac_size + @ac_natural + @ac_deflection + @ac_other" },
  { id: "save.fort", deps: ["ability.con.mod"], op: "formula", formula: "@save_fort_base + @ability.con.mod + @save_fort_bonus" },
  { id: "save.ref", deps: ["ability.dex.mod"], op: "formula", formula: "@save_ref_base + @ability.dex.mod + @save_ref_bonus" },
  { id: "save.will", deps: ["ability.wis.mod"], op: "formula", formula: "@save_will_base + @ability.wis.mod + @save_will_bonus" },
  { id: "cmb", deps: ["bab", "size", "ability.str.mod", "ability.dex.mod"], op: "formula", formula: "@bab + ifelse(@use_dex_for_cmb, @ability.dex.mod, @ability.str.mod) + @special_size_mod + @cmb_bonus" },
  { id: "cmd", deps: ["bab", "size", "ability.str.mod", "ability.dex.mod", "ac.normal"], op: "formula", formula: "10 + @bab + @ability.str.mod + ifelse(@lose_dex_to_ac, min(0, @ability.dex.mod), min(@ability.dex.mod, @ac_max_dex)) + @special_size_mod + @ac_deflection + ifelse(@lose_dex_to_ac, 0, @ac_dodge) + @cmd_other" },
  { id: "init", deps: ["ability.dex.mod"], op: "formula", formula: "@ability.dex.mod + @init_bonus" },
  { id: "speed.land", deps: ["encumbrance", "armorLimits"], op: "formula", formula: "@speed_land_effective" },
  { id: "speed.fly", deps: ["encumbrance", "armorLimits"], op: "formula", formula: "@speed_fly_effective" },
  { id: "speed.swim", deps: ["encumbrance", "armorLimits"], op: "formula", formula: "@speed_swim_effective" },
  { id: "speed.climb", deps: ["encumbrance", "armorLimits"], op: "formula", formula: "@speed_climb_effective" },
  { id: "speed.burrow", deps: ["encumbrance", "armorLimits"], op: "formula", formula: "@speed_burrow_effective" },
  ...Object.entries(PF1E_SKILLS).map(([sKey, sDef]) => ({
    id: `skills.${sKey}`,
    deps: [`ability.${sDef.ability}.mod`, "armorLimits", "size"],
    op: "formula",
    formula: `@skills_${sKey}_ranks + @ability.${sDef.ability}.mod + ifelse(@skills_${sKey}_isClassSkill && @skills_${sKey}_ranks >= 1, 3, 0) + ifelse(${sDef.acp}, @armor_acp, 0) + @skills_${sKey}_bonus`
  })),
  { id: "spellbooks", deps: ["ability.int.mod", "ability.wis.mod", "ability.cha.mod"], op: "formula", formula: "@spellbooks_total" },
  { id: "actions", deps: ["bab", "size", "ability.str.mod", "ability.dex.mod"], op: "formula", formula: "@actions_total" }
];

export function preprocessCompositeArmorEnhancements({
  armorBonus = 0,
  armorEnhancement = 0,
  shieldBonus = 0,
  shieldEnhancement = 0,
  naturalBonus = 0,
  naturalEnhancement = 0
} = {}) {
  return {
    armor: Number(armorBonus || 0) + Number(armorEnhancement || 0),
    shield: Number(shieldBonus || 0) + Number(shieldEnhancement || 0),
    natural: Number(naturalBonus || 0) + Number(naturalEnhancement || 0)
  };
}

export function calculateIterativeBAB(bab) {
  const b = Math.max(0, Math.floor(Number(bab) || 0));
  if (b === 0) return [0];
  const attacks = [];
  let cur = b;
  while (cur > 0 && attacks.length < 4) {
    attacks.push(cur);
    cur -= 5;
  }
  return attacks;
}

export function calculateTWFPenalties({ lightOffHand = false, hasTWFFeat = false } = {}) {
  if (hasTWFFeat) {
    return lightOffHand ? { primary: -2, offhand: -2 } : { primary: -4, offhand: -4 };
  }
  return lightOffHand ? { primary: -4, offhand: -8 } : { primary: -6, offhand: -10 };
}

export function calculateNaturalAttack({
  bab = 0,
  isPrimary = true,
  hasMultiattack = false,
  strMod = 0,
  singleNaturalAttack = false
} = {}) {
  const b = Math.floor(Number(bab) || 0);
  const s = Math.floor(Number(strMod) || 0);
  if (isPrimary) {
    const attackBonus = b;
    const damageMultiplier = singleNaturalAttack ? 1.5 : 1.0;
    const damageMod = Math.floor(s * damageMultiplier);
    return { attackBonus, damageMod, damageMultiplier };
  } else {
    const attackBonus = hasMultiattack ? b - 2 : b - 5;
    const damageMultiplier = 0.5;
    const damageMod = Math.floor(s * damageMultiplier);
    return { attackBonus, damageMod, damageMultiplier };
  }
}

export function calculateCMB({
  bab = 0,
  strMod = 0,
  dexMod = 0,
  size = "medium",
  useDex = false,
  bonus = 0
} = {}) {
  const b = Math.floor(Number(bab) || 0);
  const sizeMod = PF1E_SIZE_SPECIAL_MODS[String(size).toLowerCase()] ?? 0;
  const isTinyOrSmaller = ["tiny", "diminutive", "fine"].includes(String(size).toLowerCase());
  const effectiveAbilityMod = (useDex || isTinyOrSmaller) ? Math.floor(Number(dexMod) || 0) : Math.floor(Number(strMod) || 0);
  return b + effectiveAbilityMod + sizeMod + Math.floor(Number(bonus) || 0);
}

export function calculateCMD({
  bab = 0,
  strMod = 0,
  dexMod = 0,
  maxDex = null,
  size = "medium",
  deflection = 0,
  dodge = 0,
  insight = 0,
  luck = 0,
  morale = 0,
  profane = 0,
  sacred = 0,
  circumstance = 0,
  loseDexToAC = false,
  other = 0
} = {}) {
  const b = Math.floor(Number(bab) || 0);
  const s = Math.floor(Number(strMod) || 0);
  const rawDex = Math.floor(Number(dexMod) || 0);
  let effectiveDex = rawDex;
  if (maxDex !== null && maxDex !== undefined && effectiveDex > Number(maxDex)) {
    effectiveDex = Number(maxDex);
  }
  if (loseDexToAC) {
    effectiveDex = Math.min(0, effectiveDex);
  }
  const effectiveDodge = loseDexToAC ? 0 : Math.max(0, Math.floor(Number(dodge) || 0));
  const sizeMod = PF1E_SIZE_SPECIAL_MODS[String(size).toLowerCase()] ?? 0;
  return 10 + b + s + effectiveDex + sizeMod +
    Math.floor(Number(deflection) || 0) +
    effectiveDodge +
    Math.floor(Number(insight) || 0) +
    Math.floor(Number(luck) || 0) +
    Math.floor(Number(morale) || 0) +
    Math.floor(Number(profane) || 0) +
    Math.floor(Number(sacred) || 0) +
    Math.floor(Number(circumstance) || 0) +
    Math.floor(Number(other) || 0);
}

export function calculateLoadCategory(totalWeightLbs, capacity) {
  const w = Number(totalWeightLbs) || 0;
  if (!capacity) return "light";
  if (w <= capacity.light) return "light";
  if (w <= capacity.medium) return "medium";
  if (w <= capacity.heavy) return "heavy";
  return "overload";
}

export function calculateReducedSpeed(baseSpeed, weightCategory) {
  const speed = Math.floor(Number(baseSpeed) || 0);
  if (weightCategory !== "medium" && weightCategory !== "heavy" && weightCategory !== "overload") {
    return speed;
  }
  if (weightCategory === "overload") return 0;
  if (speed <= 20) return 15;
  if (speed <= 30) return 20;
  if (speed <= 40) return 30;
  if (speed <= 50) return 35;
  if (speed <= 60) return 40;
  return Math.floor((speed * 2) / 3 / 5) * 5;
}
