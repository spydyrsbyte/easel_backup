import { copy, list, record, key, unique } from "./support.mjs";
export default class DisclosureTool {
  reveal(state, id, audience) {
    record(state);
    key(id);
    unique(list(audience).map(key));
    return { ...copy(state), [id]: copy(audience) };
  }
  conceal(state, id) {
    const result = copy(record(state));
    delete result[key(id)];
    return result;
  }
  allows(state, id, viewer) {
    const audience = record(state)[key(id)] ?? [];
    return list(audience).includes("*") || audience.includes(viewer);
  }
}
