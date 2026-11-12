import { copy, list, integer, key, unique } from "./support.mjs";
export default class TransferTool {
  move(source, destination, id, index = destination.length) {
    const from = copy(unique(list(source).map(key))),
      to = copy(unique(list(destination).map(key)));
    key(id);
    integer(index, 0, to.length);
    if (from.some((member) => to.includes(member)))
      throw new Error("Containers have contradictory membership");
    const at = from.indexOf(id);
    if (at < 0) throw new Error("Unknown source member");
    if (to.includes(id)) throw new Error("Member already at destination");
    from.splice(at, 1);
    to.splice(index, 0, id);
    return { source: from, destination: to };
  }
}
