export class ItemPhysical {
  get isBroken() {
    if (this.broken) return true;
    const maxHp = Number(this.maxHp ?? 0);
    const hp = Number(this.hp ?? maxHp);
    return maxHp > 0 && hp <= Math.floor(maxHp / 2);
  }

  getEffectiveWeight(containedItems = []) {
    const qty = Number(this.quantity ?? 1);
    const selfWeight = Number(this.weightLbs ?? 0) * qty;

    if (this.constantWeightLbs !== null && this.constantWeightLbs !== undefined) {
      return Number(this.constantWeightLbs);
    }

    if (Array.isArray(containedItems) && containedItems.length > 0) {
      const contentsWeight = containedItems.reduce(
        (sum, it) => sum + (Number(it.weightLbs ?? 0) * Number(it.quantity ?? 1)),
        0
      );
      const mult = Number(this.weightReductionMultiplier ?? 1);
      return selfWeight + (contentsWeight * mult);
    }

    return selfWeight;
  }
}

export class WeaponPhysical extends ItemPhysical {
  get attackPenalty() {
    return this.isBroken ? -2 : 0;
  }

  get damagePenalty() {
    return this.isBroken ? -2 : 0;
  }

  get effectiveCritRange() {
    return this.isBroken ? 20 : Number(this.critRange ?? 20);
  }

  get effectiveCritMultiplier() {
    return this.isBroken ? 2 : Number(this.critMultiplier ?? 2);
  }
}

export class ArmorPhysical extends ItemPhysical {
  get effectiveArmorBonus() {
    const raw = Number(this.armorBonus ?? 0);
    return this.isBroken ? Math.floor(raw / 2) : raw;
  }

  get effectiveShieldBonus() {
    const raw = Number(this.shieldBonus ?? 0);
    return this.isBroken ? Math.floor(raw / 2) : raw;
  }

  get effectiveACP() {
    const raw = Number(this.armorCheckPenalty ?? this.acp ?? 0);
    return this.isBroken ? raw * 2 : raw;
  }
}
