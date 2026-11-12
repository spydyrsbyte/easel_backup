import { list, unique, key, number } from "./support.mjs";
export function graph(nodes, edges) {
  list(nodes);
  unique(nodes.map((n) => (typeof n === "object" ? key(n.id) : key(n))));
  const ids = new Set(nodes.map((n) => (typeof n === "object" ? n.id : n)));
  for (const e of list(edges)) {
    if (!ids.has(e.from) || !ids.has(e.to))
      throw new Error("Unknown graph endpoint");
    number(e.cost ?? 1);
    if ((e.cost ?? 1) < 0) throw new Error("Negative edge cost");
  }
  return ids;
}
export function route(nodes, edges, start, end) {
  const ids = graph(nodes, edges);
  if (!ids.has(start) || !ids.has(end))
    throw new Error("Unknown route endpoint");
  const distances = new Map([[start, 0]]),
    previous = new Map(),
    open = new Set(ids);
  while (open.size) {
    let at = null;
    for (const id of open)
      if (
        distances.has(id) &&
        (at === null || distances.get(id) < distances.get(at))
      )
        at = id;
    if (at === null) break;
    open.delete(at);
    if (at === end) break;
    for (const e of edges) {
      const next =
        e.from === at ? e.to : !e.directed && e.to === at ? e.from : null;
      if (next === null || !open.has(next)) continue;
      const cost = distances.get(at) + (e.cost ?? 1);
      if (!distances.has(next) || cost < distances.get(next)) {
        distances.set(next, cost);
        previous.set(next, at);
      }
    }
  }
  if (!distances.has(end)) return null;
  const result = [end];
  while (result[0] !== start) result.unshift(previous.get(result[0]));
  return { nodes: result, cost: distances.get(end) };
}
