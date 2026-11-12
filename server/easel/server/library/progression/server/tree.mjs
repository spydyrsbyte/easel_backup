import { copy, list, key, unique } from "./support.mjs";
export default class TreeTool {
  available(nodes, selected = []) {
    unique(list(nodes).map((n) => key(n.id)));
    unique(list(selected).map(key));
    const ids = new Set(nodes.map((n) => n.id));
    if (selected.some((id) => !ids.has(id)))
      throw new Error("Unknown selected prerequisite");
    for (const n of nodes)
      if (list(n.requires ?? []).some((id) => !ids.has(id)))
        throw new Error("Unknown prerequisite");
    const visit = (id, trail) => {
      if (trail.has(id)) throw new Error("Prerequisite cycle");
      for (const p of nodes.find((n) => n.id === id).requires ?? [])
        visit(p, new Set([...trail, id]));
    };
    for (const n of nodes) visit(n.id, new Set());
    return nodes
      .filter(
        (n) =>
          !selected.includes(n.id) &&
          (n.requires ?? []).every((id) => selected.includes(id)),
      )
      .map(copy);
  }
}
