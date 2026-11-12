import { list, integer } from "./support.mjs";
import { route } from "./network.mjs";
export default class PathTool {
  find(nodes, edges, start, end, { blocked = [], maxNodes = 10000 } = {}) {
    integer(maxNodes, 1, 100000);
    if (list(nodes).length > maxNodes)
      throw new RangeError("Path search limit exceeded");
    list(blocked);
    const available = nodes.filter((n) => !blocked.includes(n.id ?? n));
    if (
      !available.some((n) => (n.id ?? n) === start) ||
      !available.some((n) => (n.id ?? n) === end)
    )
      return null;
    const ids = new Set(available.map((n) => n.id ?? n));
    return route(
      available,
      list(edges).filter((e) => ids.has(e.from) && ids.has(e.to)),
      start,
      end,
    );
  }
}
