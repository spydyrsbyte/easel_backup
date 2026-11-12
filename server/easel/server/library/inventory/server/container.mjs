import { copy, list, record, key, unique } from "./support.mjs";
export default class ContainerTool {
  validate(containers) {
    record(containers);
    const owned = new Set();
    for (const [id, members] of Object.entries(containers)) {
      key(id);
      unique(list(members).map(key));
      for (const member of members) {
        if (owned.has(member)) throw new Error("Multiple membership owners");
        owned.add(member);
      }
    }
    const visit = (id, trail) => {
      if (trail.has(id)) throw new Error("Container cycle");
      for (const member of containers[id] ?? [])
        if (Object.prototype.hasOwnProperty.call(containers, member))
          visit(member, new Set([...trail, id]));
    };
    for (const id of Object.keys(containers)) visit(id, new Set());
    return copy(containers);
  }
  contents(containers, id, { recursive = false } = {}) {
    this.validate(containers);
    if (!Object.prototype.hasOwnProperty.call(containers, key(id)))
      throw new Error("Unknown container");
    const walk = (id) =>
      (containers[id] ?? []).flatMap((member) => [
        member,
        ...(recursive && containers[member] ? walk(member) : []),
      ]);
    return walk(id);
  }
}
