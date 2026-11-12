import { copy, list, record, number, integer } from "./support.mjs";

export default class HealthTool {
  resolveHealthState({
    hp,
    maxHp,
    tempHp = 0,
    nonlethal = 0,
    deathThreshold = -10,
    disabledAtZero = true,
    staggeredOnNonlethal = true
  } = {}) {
    number(hp);
    number(maxHp);
    number(tempHp);
    number(nonlethal);
    number(deathThreshold);

    let status = "healthy";
    if (hp <= deathThreshold) {
      status = "dead";
    } else if (hp < 0) {
      status = "dying";
    } else if (hp === 0) {
      status = disabledAtZero ? "disabled" : "staggered";
    } else if (staggeredOnNonlethal && nonlethal >= hp && hp > 0) {
      status = "staggered";
    }

    const effectiveHp = hp + tempHp - nonlethal;

    return {
      hp,
      maxHp,
      tempHp,
      nonlethal,
      effectiveHp,
      status
    };
  }

  applyDamageToPools({
    hp,
    maxHp,
    tempHp = 0,
    nonlethal = 0,
    lethalDamage = 0,
    nonlethalDamage = 0,
    healing = 0,
    tempHealing = 0
  } = {}) {
    number(hp);
    number(maxHp);
    number(tempHp);
    number(nonlethal);
    integer(lethalDamage, 0);
    integer(nonlethalDamage, 0);
    integer(healing, 0);
    integer(tempHealing, 0);

    let curTemp = Math.max(tempHp, tempHealing);
    let curHp = hp;
    let curNonlethal = nonlethal;

    if (lethalDamage > 0) {
      const absorbed = Math.min(curTemp, lethalDamage);
      curTemp -= absorbed;
      const remaining = lethalDamage - absorbed;
      curHp -= remaining;
    }

    if (nonlethalDamage > 0) {
      curNonlethal += nonlethalDamage;
    }

    if (healing > 0) {
      curHp = Math.min(maxHp, curHp + healing);
      curNonlethal = Math.max(0, curNonlethal - healing);
    }

    return {
      hp: curHp,
      maxHp,
      tempHp: curTemp,
      nonlethal: curNonlethal
    };
  }

  calculateHitDice({
    hitDice = [],
    conModifier = 0,
    toughness = 0,
    favoredClassHp = 0
  } = {}) {
    list(hitDice);
    number(conModifier);
    integer(toughness, 0);
    integer(favoredClassHp, 0);

    let totalMax = 0;
    let totalAverage = 0;
    let totalDice = 0;

    for (const hd of hitDice) {
      record(hd);
      const count = integer(hd.count ?? 1, 1, 100);
      const die = integer(hd.die ?? 8, 1, 100);
      const bonus = number(hd.bonus ?? 0);
      totalDice += count;
      totalMax += count * die + count * (conModifier + bonus);
      totalAverage += count * (die / 2 + 0.5) + count * (conModifier + bonus);
    }

    totalMax += toughness + favoredClassHp;
    totalAverage += toughness + favoredClassHp;

    return {
      totalDice,
      maxHp: Math.max(1, Math.floor(totalMax)),
      averageHp: Math.max(1, Math.floor(totalAverage))
    };
  }
}
