import { number, record } from "./support.mjs";
export default class ControlTool {
  determine(influence, { minimum = 1, ties = "contested" } = {}) {
    record(influence);
    number(minimum);
    if (!["contested", "first"].includes(ties))
      throw new Error("Unknown tie policy");
    const entries = Object.entries(influence)
      .map(([actor, value]) => ({ actor, value: number(value) }))
      .filter((e) => e.value >= minimum)
      .sort((a, b) => b.value - a.value || a.actor.localeCompare(b.actor));
    const leaders = entries
      .filter((e) => e.value === entries[0]?.value)
      .map((e) => e.actor);
    return {
      controller:
        leaders.length === 1 || ties === "first" ? (leaders[0] ?? null) : null,
      contested: leaders.length > 1,
      leaders,
    };
  }
}
