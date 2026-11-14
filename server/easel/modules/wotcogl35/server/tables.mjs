export const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

export const SIZES = {
  fine: { label: "Fine", attack: 8, maneuver: -8, stealth: 16, fly: 8, carry: 0.125, step: -4 },
  diminutive: { label: "Diminutive", attack: 4, maneuver: -4, stealth: 12, fly: 6, carry: 0.25, step: -3 },
  tiny: { label: "Tiny", attack: 2, maneuver: -2, stealth: 8, fly: 4, carry: 0.5, step: -2 },
  small: { label: "Small", attack: 1, maneuver: -1, stealth: 4, fly: 2, carry: 0.75, step: -1 },
  medium: { label: "Medium", attack: 0, maneuver: 0, stealth: 0, fly: 0, carry: 1, step: 0 },
  large: { label: "Large", attack: -1, maneuver: 1, stealth: -4, fly: -2, carry: 2, step: 1 },
  huge: { label: "Huge", attack: -2, maneuver: 2, stealth: -8, fly: -4, carry: 4, step: 2 },
  gargantuan: { label: "Gargantuan", attack: -4, maneuver: 4, stealth: -12, fly: -6, carry: 8, step: 3 },
  colossal: { label: "Colossal", attack: -8, maneuver: 8, stealth: -16, fly: -8, carry: 16, step: 4 },
};

export const BONUS_TYPES = {
  alchemical: "strongestBonusStackPenalties",
  armor: "strongestBonusStackPenalties",
  circumstance: "sumBySource",
  competence: "strongestBonusStackPenalties",
  deflection: "strongestBonusStackPenalties",
  dodge: "sum",
  enhancement: "strongestBonusStackPenalties",
  inherent: "strongestBonusStackPenalties",
  insight: "strongestBonusStackPenalties",
  luck: "strongestBonusStackPenalties",
  morale: "strongestBonusStackPenalties",
  natural: "strongestBonusStackPenalties",
  naturalEnhancement: "strongestBonusStackPenalties",
  profane: "strongestBonusStackPenalties",
  racial: "sum",
  resistance: "strongestBonusStackPenalties",
  sacred: "strongestBonusStackPenalties",
  shield: "strongestBonusStackPenalties",
  size: "strongestBonusStackPenalties",
  trait: "strongestBonusStackPenalties",
  untyped: "sumBySource",
};

export const PROGRESSIONS = {
  bab: {
    full: (level) => level,
    medium: (level) => Math.floor((level * 3) / 4),
    poor: (level) => Math.floor(level / 2),
  },
  save: {
    good: (level) => 2 + Math.floor(level / 2),
    poor: (level) => Math.floor(level / 3),
  },
};

const HEAVY_LOAD = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 115, 130, 150, 175, 200, 230, 260, 300, 350, 400, 460, 520, 600, 700, 800, 920, 1040, 1200, 1400];

export function carryingCapacity(strength, size = "medium", legs = 2) {
  const score = Math.max(0, Math.floor(Number(strength) || 0));
  let heavy;
  if (score < HEAVY_LOAD.length) heavy = HEAVY_LOAD[score];
  else {
    const steps = Math.floor((score - 20) / 10);
    heavy = HEAVY_LOAD[score - steps * 10] * Math.pow(4, steps);
  }
  let factor = SIZES[size] ? SIZES[size].carry : 1;
  if (legs >= 4) factor = { fine: 0.25, diminutive: 0.5, tiny: 0.75, small: 1, medium: 1.5, large: 3, huge: 6, gargantuan: 12, colossal: 24 }[size] || 1.5;
  heavy = Math.floor(heavy * factor);
  return { light: Math.floor(heavy / 3), medium: Math.floor((heavy * 2) / 3), heavy, lift: heavy * 2, drag: heavy * 5 };
}

export function loadOf(weight, capacity) {
  if (weight <= capacity.light) return "light";
  if (weight <= capacity.medium) return "medium";
  if (weight <= capacity.heavy) return "heavy";
  return "overloaded";
}

export function reducedSpeed(base) {
  const speed = Math.max(0, Math.floor(Number(base) || 0));
  if (speed <= 5) return speed;
  return Math.ceil((speed * 2) / 3 / 5) * 5;
}

export function bonusSpells(modifier, spellLevel) {
  if (spellLevel < 1 || modifier < spellLevel) return 0;
  return 1 + Math.floor((modifier - spellLevel) / 4);
}

const DAMAGE_STEPS = ["1", "1d2", "1d3", "1d4", "1d6", "1d8", "1d10", "2d6", "2d8", "3d6", "3d8", "4d6", "4d8", "6d6", "6d8", "8d6", "8d8", "12d6", "12d8", "16d6"];
const DAMAGE_ALIAS = { "1d12": "2d6", "2d4": "1d8", "3d4": "2d6", "2d10": "4d6", "2d12": "4d6", "4d4": "2d8", "5d4": "3d6", "3d10": "6d6", "4d10": "8d6", "3d12": "6d6" };
const DAMAGE_SMALL = { "1d2": "1", "1d3": "1d2", "1d4": "1d3", "1d6": "1d4", "1d8": "1d6", "1d10": "1d8", "1d12": "1d10", "2d4": "1d6", "2d6": "1d10", "2d8": "2d6", "2d10": "2d8" };
const DAMAGE_LARGE = { "1d2": "1d3", "1d3": "1d4", "1d4": "1d6", "1d6": "1d8", "1d8": "2d6", "1d10": "2d8", "1d12": "3d6", "2d4": "2d6", "2d6": "3d6", "2d8": "3d8", "2d10": "4d8" };

export function sizedDamage(dice, size = "medium") {
  const base = String(dice || "").replace(/\s+/g, "").toLowerCase();
  const steps = SIZES[size] ? SIZES[size].step : 0;
  if (!steps || !/^\d*d?\d+$/.test(base)) return base;
  if (steps === -1 && DAMAGE_SMALL[base]) return DAMAGE_SMALL[base];
  if (steps === 1 && DAMAGE_LARGE[base]) return DAMAGE_LARGE[base];
  let index = DAMAGE_STEPS.indexOf(DAMAGE_ALIAS[base] || base);
  if (index < 0) return base;
  index = Math.max(0, Math.min(DAMAGE_STEPS.length - 1, index + (steps > 0 ? steps * (index >= 5 ? 2 : 1) : steps)));
  return DAMAGE_STEPS[index];
}

export function iterativeAttacks(bab) {
  const attacks = [Math.max(0, Math.floor(bab))];
  let next = attacks[0] - 5;
  while (next > 0 && attacks.length < 4) {
    attacks.push(next);
    next -= 5;
  }
  return attacks;
}

export const signed = (value) => (value >= 0 ? "+" : "") + value;

export function slug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export const copy = (value) => JSON.parse(JSON.stringify(value === undefined ? null : value));
