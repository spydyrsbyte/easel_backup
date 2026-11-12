import { copy, list } from "./support.mjs";
export default class TraitsTool {
  query(traits, { tags = [], all = true } = {}) {
    list(tags);
    return list(traits)
      .filter((t) =>
        all
          ? tags.every((tag) => list(t.tags ?? []).includes(tag))
          : tags.some((tag) => list(t.tags ?? []).includes(tag)),
      )
      .map(copy);
  }
  has(traits, id) {
    return list(traits).some((t) => t.id === id);
  }
}
