import { copy, list, integer, key, unique } from "./support.mjs";
export default class ChoiceTool {
  validate(options, selected, { min = 0, max = 1 } = {}) {
    const ids = unique(
      list(options).map((v) => (typeof v === "object" ? key(v.id) : key(v))),
    );
    unique(list(selected).map(key));
    integer(min, 0, ids.length);
    integer(max, min, ids.length);
    if (
      selected.length < min ||
      selected.length > max ||
      selected.some((id) => !ids.includes(id))
    )
      throw new Error("Invalid choice");
    return copy(selected);
  }
}
