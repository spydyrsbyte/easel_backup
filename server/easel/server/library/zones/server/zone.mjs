import { copy, list, integer, record, key } from "./support.mjs";
export default class ZoneTool {
  validate(zone) {
    record(zone);
    key(zone.id);
    integer(zone.capacity ?? 1000000, 0);
    if (zone.accepts) list(zone.accepts).forEach(key);
    return copy(zone);
  }
  accepts(zone, member, members = []) {
    this.validate(zone);
    record(member);
    list(members);
    return (
      members.length < (zone.capacity ?? 1000000) &&
      (!zone.accepts || zone.accepts.includes(member.kind))
    );
  }
}
