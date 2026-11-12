import { copy, list, record, key, unique } from "./support.mjs";
export default class SimultaneousTool {
  create(participants) {
    return Object.fromEntries(
      unique(list(participants).map(key)).map((id) => [id, false]),
    );
  }
  ready(state, actor, value = true) {
    record(state);
    if (
      !Object.prototype.hasOwnProperty.call(state, key(actor)) ||
      typeof value !== "boolean"
    )
      throw new Error("Invalid ready request");
    const next = { ...copy(state), [actor]: value };
    return {
      state: next,
      complete: Object.values(next).every(Boolean),
      waiting: Object.keys(next).filter((id) => !next[id]),
    };
  }
}
