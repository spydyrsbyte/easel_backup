import { list, key } from "./support.mjs";
export default class SetTool {
  create(members = []) {
    return [...new Set(list(members).map(key))];
  }
  add(members, id) {
    return this.create([...list(members), key(id)]);
  }
  remove(members, id) {
    key(id);
    return this.create(members).filter((v) => v !== id);
  }
  has(members, id) {
    return this.create(members).includes(key(id));
  }
}
