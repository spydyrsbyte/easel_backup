import { Library } from "./library.mjs";
import * as tables from "./tables.mjs";
import { derive, blankCreature, normalize, STEPS } from "./derive.mjs";
import { vancian } from "./magic.mjs";
import * as actions from "./actions.mjs";

const HOOKS = ["sources", "derived", "check", "attack", "damage", "rest", "levelUp", "cast"];

export class Registry {
  constructor(name) {
    this.name = name;
    this.entries = new Map();
  }

  set(id, value) {
    if (typeof id !== "string" || !id) throw new TypeError("A " + this.name + " entry needs an id.");
    this.entries.set(id, value);
    return this;
  }

  get(id) {
    return this.entries.get(id);
  }

  has(id) {
    return this.entries.has(id);
  }

  delete(id) {
    return this.entries.delete(id);
  }

  wrap(id, wrapper) {
    const original = this.entries.get(id);
    if (typeof original !== "function") throw new Error("There is no " + this.name + " function called " + id + " to wrap.");
    this.entries.set(id, (...args) => wrapper(original, ...args));
    return this;
  }

  ids() {
    return [...this.entries.keys()];
  }

  list() {
    return [...this.entries.values()];
  }
}

export default class Engine {
  constructor() {
    this.system = null;
    this.hooks = new Map();
    this.library = new Library();
    this.random = null;
    this.tools = {};
    this.installed = [];
    this.tables = tables;
    this.steps = STEPS.map(([id, run]) => ({ id, run }));
    this.magic = new Registry("magic system").set("vancian", vancian);
    this.registries = new Map();
  }

  tool(name) {
    if (!this.tools[name]) this.tools[name] = Easel.Interfaces.create(name);
    return this.tools[name];
  }

  get stacking() {
    return this.tool("easel.effects.stacking@1");
  }

  get formula() {
    return this.tool("easel.rules.formula@1");
  }

  get dice() {
    return this.tool("easel.dice.formula@1");
  }

  registry(name) {
    if (!this.registries.has(name)) this.registries.set(name, new Registry(name));
    return this.registries.get(name);
  }

  configure(system) {
    if (!system || typeof system.id !== "string") throw new TypeError("A rules system needs an id.");
    this.system = {
      maxLevel: 20,
      classSkillBonus: 0,
      resources: [],
      ...system,
      abilityNames: { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma", ...(system.abilityNames || {}) },
      bonusTypes: { ...tables.BONUS_TYPES, ...(system.bonusTypes || {}) },
      progressions: { bab: { ...tables.PROGRESSIONS.bab, ...((system.progressions || {}).bab || {}) }, save: { ...tables.PROGRESSIONS.save, ...((system.progressions || {}).save || {}) } },
      saves: { ...(system.saves || {}) },
      skills: { ...(system.skills || {}) },
      conditions: { ...(system.conditions || {}) },
      options: { hitPoints: "average", maxFirstHitDie: true, ...(system.options || {}) },
    };
    for (const [id, run, where] of system.steps || []) this.step(id, run, where);
    return this;
  }

  on(name, handler, priority = 0) {
    if (!HOOKS.includes(name)) throw new Error("There is no rules hook called " + name + ". Hooks: " + HOOKS.join(", ") + ".");
    if (typeof handler !== "function") throw new TypeError("A rules hook is a function.");
    const handlers = this.hooks.get(name) || [];
    handlers.push({ handler, priority: Number(priority) || 0 });
    handlers.sort((a, b) => a.priority - b.priority);
    this.hooks.set(name, handlers);
    return this;
  }

  run(name, value, context) {
    for (const { handler } of this.hooks.get(name) || []) {
      const next = handler(value, context, this);
      if (next !== undefined) value = next;
    }
    return value;
  }

  step(id, run, { before, after } = {}) {
    if (typeof run !== "function") throw new TypeError("A calculation step is a function.");
    const existing = this.steps.findIndex((step) => step.id === id);
    if (existing >= 0 && !before && !after) {
      this.steps[existing] = { id, run };
      return this;
    }
    if (existing >= 0) this.steps.splice(existing, 1);
    const anchor = before || after;
    let index = this.steps.length;
    if (anchor) {
      const found = this.steps.findIndex((step) => step.id === anchor);
      if (found < 0) throw new Error("There is no calculation step called " + anchor + ". Steps: " + this.steps.map((step) => step.id).join(", ") + ".");
      index = before ? found : found + 1;
    } else {
      const last = this.steps.findIndex((step) => step.id === "summary");
      if (last >= 0) index = last;
    }
    this.steps.splice(index, 0, { id, run });
    return this;
  }

  wrap(id, wrapper) {
    const step = this.steps.find((entry) => entry.id === id);
    if (!step) throw new Error("There is no calculation step called " + id + ".");
    const original = step.run;
    step.run = (derived, ctx) => wrapper(derived, ctx, () => original(derived, ctx));
    return this;
  }

  unstep(id) {
    this.steps = this.steps.filter((step) => step.id !== id);
    return this;
  }

  install(extra = {}) {
    if (!this.system) throw new Error("Configure the rules system before installing content and extensions.");
    for (const entry of Easel.Interfaces.list("easel.wotcogl35.content@1")) {
      const provider = new entry.obj();
      const packs = provider.packs ? provider.packs(this.system.id, this) : [];
      for (const pack of Array.isArray(packs) ? packs : []) {
        if (pack.system && pack.system !== this.system.id) continue;
        this.library.addPack(pack);
      }
    }
    const api = {
      ...extra,
      system: this.system,
      options: this.system.options,
      tables,
      engine: this,
      library: this.library,
      on: (name, handler, priority) => this.on(name, handler, priority),
      step: (id, run, where) => this.step(id, run, where),
      wrap: (id, wrapper) => this.wrap(id, wrapper),
      unstep: (id) => this.unstep(id),
      steps: () => this.steps.map((step) => step.id),
      magic: this.magic,
      registry: (name) => this.registry(name),
      resource: (definition) => {
        this.system.resources = [...this.system.resources.filter((entry) => entry.id !== definition.id), definition];
      },
      content: { add: (pack) => this.library.addPack(pack), put: (entry) => this.library.put(entry, { id: "extension", source: "Extension" }), remove: (id) => this.library.remove(id), get: (id) => this.library.get(id) },
    };
    for (const entry of Easel.Interfaces.list("easel.wotcogl35.extension@1")) {
      const extension = new entry.obj();
      if (extension.systems && !extension.systems.includes(this.system.id)) continue;
      if (typeof extension.install === "function") extension.install(api);
      if (entry.host !== "easel.wotcogl35") this.installed.push({ host: entry.host, name: extension.name || entry.host });
    }
    return this;
  }

  lookup(id) {
    return this.library.peek(id);
  }

  blank(kind) {
    return blankCreature(kind);
  }

  normalize(doc) {
    return normalize(doc);
  }

  derive(doc) {
    return derive(this, doc);
  }

  d20() {
    return (this.random || Easel.Random).integer(1, 21);
  }

  roll(formula) {
    return this.dice.roll(String(formula), this.random || undefined);
  }

  evaluate(derived, value, vars) {
    return actions.evaluate(this, derived, value, vars);
  }

  check(options) {
    return actions.check(this, options);
  }

  save(options) {
    return actions.save(this, options);
  }

  attack(definition, options) {
    return actions.attack(this, definition, options);
  }

  rollDamage(parts, multiplier) {
    return actions.rollDamage(this, parts, multiplier);
  }

  applyDamage(doc, derived, options) {
    return actions.applyDamage(this, doc, derived, options);
  }

  rest(doc, derived, options) {
    return actions.rest(this, doc, derived, options);
  }

  addLevel(doc, entry, options) {
    return actions.addLevel(this, doc, entry, options);
  }

  removeLevel(doc, classId) {
    return actions.removeLevel(this, doc, classId);
  }

  castSpell(doc, derived, options) {
    return actions.castSpell(this, doc, derived, options);
  }

  spend(doc, derived, costs, vars) {
    return actions.spend(this, doc, derived, costs, vars);
  }

  recover(doc, derived, event) {
    return actions.recover(this, doc, derived, event);
  }

  tick(doc, derived) {
    return actions.tick(this, doc, derived);
  }
}
