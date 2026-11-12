import { copy, list, record, key } from "./support.mjs";
export default class ReferenceTool {
  validate(ref) {
    record(ref);
    key(ref.id);
    if (
      typeof ref.type !== "string" ||
      !/^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*$/.test(ref.type)
    )
      throw new Error("Reference requires owner.host.member type");
    return { id: ref.id, type: ref.type };
  }
  format(ref) {
    const r = this.validate(ref);
    return r.type + "#" + encodeURIComponent(r.id);
  }
  resolve(ref, records) {
    const r = this.validate(ref);
    const found = list(records).find((v) => v.id === r.id && v.type === r.type);
    return found ? copy(found) : null;
  }
}
