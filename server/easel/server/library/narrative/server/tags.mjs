import { copy, list, key, unique } from "./support.mjs";
export default class TagsTool {
  index(entries) {
    const result = Object.create(null);
    for (const e of list(entries)) {
      key(e.id);
      for (const tag of unique(list(e.tags ?? []).map(key))) {
        result[tag] ??= [];
        result[tag].push(e.id);
      }
    }
    return copy(result);
  }
  filter(entries, tags, { all = true } = {}) {
    list(tags);
    return list(entries)
      .filter((e) =>
        all
          ? tags.every((t) => (e.tags ?? []).includes(t))
          : tags.some((t) => (e.tags ?? []).includes(t)),
      )
      .map(copy);
  }
}
