import { copy, list, number, key, unique } from "./support.mjs";
export default class InitiativeTool {
  order(participants, { descending = true } = {}) {
    unique(list(participants).map((p) => key(p.id)));
    return participants
      .map((p, index) => ({
        ...copy(p),
        index,
        initiative: number(p.initiative),
      }))
      .sort(
        (a, b) =>
          (descending
            ? b.initiative - a.initiative
            : a.initiative - b.initiative) || a.index - b.index,
      )
      .map(({ index, ...p }) => p);
  }
}
