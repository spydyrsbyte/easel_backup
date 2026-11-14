import { copy, slug } from "./tables.mjs";

export class Library {
  constructor() {
    this.entries = new Map();
    this.packs = [];
    this.kinds = new Map();
  }

  addPack(pack) {
    if (!pack || typeof pack !== "object") throw new TypeError("A content pack is an object.");
    const id = String(pack.id || "");
    if (!/^[a-z0-9][a-z0-9.-]{0,60}$/.test(id)) throw new TypeError("A content pack needs a short lowercase id.");
    const info = { id, name: String(pack.name || id), source: String(pack.source || pack.name || id), count: 0 };
    for (const entry of Array.isArray(pack.entries) ? pack.entries : []) {
      this.put(entry, info);
      info.count += 1;
    }
    this.packs = [...this.packs.filter((existing) => existing.id !== id), info];
    return info;
  }

  put(entry, pack = { id: "custom", source: "Custom" }) {
    if (!entry || typeof entry !== "object") throw new TypeError("A library entry is an object.");
    const kind = String(entry.kind || "");
    const name = String(entry.name || "").trim();
    if (!/^[a-z][a-zA-Z]{1,20}$/.test(kind)) throw new TypeError("A library entry needs a kind.");
    if (!name) throw new TypeError("A library entry needs a name.");
    const id = String(entry.id || kind + ":" + slug(name));
    if (!id.startsWith(kind + ":")) throw new TypeError("Entry id " + id + " must start with its kind.");
    const stored = { ...copy(entry), id, kind, name, pack: pack.id, source: String(entry.source || pack.source || "") };
    const previous = this.entries.get(id);
    if (previous) this.kinds.get(previous.kind).delete(id);
    this.entries.set(id, stored);
    if (!this.kinds.has(kind)) this.kinds.set(kind, new Set());
    this.kinds.get(kind).add(id);
    return stored;
  }

  remove(id) {
    const entry = this.entries.get(id);
    if (!entry) return false;
    this.entries.delete(id);
    this.kinds.get(entry.kind).delete(id);
    return true;
  }

  has(id) {
    return this.entries.has(id);
  }

  get(id) {
    const entry = this.entries.get(id);
    return entry ? copy(entry) : null;
  }

  peek(id) {
    return this.entries.get(id) || null;
  }

  require(id, kind) {
    const entry = this.get(id);
    if (!entry || (kind && entry.kind !== kind)) throw new Error("The library has no " + (kind || "entry") + " called " + id + ".");
    return entry;
  }

  list(kind) {
    return [...(this.kinds.get(kind) || [])].map((id) => this.entries.get(id)).sort((a, b) => a.name.localeCompare(b.name));
  }

  find(kind, name) {
    const wanted = slug(name);
    if (!wanted) return null;
    const direct = this.entries.get(kind + ":" + wanted);
    if (direct) return copy(direct);
    for (const id of this.kinds.get(kind) || []) {
      const entry = this.entries.get(id);
      if (slug(entry.name) === wanted) return copy(entry);
    }
    return null;
  }

  count(kind) {
    return (this.kinds.get(kind) || new Set()).size;
  }
}
