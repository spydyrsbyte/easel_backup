import { copy, list } from "./support.mjs";
export default class JournalTool {
  search(entries, { query = "", tags = [], author = null } = {}) {
    if (typeof query !== "string") throw new TypeError("Text query required");
    list(tags);
    const needle = query.toLowerCase();
    return list(entries)
      .filter(
        (e) =>
          (!author || e.author === author) &&
          tags.every((t) => (e.tags ?? []).includes(t)) &&
          [e.title, e.text].some((v) =>
            String(v ?? "")
              .toLowerCase()
              .includes(needle),
          ),
      )
      .map((e) => ({
        id: e.id,
        title: String(e.title ?? ""),
        author: e.author ?? null,
        time: e.time ?? null,
        tags: copy(e.tags ?? []),
      }));
  }
}
