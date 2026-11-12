import { copy, list, number } from "./support.mjs";
export default class ModifierTool {
  apply(base, modifiers) {
    number(base);
    let value = base;
    const applied = [];
    const sorted = list(modifiers)
      .map((m, index) => ({
        ...copy(m),
        index,
        priority: number(m.priority ?? 0),
      }))
      .sort((a, b) => a.priority - b.priority || a.index - b.index);
    for (const m of sorted) {
      if (m.enabled === false) continue;
      const before = value;
      number(m.value);
      if (m.op === "add") value += m.value;
      else if (m.op === "multiply") value *= m.value;
      else if (m.op === "override") value = m.value;
      else throw new Error("Unknown modifier");
      number(value);
      applied.push({ id: m.id ?? String(m.index), before, after: value });
    }
    return { value, applied };
  }
}
