function creatureStats(card, presets = []) {
  const type =
    card.transformed && card.backType ? card.backType : card.type || "";
  if (!card.faceup || !/\bCreature\b/i.test(type)) return null;
  const adjustment = Object.entries(card.counters || {}).reduce(
    (total, [name, count]) => {
      const counter =
        card.counterKinds?.[name] ||
        presets.find((preset) => preset.name === name);
      if (counter?.kind === "stat") {
        total.power += counter.power * count;
        total.toughness += counter.toughness * count;
      }
      return total;
    },
    { power: 0, toughness: 0 },
  );
  const value = (base, delta) => {
    if (base == null || base === "") return "?";
    return Number.isFinite(Number(base))
      ? String(Number(base) + delta)
      : String(base) + (delta ? (delta > 0 ? "+" : "") + delta : "");
  };
  const power = value(
    card.transformed ? card.backPower || card.power : card.power,
    adjustment.power,
  );
  const toughness = value(
    card.transformed ? card.backToughness || card.toughness : card.toughness,
    adjustment.toughness,
  );
  return { power, toughness, label: `${power}/${toughness}` };
}
export { creatureStats };
