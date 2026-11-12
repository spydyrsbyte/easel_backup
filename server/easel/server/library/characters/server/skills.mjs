import { copy, list, number, record, key } from "./support.mjs";
export default class SkillsTool {
  evaluate(skill, attributes = {}) {
    record(skill);
    record(attributes);
    const rank = number(skill.rank ?? 0),
      base = skill.attribute ? number(attributes[skill.attribute] ?? 0) : 0,
      modifiers = list(skill.modifiers ?? []).map(number);
    return {
      id: key(skill.id),
      rank,
      base,
      modifiers: copy(modifiers),
      total: rank + base + modifiers.reduce((a, b) => a + b, 0),
    };
  }
}
