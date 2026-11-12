import { copy, list, record, number, integer, key } from "./support.mjs";

export const SIZE_KEYS = [
  "fine",
  "diminutive",
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
  "colossal"
];

export const AC_ATTACK_MODS = [8, 4, 2, 1, 0, -1, -2, -4, -8];
export const SPECIAL_MODS = [-8, -4, -2, -1, 0, 1, 2, 4, 8];
export const FLY_MODS = [8, 6, 4, 2, 0, -2, -4, -6, -8];
export const STEALTH_MODS = [16, 12, 8, 4, 0, -4, -8, -12, -16];
export const SPACE_FEET = [0.5, 1, 2.5, 5, 5, 10, 15, 20, 30];
export const NATURAL_REACH_TALL_FEET = [0, 0, 0, 5, 5, 10, 15, 20, 30];
export const NATURAL_REACH_LONG_FEET = [0, 0, 0, 5, 5, 5, 10, 15, 20];

const LADDER_D8 = [
  "1d2",
  "1d3",
  "1d4",
  "1d6",
  "1d8",
  "2d6",
  "3d6",
  "4d6",
  "6d6",
  "8d6",
  "12d6"
];

const LADDER_D10 = [
  "1d2",
  "1d3",
  "1d4",
  "1d6",
  "1d8",
  "1d10",
  "2d8",
  "3d8",
  "4d8",
  "6d8",
  "8d8",
  "12d8"
];

const LADDER_D12 = [
  "1d2",
  "1d3",
  "1d4",
  "1d6",
  "1d8",
  "1d12",
  "3d6",
  "4d6",
  "6d6",
  "8d6",
  "12d6"
];

const LADDER_2D4 = [
  "1d2",
  "1d3",
  "1d4",
  "2d4",
  "2d6",
  "3d6",
  "4d6",
  "6d6",
  "8d6",
  "12d6"
];

export default class SizeTool {
  getSizeData(sizeKey) {
    key(sizeKey);
    const idx = SIZE_KEYS.indexOf(sizeKey.toLowerCase());
    if (idx === -1) throw new Error("Unknown size: " + sizeKey);
    return {
      key: SIZE_KEYS[idx],
      index: idx,
      acAttackMod: AC_ATTACK_MODS[idx],
      specialMod: SPECIAL_MODS[idx],
      flyMod: FLY_MODS[idx],
      stealthMod: STEALTH_MODS[idx],
      spaceFeet: SPACE_FEET[idx],
      naturalReachTallFeet: NATURAL_REACH_TALL_FEET[idx],
      naturalReachLongFeet: NATURAL_REACH_LONG_FEET[idx]
    };
  }

  stepWeaponDamageDice(diceFormula, steps) {
    if (typeof diceFormula !== "string")
      throw new TypeError("Expected string dice formula");
    integer(steps, -20, 20);
    if (steps === 0) return diceFormula;

    const normalized = diceFormula.trim().toLowerCase();
    let ladder = LADDER_D8;
    if (normalized === "1d10" || normalized === "2d8" || normalized === "3d8" || normalized === "4d8") {
      ladder = LADDER_D10;
    } else if (normalized === "1d12") {
      ladder = LADDER_D12;
    } else if (normalized === "2d4") {
      ladder = LADDER_2D4;
    }

    const curIndex = ladder.indexOf(normalized);
    if (curIndex !== -1) {
      const targetIndex = Math.max(
        0,
        Math.min(ladder.length - 1, curIndex + steps)
      );
      return ladder[targetIndex];
    }

    const fallbackIndex = LADDER_D8.indexOf(normalized);
    if (fallbackIndex !== -1) {
      const targetIndex = Math.max(
        0,
        Math.min(LADDER_D8.length - 1, fallbackIndex + steps)
      );
      return LADDER_D8[targetIndex];
    }

    return diceFormula;
  }
}
