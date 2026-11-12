import { copy, list, integer, key, unique } from "./support.mjs";
export default class OrderedTool {
  create(members = []) {
    return copy(unique(list(members).map(key)));
  }
  insert(members, id, index = members.length) {
    const result = this.create(members);
    key(id);
    integer(index, 0, result.length);
    if (result.includes(id)) throw new Error("Duplicate member");
    result.splice(index, 0, id);
    return result;
  }
  remove(members, id) {
    const result = this.create(members),
      index = result.indexOf(key(id));
    if (index < 0) throw new Error("Unknown member");
    result.splice(index, 1);
    return result;
  }
  move(members, id, index) {
    return this.insert(this.remove(members, id), id, index);
  }
  query(members, offset = 0, count = members.length) {
    const result = this.create(members);
    integer(offset, 0, result.length);
    integer(count, 0, 1000000);
    return result.slice(offset, offset + count);
  }
}
