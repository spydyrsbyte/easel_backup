import { number } from "./support.mjs";
export default class AttackTool {
  resolve(attack, defense, { tiesHit = true } = {}) {
    number(attack);
    number(defense);
    const margin = attack - defense;
    return { attack, defense, margin, hit: tiesHit ? margin >= 0 : margin > 0 };
  }
}
