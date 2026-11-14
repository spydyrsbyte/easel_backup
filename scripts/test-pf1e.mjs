import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const load = (file) => import(pathToFileURL(path.resolve(file)).href);
const library = "server/easel/server/library/";
const tools = {
  "easel.effects.stacking@1": (await load(library + "effects/server/stacking.mjs")).default,
  "easel.rules.formula@1": (await load(library + "rules/server/formula.mjs")).default,
  "easel.dice.formula@1": (await load(library + "dice/server/formula.mjs")).default,
};
const extensions = { "easel.wotcogl35.extension@1": [], "easel.wotcogl35.content@1": [] };
let queue = [];
globalThis.Easel = {
  Interfaces: {
    create: (name) => new tools[name](),
    list: (name) => (extensions[name] || []).map((obj) => ({ name, version: 1, host: "test", obj })),
  },
  Random: { integer: (low, high) => (queue.length ? queue.shift() : low + Math.floor(Math.random() * (high - low))) },
};

const Engine = (await load("server/easel/modules/wotcogl35/server/engine.mjs")).default;
const { pathfinder } = await load("server/easel/applications/pf1e/server/system.mjs");
const { corePacks } = await load("server/easel/applications/pf1e/server/content/index.mjs");
const { parseStatblock } = await load("server/easel/applications/pf1e/server/statblock.mjs");

function engine() {
  const made = new Engine().configure(pathfinder());
  for (const pack of corePacks()) made.library.addPack(pack);
  made.registry("rolls").set("attack", () => ({ title: "attack" }));
  return made.install({ rolls: made.registry("rolls"), actions: made.registry("actions"), kinds: made.registry("kinds"), sections: made.registry("sections"), cardActions: made.registry("cardActions"), sheets, edit: () => {} });
}

const sheets = await load("server/easel/applications/pf1e/server/actors.mjs");

function item(rules, name, extra = {}) {
  const entry = rules.library.find("item", name);
  assert.ok(entry, "the library has " + name);
  return { uid: name.toLowerCase().replace(/[^a-z]+/g, "-"), entryId: entry.id, quantity: 1, equipped: true, ...entry, ...extra };
}

function fighter(rules, levels = 5) {
  let doc = rules.blank("character");
  doc.abilities.str.base = 16;
  doc.abilities.dex.base = 14;
  doc.abilities.con.base = 14;
  doc.abilities.int.base = 10;
  doc.abilities.wis.base = 12;
  doc.abilities.cha.base = 8;
  const human = rules.library.require("race:human");
  doc.race = { ...human, changes: [...human.changes, { target: "str", type: "racial", value: 2 }] };
  for (let level = 0; level < levels; level++) doc = rules.addLevel(doc, rules.library.require("class:fighter")).doc;
  doc.items = [item(rules, "Longsword"), item(rules, "Chainmail"), item(rules, "Heavy steel shield")];
  doc.skills = { clm: { ranks: 5 }, per: { ranks: 5 } };
  return doc;
}

test("the core packs load, with unique ids and every referenced effect present", () => {
  const rules = engine();
  for (const [kind, least] of [["class", 11], ["race", 7], ["feat", 100], ["item", 150], ["spell", 190], ["buff", 35], ["monster", 30]]) assert.ok(rules.library.count(kind) >= least, kind + " count " + rules.library.count(kind));
  for (const spell of rules.library.list("spell")) if (spell.buff) assert.ok(rules.library.has(spell.buff), spell.name + " names the effect " + spell.buff);
  const total = ["class", "race", "feat", "item", "spell", "buff", "monster"].reduce((sum, kind) => sum + rules.library.count(kind), 0);
  assert.equal(total, corePacks()[0].entries.length, "no two core entries share an id");
});

test("a 5th-level human fighter has the statistics the rules give", () => {
  const rules = engine();
  const sheet = rules.derive(fighter(rules));
  assert.equal(sheet.level, 5);
  assert.equal(sheet.abilities.str.score, 18);
  assert.equal(sheet.abilities.str.mod, 4);
  assert.equal(sheet.bab, 5);
  assert.equal(sheet.hp.max, 10 + 4 * 6 + 5 * 2);
  assert.deepEqual([sheet.saves.fort.total, sheet.saves.ref.total, sheet.saves.will.total], [4 + 2, 1 + 2, 1 + 1]);
  assert.equal(sheet.maxDex, 3, "armor training raises chainmail's limit from +2 to +3");
  assert.equal(sheet.ac.total, 10 + 6 + 2 + 2);
  assert.equal(sheet.ac.touch, 12);
  assert.equal(sheet.ac.flat, 18);
  assert.equal(sheet.acp, -6, "chainmail -5 improved by armor training, plus the shield's -2");
  assert.equal(sheet.speed.land, 30, "armor training removes the medium armor speed penalty");
  const sword = sheet.attacks.find((attack) => attack.name === "Longsword");
  assert.deepEqual(sword.bonuses, [9]);
  assert.equal(sword.damage[0].formula, "1d8+4");
  assert.deepEqual(sword.crit, { range: 19, mult: 2 });
  assert.equal(sheet.maneuvers.cmb, 9);
  assert.equal(sheet.maneuvers.cmd, 10 + 5 + 4 + 2);
  assert.equal(sheet.skills.clm.total, 4 + 5 + 3 - 6);
  assert.equal(sheet.skills.per.total, 1 + 5, "Perception is not a fighter class skill");
  assert.equal(sheet.skillPoints.total, 5 * 2 + 5, "2 per level, plus the human's extra rank each level");
  assert.equal(sheet.feats.allowed, 3 + 1 + 3, "three by level, one human, three fighter bonus feats");
});

test("typed bonuses do not stack, dodge and untyped ones do, and toggles apply", () => {
  const rules = engine();
  const doc = fighter(rules, 6);
  const feat = (name) => ({ uid: name, ...rules.library.find("feat", name) });
  doc.feats = [feat("Dodge"), feat("Power Attack"), feat("Iron Will"), feat("Toughness")];
  doc.items.push(item(rules, "Ring of protection +1"), item(rules, "Ring of protection +2"), item(rules, "Cloak of resistance +1"));
  doc.buffs = [{ uid: "a", entryId: "buff:haste", active: true, ...rules.library.require("buff:haste") }, { uid: "b", entryId: "buff:shield-of-faith", active: true, level: 6, ...rules.library.require("buff:shield-of-faith") }];
  let sheet = rules.derive(doc);
  assert.equal(sheet.ac.total, 10 + 6 + 2 + 2 + 3 + 1 + 1, "deflection takes the best (+3 shield of faith), dodge bonuses add");
  assert.equal(sheet.ac.flat, sheet.ac.total - 2 - 2, "flat-footed loses Dexterity and both dodge bonuses");
  assert.equal(sheet.saves.will.total, 2 + 1 + 2 + 1);
  assert.equal(sheet.hp.max, 10 + 5 * 6 + 6 * 2 + 6);
  assert.deepEqual(sheet.attacks.find((attack) => attack.name === "Longsword").bonuses, [11, 6]);
  doc.toggles = { powerAttack: true };
  sheet = rules.derive(doc);
  const sword = sheet.attacks.find((attack) => attack.name === "Longsword");
  assert.deepEqual(sword.bonuses, [9, 4]);
  assert.equal(sword.damage[0].formula, "1d8+8");
  assert.ok(sheet.toggles.some((toggle) => toggle.id === "powerAttack" && toggle.on));
  doc.conditions = ["shaken", "sickened", "blinded"];
  sheet = rules.derive(doc);
  assert.deepEqual(sheet.attacks.find((attack) => attack.name === "Longsword").bonuses, [5, 0], "shaken and sickened penalties add up");
  assert.equal(sheet.ac.total, 10 + 6 + 2 + 3 - 2, "blinded loses Dexterity and dodge, and takes -2");
});

test("casters get the right slots, save DCs and caster level", () => {
  const rules = engine();
  let wizard = rules.blank();
  wizard.abilities.int.base = 18;
  for (let level = 0; level < 5; level++) wizard = rules.addLevel(wizard, rules.library.require("class:wizard")).doc;
  let caster = rules.derive(wizard).casting[0];
  assert.equal(caster.casterLevel, 5);
  assert.deepEqual(caster.levels.map((level) => level.prepares), [4, 4, 3, 2]);
  assert.equal(caster.levels[3].dc, 10 + 3 + 4);
  assert.equal(caster.concentration, 9);
  let cleric = rules.blank();
  cleric.abilities.wis.base = 16;
  for (let level = 0; level < 3; level++) cleric = rules.addLevel(cleric, rules.library.require("class:cleric")).doc;
  assert.deepEqual(rules.derive(cleric).casting[0].levels.map((level) => level.prepares), [4, 2 + 1 + 1, 1 + 1 + 1], "bonus spells for Wisdom, plus a domain slot at each level");
  let paladin = rules.blank();
  paladin.abilities.cha.base = 14;
  for (let level = 0; level < 4; level++) paladin = rules.addLevel(paladin, rules.library.require("class:paladin")).doc;
  caster = rules.derive(paladin).casting[0];
  assert.equal(caster.casterLevel, 1);
  assert.deepEqual(caster.levels.map((level) => [level.level, level.slots]), [[1, 1]], "a 4th-level paladin casts only a bonus spell");
  assert.equal(rules.derive(paladin).saves.will.total, 4 + 0 + 2, "divine grace adds Charisma");
  let sorcerer = rules.blank();
  sorcerer.abilities.cha.base = 16;
  for (let level = 0; level < 4; level++) sorcerer = rules.addLevel(sorcerer, rules.library.require("class:sorcerer")).doc;
  caster = rules.derive(sorcerer).casting[0];
  assert.deepEqual(caster.levels.map((level) => [level.slots, level.known]), [[null, 6], [7, 3], [4, 1]]);
  sorcerer = rules.castSpell(sorcerer, rules.derive(sorcerer), { key: "sorcerer", level: 2 });
  assert.equal(rules.derive(sorcerer).casting[0].levels[2].used, 1);
});

test("class features switch on at their levels", () => {
  const rules = engine();
  let monk = rules.blank();
  monk.abilities.wis.base = 16;
  monk.abilities.dex.base = 14;
  for (let level = 0; level < 4; level++) monk = rules.addLevel(monk, rules.library.require("class:monk")).doc;
  let sheet = rules.derive(monk);
  assert.equal(sheet.ac.total, 10 + 2 + 3 + 1, "Wisdom and a quarter of monk level");
  assert.equal(sheet.speed.land, 40);
  assert.equal(sheet.attacks.find((attack) => attack.id === "unarmed").damage[0].formula, "1d8");
  assert.equal(sheet.features.find((feature) => feature.name === "Ki Pool").uses.max, 2 + 3);
  let rogue = rules.blank();
  for (let level = 0; level < 5; level++) rogue = rules.addLevel(rogue, rules.library.require("class:rogue")).doc;
  rogue.items = [item(rules, "Rapier")];
  rogue.toggles = { sneak: true };
  sheet = rules.derive(rogue);
  assert.deepEqual(sheet.attacks.find((attack) => attack.name === "Rapier").damage.map((part) => part.formula), ["1d6", "3d6"]);
  let barbarian = rules.blank();
  barbarian.abilities.str.base = 16;
  barbarian.abilities.con.base = 14;
  for (let level = 0; level < 7; level++) barbarian = rules.addLevel(barbarian, rules.library.require("class:barbarian")).doc;
  const calm = rules.derive(barbarian);
  barbarian.toggles = { rage: true };
  sheet = rules.derive(barbarian);
  assert.equal(sheet.abilities.str.score, 20);
  assert.equal(sheet.hp.max, calm.hp.max + 2 * 7);
  assert.equal(sheet.ac.total, calm.ac.total - 2);
  assert.deepEqual(sheet.defenses.dr, [{ amount: 1, bypass: "—" }]);
});

test("encumbrance, size and armor proficiency change the numbers", () => {
  const rules = engine();
  let wizard = rules.blank();
  wizard.abilities.str.base = 8;
  wizard = rules.addLevel(wizard, rules.library.require("class:wizard")).doc;
  wizard.items = [item(rules, "Full plate"), item(rules, "Longsword")];
  let sheet = rules.derive(wizard);
  assert.equal(sheet.encumbrance.load, "heavy", "54 lb. against a 53 lb. medium limit at Strength 8");
  assert.equal(sheet.speed.land, 20);
  assert.equal(sheet.spellFailure, 35);
  assert.deepEqual(sheet.attacks.find((attack) => attack.name === "Longsword").bonuses, [0 - 1 - 4 - 6], "not proficient with the sword or the armor");
  let halfling = rules.blank();
  halfling.size = "small";
  halfling.race = rules.library.require("race:halfling");
  halfling = rules.addLevel(halfling, rules.library.require("class:rogue")).doc;
  halfling.items = [item(rules, "Short sword")];
  sheet = rules.derive(halfling);
  assert.equal(sheet.ac.total, 10 + 1 + 1);
  assert.equal(sheet.attacks[0].damage[0].formula, "1d4-1");
  assert.equal(sheet.skills.ste.total, 1 + 4);
  assert.equal(sheet.saves.ref.total, 2 + 1 + 1);
});

test("stat blocks parse and derive, and temporary effects apply on top", () => {
  const rules = engine();
  const dragon = rules.library.require("monster:young-red-dragon");
  assert.equal(dragon.statblock.hp.hd, 11);
  assert.deepEqual(dragon.statblock.defenses.immune, ["fire", "paralysis", "sleep"]);
  assert.deepEqual(dragon.statblock.defenses.vulnerable, ["cold"]);
  assert.equal(dragon.statblock.speed.fly, 200);
  assert.equal(dragon.statblock.attacks.length, 4);
  const imp = rules.library.require("monster:imp").statblock;
  assert.deepEqual(imp.defenses.dr, [{ amount: 5, bypass: "good or silver" }]);
  assert.deepEqual(imp.defenses.resist, { acid: 10, cold: 10 });
  assert.equal(imp.spells[0].lines.length, 3);
  const minotaur = rules.library.require("monster:minotaur").statblock;
  assert.deepEqual(minotaur.attacks[0], { name: "greataxe", kind: "melee", bonuses: [9, 4], damage: [{ formula: "3d6+6", type: "", crit: true }], crit: { range: 20, mult: 3 }, natural: false, notes: "" });
  const skeleton = rules.library.require("monster:skeleton").statblock;
  assert.equal(skeleton.abilities.con, null);
  const doc = { ...rules.blank("npc"), mode: "statblock", size: "small", statblock: rules.library.require("monster:goblin").statblock };
  let sheet = rules.derive(doc);
  assert.deepEqual([sheet.ac.total, sheet.ac.touch, sheet.ac.flat, sheet.hp.max, sheet.init.total], [16, 13, 14, 6, 6]);
  assert.deepEqual(sheet.attacks.map((attack) => [attack.name, attack.bonuses[0], attack.damage[0].formula]), [["short sword", 2, "1d4"], ["short bow", 4, "1d4"]]);
  assert.equal(sheet.skills.ste.total, 10);
  assert.equal(sheet.maneuvers.cmd, 12);
  doc.conditions = ["shaken"];
  doc.abilities.dex.damage = 4;
  sheet = rules.derive(doc);
  assert.deepEqual([sheet.ac.total, sheet.saves.ref.total, sheet.attacks[0].bonuses[0], sheet.attacks[1].bonuses[0], sheet.skills.ste.total], [14, 2 - 2 - 2, 0, 0, 6]);
  assert.throws(() => parseStatblock("Just a name\nwith nothing else"), /AC line/);
});

test("attacks, damage and healing follow the dice", () => {
  const rules = engine();
  const sheet = rules.derive(fighter(rules, 6));
  const sword = sheet.attacks.find((attack) => attack.name === "Longsword");
  queue = [15, 5, 2, 3];
  let result = rules.attack(sword, { full: true, targetAc: 18 });
  assert.deepEqual(result.strikes.map((strike) => [strike.total, strike.hit]), [[25, true], [7, false]]);
  assert.equal(result.strikes[0].damage.total, 5 + 4);
  queue = [19, 12, 6, 2];
  result = rules.attack(sword, { targetAc: 20 });
  assert.equal(result.strikes[0].threat, true);
  assert.equal(result.strikes[0].confirm.confirmed, true);
  assert.equal(result.strikes[0].critical.total, 6 + 4 + 2 + 4);
  queue = [1];
  assert.equal(rules.attack(sword, { targetAc: 5 }).strikes[0].hit, false, "a natural 1 always misses");
  const imp = { ...rules.blank("npc"), mode: "statblock", size: "tiny", statblock: rules.library.require("monster:imp").statblock };
  const target = rules.derive(imp);
  let hit = rules.applyDamage(imp, target, { amount: 9, type: "S" });
  assert.equal(hit.hp.damage, 4, "damage reduction 5/good or silver");
  hit = rules.applyDamage(imp, target, { amount: 9, type: "S", bypass: ["silver"] });
  assert.equal(hit.hp.damage, 9);
  assert.equal(rules.applyDamage(imp, target, { amount: 30, type: "fire" }).hp.damage, 0, "immune to fire");
  assert.equal(rules.applyDamage(imp, target, { amount: 14, type: "cold" }).hp.damage, 4, "resist cold 10");
  const hurt = { ...imp, hp: { damage: 12, nonlethal: 3, temp: 0 } };
  assert.deepEqual(rules.applyDamage(hurt, target, { amount: 20, healing: true }).hp, { damage: 0, nonlethal: 0, temp: 0, stable: false });
  const dragon = rules.derive({ ...rules.blank("npc"), mode: "statblock", size: "large", statblock: rules.library.require("monster:young-red-dragon").statblock });
  assert.equal(rules.applyDamage({ hp: {} }, dragon, { amount: 20, type: "cold" }).hp.damage, 30, "vulnerable to cold");
});

test("resting, hit points and dying", () => {
  const rules = engine();
  const doc = fighter(rules, 3);
  doc.hp.damage = 20;
  doc.abilities.str.damage = 3;
  doc.uses = { "fighter:x": 2 };
  const rested = rules.rest(doc, rules.derive(doc));
  assert.equal(rested.doc.hp.damage, 17);
  assert.equal(rested.doc.abilities.str.damage, 2);
  doc.hp.damage = 28 + 3;
  assert.equal(rules.derive(doc).hp.status, "dying");
  doc.hp.damage = 28;
  assert.equal(rules.derive(doc).hp.status, "disabled");
  doc.hp.damage = 28 + 14;
  assert.equal(rules.derive(doc).hp.status, "dead");
  assert.throws(() => rules.removeLevel(doc, "class:wizard"), /no level/);
  assert.equal(rules.derive(rules.removeLevel(doc, "class:fighter")).level, 2);
});

test("house rules can change tables, hook the engine and add content", () => {
  class HouseRules {
    install(rules) {
      rules.options.hitPoints = "max";
      rules.system.skills.sai = { name: "Sailing", ability: "wis" };
      rules.system.conditions.drunk = { name: "Drunk", text: "House rule.", changes: [{ target: "attack", type: "untyped", value: -1 }] };
      rules.on("derived", (sheet) => {
        sheet.ac.total += 1;
      });
      rules.on("check", (roll) => ({ ...roll, total: roll.total + 100 }));
      rules.content.add({ id: "house.items", name: "House items", entries: [{ kind: "item", type: "gear", name: "Grog", price: 1, weight: 1 }, { kind: "item", id: "item:longsword", type: "weapon", name: "Longsword", price: 15, weight: 4, weapon: { base: "longsword", category: "martial", group: "melee", handed: "one", damage: "1d10", critRange: 19, critMult: 2 } }] });
    }
  }
  class Expansion {
    packs(system) {
      return system === "pf1e" ? [{ id: "expansion.spells", name: "More spells", entries: [{ kind: "spell", name: "Thunder Punch", school: "evocation", levels: { wizard: 1 }, level: 1 }] }, { id: "other", system: "dnd35", entries: [{ kind: "spell", name: "Not for this game" }] }] : [];
    }
  }
  extensions["easel.wotcogl35.extension@1"] = [HouseRules];
  extensions["easel.wotcogl35.content@1"] = [Expansion];
  try {
    const rules = engine();
    assert.ok(rules.library.has("spell:thunder-punch"));
    assert.ok(!rules.library.has("spell:not-for-this-game"));
    assert.ok(rules.library.has("item:grog"));
    assert.equal(rules.library.require("item:longsword").weapon.damage, "1d10", "a later pack replaces an entry with the same id");
    let doc = rules.blank();
    for (let level = 0; level < 3; level++) doc = rules.addLevel(doc, rules.library.require("class:fighter")).doc;
    doc.conditions = ["drunk"];
    const sheet = rules.derive(doc);
    assert.equal(sheet.hp.max, 30, "every hit die is maximized");
    assert.equal(sheet.ac.total, 11);
    assert.equal(sheet.skills.sai.name, "Sailing");
    assert.deepEqual(sheet.attacks[0].bonuses, [2]);
    queue = [10];
    assert.equal(rules.check({ bonus: 1 }).total, 111);
    assert.throws(() => rules.on("nonsense", () => {}), /no rules hook/);
  } finally {
    extensions["easel.wotcogl35.extension@1"] = [];
    extensions["easel.wotcogl35.content@1"] = [];
  }
});

test("calculation steps can be added, wrapped, replaced and removed", () => {
  class Steps {
    install(rules) {
      rules.step("sanity", (sheet, ctx) => {
        sheet.sanity = 10 + sheet.abilities.wis.mod + ctx.total(["sanity"]).total;
      }, { after: "saves" });
      rules.wrap("armorClass", (sheet, ctx, next) => {
        next();
        sheet.ac.total += sheet.abilities.wis.mod > 0 ? sheet.abilities.wis.mod : 0;
      });
      rules.step("initiative", (sheet) => {
        sheet.init = { total: sheet.abilities.int.mod, parts: [] };
      });
      rules.resource({ id: "hero", name: "Hero points", max: "1 + floor(@level / 2)", recover: {} });
    }
  }
  extensions["easel.wotcogl35.extension@1"] = [Steps];
  try {
    const rules = engine();
    assert.ok(rules.steps.findIndex((step) => step.id === "sanity") === rules.steps.findIndex((step) => step.id === "saves") + 1);
    let doc = rules.blank();
    doc.abilities.wis.base = 14;
    doc.abilities.int.base = 16;
    doc.abilities.dex.base = 18;
    for (let level = 0; level < 4; level++) doc = rules.addLevel(doc, rules.library.require("class:fighter")).doc;
    doc.feats = [{ uid: "x", name: "Steady Mind", changes: [{ target: "sanity", type: "untyped", value: 3 }] }];
    const sheet = rules.derive(doc);
    assert.equal(sheet.sanity, 10 + 2 + 3, "a new statistic takes changes like any other");
    assert.equal(sheet.ac.total, 10 + 4 + 2, "a wrapped step adds to the original");
    assert.equal(sheet.init.total, 3, "a replaced step uses Intelligence");
    assert.deepEqual([sheet.resources.hero.max, sheet.resources.hero.left], [3, 3]);
    const spent = rules.spend(doc, sheet, [{ resource: "hero", amount: 2 }]);
    assert.equal(rules.derive(spent.doc).resources.hero.left, 1);
    assert.throws(() => rules.spend(spent.doc, rules.derive(spent.doc), [{ resource: "hero", amount: 2 }]), /Not enough hero points/);
    assert.equal(rules.rest(spent.doc, rules.derive(spent.doc)).doc.resources.hero, 2, "this pool does not come back with rest");
    rules.unstep("sanity");
    assert.equal(rules.derive(doc).sanity, undefined);
    assert.throws(() => rules.step("x", () => {}, { after: "nowhere" }), /no calculation step/);
  } finally {
    extensions["easel.wotcogl35.extension@1"] = [];
  }
});

test("a whole subsystem can come from outside: the kineticist", async () => {
  const Kineticist = (await load("server/easel/modules/pf1e-kineticist/server/extension.mjs")).default;
  const Content = (await load("server/easel/modules/pf1e-kineticist/server/content.mjs")).default;
  extensions["easel.wotcogl35.extension@1"] = [Kineticist];
  extensions["easel.wotcogl35.content@1"] = [Content];
  try {
    const rules = engine();
    assert.ok(rules.registry("kinds").has("talent"));
    assert.equal(rules.registry("sections").ids().length, 7);
    let doc = rules.blank();
    doc.abilities.con.base = 16;
    doc.abilities.dex.base = 14;
    for (let level = 0; level < 6; level++) doc = rules.addLevel(doc, rules.library.require("class:kineticist")).doc;
    const talent = (name) => ({ uid: name, entryId: rules.library.find("talent", name).id, ...rules.library.find("talent", name) });
    doc.lists.talent = [talent("Fire Blast"), talent("Earth Blast"), talent("Entangling Infusion"), talent("Kinetic Healer")];
    let sheet = rules.derive(doc);
    assert.deepEqual([sheet.resources.burn.value, sheet.resources.burn.max, sheet.resources.burn.counts], [0, 6, "up"]);
    const fire = sheet.attacks.find((attack) => attack.name === "Fire Blast");
    const earth = sheet.attacks.find((attack) => attack.name === "Earth Blast");
    assert.deepEqual([fire.bonuses, fire.touch, fire.damage[0].formula, fire.damage[0].type], [[4 + 2], true, "3d6+1", "fire"]);
    assert.equal(earth.damage[0].formula, "3d6+6");
    assert.ok(sheet.toggles.some((toggle) => toggle.id === "gatherPower"));
    const infusion = doc.lists.talent[2];
    let spent = rules.spend(doc, sheet, infusion.use.cost);
    assert.equal(spent.doc.resources.burn, 2);
    doc = spent.doc;
    sheet = rules.derive(doc);
    assert.equal(sheet.hp.nonlethal, 12, "two points of burn at 6th level");
    assert.deepEqual(sheet.attacks.find((attack) => attack.name === "Fire Blast").bonuses, [8], "elemental overflow adds the burn, up to a third of the level");
    assert.equal(sheet.attacks.find((attack) => attack.name === "Fire Blast").damage[0].formula, "3d6+5");
    doc.toggles.gatherPower = true;
    spent = rules.spend(doc, rules.derive(doc), infusion.use.cost);
    assert.equal(spent.doc.resources.burn, 3, "gathering power takes one off the cost");
    doc.resources.burn = 6;
    assert.throws(() => rules.spend(doc, rules.derive(doc), infusion.use.cost), /past its limit/);
    assert.equal(rules.rest(doc, rules.derive(doc)).doc.resources.burn, 0, "a night's rest removes burn");
    assert.equal(rules.derive(rules.blank()).resources.burn, undefined, "other characters have no burn");
  } finally {
    extensions["easel.wotcogl35.extension@1"] = [];
    extensions["easel.wotcogl35.content@1"] = [];
  }
});

test("Path of War: initiators ready, expend and recover maneuvers, and hold one stance", async () => {
  const PathOfWar = (await load("server/easel/modules/pf1e-pathofwar/server/extension.mjs")).default;
  const Content = (await load("server/easel/modules/pf1e-pathofwar/server/content.mjs")).default;
  extensions["easel.wotcogl35.extension@1"] = [PathOfWar];
  extensions["easel.wotcogl35.content@1"] = [Content];
  try {
    const rules = engine();
    const kind = rules.registry("kinds").get("maneuver");
    const actions = rules.registry("actions");
    assert.ok(rules.library.count("maneuver") >= 50);
    assert.ok(rules.steps.some((step) => step.id === "initiating"));
    let doc = rules.blank();
    doc.abilities.int.base = 16;
    doc.abilities.dex.base = 10;
    doc.abilities.str.base = 16;
    assert.throws(() => kind.add(doc, rules.library.find("maneuver", "Pommel Bash"), {}, rules.derive(doc)), /no levels in an initiator class/);
    for (let level = 0; level < 3; level++) doc = rules.addLevel(doc, rules.library.require("class:warder")).doc;
    doc.items = [item(rules, "Longsword")];
    let sheet = rules.derive(doc);
    assert.deepEqual([sheet.initiating.level, sheet.initiating.mod, sheet.initiating.dc, sheet.initiating.known, sheet.initiating.readied, sheet.initiating.stances, sheet.initiating.highest], [3, 3, 13, 7, 4, 2, 2]);
    assert.equal(sheet.init.total, 3, "tactical acumen uses Intelligence for initiative");
    assert.throws(() => kind.add(doc, rules.library.find("maneuver", "Bronze Knuckle"), {}, sheet), /up to level 2/);
    for (const name of ["Stance of Aggression", "Pugilist Stance", "Pommel Bash", "Flurry Strike", "Crushing Blow", "Iron Shell", "Primal Wrath"]) kind.add(doc, rules.library.find("maneuver", name), {}, rules.derive(doc));
    assert.throws(() => kind.add(doc, rules.library.find("maneuver", "Pride Leader's Stance"), {}, rules.derive(doc)), /No more stances/);
    const find = (name) => doc.lists.maneuver.find((entry) => entry.name === name);
    const run = (name, data) => actions.get(name).run(doc, rules.derive(doc), data);
    for (const name of ["Pommel Bash", "Flurry Strike", "Crushing Blow", "Iron Shell"]) run("pow.ready", { uid: find(name).uid, on: true });
    assert.throws(() => run("pow.ready", { uid: find("Primal Wrath").uid, on: true }), /Only 4 maneuvers can be readied/);
    assert.throws(() => run("pow.ready", { uid: find("Pugilist Stance").uid, on: true }), /not readied/);
    const sword = () => rules.derive(doc).attacks.find((attack) => attack.name === "Longsword");
    assert.equal(sword().damage.length, 1);
    run("pow.stance", { uid: find("Stance of Aggression").uid });
    sheet = rules.derive(doc);
    assert.deepEqual(sword().damage.map((part) => part.formula), ["1d8+3", "1d6"], "the active stance adds its dice");
    assert.equal(sheet.ac.total, 8);
    assert.ok(!sheet.toggles.some((toggle) => toggle.id.startsWith("stance:")), "stances are switched from their own page, not the general list");
    run("pow.stance", { uid: find("Pugilist Stance").uid });
    assert.deepEqual([doc.toggles["stance:stance-of-aggression"], doc.toggles["stance:pugilist-stance"]], [false, true], "only one stance at a time");
    find("Pommel Bash").expended = true;
    find("Flurry Strike").expended = true;
    find("Iron Shell").expended = true;
    assert.equal(rules.derive(doc).initiating.count.expended, 3);
    run("pow.recover", { count: "one", uid: find("Iron Shell").uid });
    assert.equal(find("Iron Shell").expended, false);
    run("pow.recover", { count: "focus" });
    assert.equal(rules.derive(doc).initiating.count.expended, 0, "a full-round recovery returns at least two");
    find("Crushing Blow").expended = true;
    assert.equal(rules.rest(doc, rules.derive(doc)).doc.lists.maneuver.some((entry) => entry.expended), false);
  } finally {
    extensions["easel.wotcogl35.extension@1"] = [];
    extensions["easel.wotcogl35.content@1"] = [];
  }
});
