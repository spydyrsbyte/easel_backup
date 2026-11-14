import { registerSections } from "./registry.mjs";

const SHEET_EVENTS = ["set", "rename", "image", "roll", "action", "add", "remove", "item", "view", "request"];
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const BONUS_TYPES = ["untyped", "alchemical", "armor", "circumstance", "competence", "deflection", "dodge", "enhancement", "insight", "luck", "morale", "natural", "profane", "racial", "resistance", "sacred", "shield", "size"];
const TARGETS = [["", "None"], ["ac", "Armor class"], ["attack", "Attack rolls"], ["attack.melee", "Melee attacks"], ["attack.ranged", "Ranged attacks"], ["damage", "Weapon damage"], ["saves", "All saves"], ["fort", "Fortitude"], ["ref", "Reflex"], ["will", "Will"], ["skills", "All skills"], ["init", "Initiative"], ["speed", "Speed"], ["hp", "Hit points"], ["cmb", "CMB"], ["cmd", "CMD"], ["str", "Strength"], ["dex", "Dexterity"], ["con", "Constitution"], ["int", "Intelligence"], ["wis", "Wisdom"], ["cha", "Charisma"]];
const title = (text) => String(text || "").replace(/^./, (letter) => letter.toUpperCase());

export async function initialize({ Easel, Application }) {
  const table = Easel.Interfaces.create("easel.vtt.tabletop@1");
  await Easel.Interfaces.load("easel.pf1e.sheetsection@1");
  for (const found of Easel.Interfaces.list("easel.pf1e.sheetsection@1")) registerSections(new found.obj().sections());
  let data = { actors: [], system: {} };
  let rollMode = "public";
  let libraryKind = "monster";
  let libraryHost = null;
  const browsers = {};
  const sheets = new Map();
  const open = new Set();
  const library = new Map();
  const entries = new Map();
  const waiting = new Map();
  const pickers = new Map();

  const send = (name, payload = {}) => {
    try {
      return Application.events.emit("easel.pf1e." + name, payload).catch((error) => table.toast(error.message, "error"));
    } catch {
      return Promise.resolve();
    }
  };
  const actor = (id) => data.actors.find((entry) => entry.id === id);
  const kindOf = (id) => String(id).split(":")[0];
  const kindInfo = (kind) => (data.system.kinds || []).find((entry) => entry.id === kind) || { id: kind, label: title(kind), singular: kind, icon: "file" };

  function withEntry(id) {
    if (entries.has(id)) return Promise.resolve(entries.get(id));
    return new Promise((resolve) => {
      const list = waiting.get(id) || [];
      list.push(resolve);
      waiting.set(id, list);
      if (list.length === 1) send("lookup", { id });
    });
  }

  function ask(heading, fields, values, label = "Save") {
    return new Promise((resolve) => {
      const key = "ask:" + Math.random().toString(36).slice(2);
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        table.closeWindow(key);
      };
      const entry = table.form(key, { title: heading, width: 400, height: Math.min(640, 150 + fields.length * 58), x: Math.max(40, innerWidth / 2 - 320), y: 90 }, fields, values, {
        actions: [
          { id: "cancel", label: "Cancel", kind: "ghost" },
          { id: "ok", label, kind: "primary" },
        ],
        submit: "ok",
        action: (id, all) => finish(id === "ok" ? all : null),
      });
      entry.closed = () => finish(null);
    });
  }

  function libraryItems(kind, filter) {
    const info = kindInfo(kind);
    const found = (library.get(kind) || []).filter((entry) => !filter || filter(entry));
    const groups = [...new Set(found.map((entry) => entry.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      items: found.map((entry) => ({ id: entry.id, name: entry.name, detail: entry.detail, folderId: entry.group || "", icon: info.icon, badges: entry.custom ? [{ label: "Custom", kind: "primary" }] : [], actions: entryActions(entry.id, entry.custom) })),
      folders: groups.map((group, index) => ({ id: group, name: title(group), sort: index })),
    };
  }

  function entryActions(id, custom) {
    const kind = kindOf(id);
    const actions = [{ id: "view", label: "View", icon: "eye" }];
    if (kind === "monster") {
      if (table.gm) actions.push({ id: "spawn", label: "Place on this scene", icon: "token" }, { id: "create", label: "Add to the character list", icon: "user" });
    } else if (kindInfo(kind).onSheet !== false) actions.push({ id: "give", label: "Add to a character", icon: "plus" });
    if (custom && table.gm) actions.push({ separator: true }, { id: "delete", label: "Delete from the library", icon: "trash", danger: true });
    return actions;
  }

  function entryAction(id, action) {
    const kind = kindOf(id);
    if (action === "view") viewEntry(id);
    else if (action === "spawn") {
      if (!table.scene || table.isStage) return table.toast("Open a battle map first.");
      const size = table.scene.map?.size || { width: 1000, height: 1000 };
      send("spawn", { entryId: id, sceneId: table.scene.id, groundId: "", x: Math.round(size.width / 2), y: Math.round(size.height / 2) });
    } else if (action === "create") send("actorCreate", { name: "", kind: "npc", entryId: id });
    else if (action === "give") give(id, kind);
    else if (action === "delete") table.confirm("Delete this entry?", "It is removed from this table's library. Copies already on character sheets stay.", "Delete").then((yes) => yes && send("entryDelete", { id }));
  }

  function buildLibrary() {
    if (libraryHost || !(data.system.kinds || []).length) return;
    const make = (name, props) => Easel.Components.create(name, { props });
    libraryHost = make("easel.layout.sidebar@1", { tabs: [], active: libraryKind });
    for (const kind of data.system.kinds) {
      const browser = make("easel.collections.browser@2", { kind: "pf1e." + kind.id, icon: kind.icon, allowFolders: false, placeholder: "Search " + kind.label.toLowerCase(), emptyTitle: "Loading " + kind.label.toLowerCase() + "…", createLabel: kind.id === "monster" ? "Import" : "New" });
      browser.attach(libraryHost, "panels");
      browser.on("open", ({ id }) => viewEntry(id));
      browser.on("action", ({ id, action }) => entryAction(id, action));
      browser.on("create", () => createEntry(kind.id));
      browsers[kind.id] = browser;
    }
    libraryHost.attach(table.side, "panels");
    libraryHost.on("select", ({ id }) => {
      libraryKind = id;
      loadKind(id);
      renderLibrary();
    });
    loadKind(libraryKind);
    renderLibrary();
  }

  function loadKind(kind) {
    if (!library.has(kind)) send("library", { kind });
  }

  function renderLibrary() {
    if (!libraryHost) return;
    libraryHost.setProps({ tabs: data.system.kinds.map((kind) => ({ id: kind.id, label: kind.label, icon: kind.icon, panel: browsers[kind.id].id })), active: libraryKind });
    for (const kind of data.system.kinds) {
      const creatable = table.gm && kind.creatable && ["monster", "item", "spell", "feat", "buff"].includes(kind.id);
      browsers[kind.id].setProps({ ...libraryItems(kind.id), canCreate: creatable, canManage: !!table.gm, emptyTitle: library.has(kind.id) ? "Nothing here yet" : "Loading " + kind.label.toLowerCase() + "…" });
    }
    for (const picker of pickers.values()) picker.browser.setProps(libraryItems(picker.kind, picker.filter));
  }

  function viewEntry(id) {
    if (!id) return;
    const props = () => ({ entry: entries.get(id) || {}, system: data.system, actions: entryActions(id, (entries.get(id) || {}).pack === "custom").filter((action) => action.id && action.id !== "view").map((action) => ({ id: action.id, label: action.label, icon: action.icon, kind: action.danger ? "danger" : action.id === "delete" ? "" : "primary" })) });
    const entry = table.window("entry:" + id, { title: (entries.get(id) || {}).name || "Library", icon: kindInfo(kindOf(id)).icon, width: 440, height: 560 }, (created) => {
      created.view = Easel.Components.create("easel.pf1e.entry@1", { props: props() });
      created.view.attach(created.frame, "content");
      created.view.on("action", ({ action }) => entryAction(id, action));
    });
    entry.update = () => {
      entry.view.setProps(props());
      entry.frame.setProps({ title: (entries.get(id) || {}).name || "Library" });
    };
    withEntry(id).then(() => table.windows.has("entry:" + id) && entry.update());
  }

  function pick(kind, heading, filter, onPick) {
    const key = "pick:" + kind + ":" + heading;
    loadKind(kind);
    table.window(key, { title: heading, icon: kindInfo(kind).icon, width: 380, height: 520 }, (created) => {
      created.browser = Easel.Components.create("easel.collections.browser@2", { props: { kind: "pf1e.pick", icon: kindInfo(kind).icon, draggable: false, allowFolders: false, placeholder: "Search " + kindInfo(kind).label.toLowerCase(), actions: [{ id: "add", label: "Add", icon: "plus" }, { id: "view", label: "View", icon: "eye" }], ...libraryItems(kind, filter) } });
      created.browser.attach(created.frame, "content");
      created.browser.on("open", ({ id }) => onPick(id));
      created.browser.on("action", ({ id, action }) => (action === "view" ? viewEntry(id) : onPick(id)));
      pickers.set(key, { kind, filter, browser: created.browser });
      created.closed = () => pickers.delete(key);
    });
    renderLibrary();
    table.toast("Double-click an entry to add it.");
  }

  function give(entryId, kind) {
    const writable = data.actors.filter((entry) => entry.canWrite && (kind === "item" || kind === "buff" || !entry.monster));
    const opened = writable.filter((entry) => open.has(entry.id));
    if (opened.length === 1) return addEntry(opened[0].id, entryId);
    if (!writable.length) return table.toast("There is no character you can add this to.");
    if (writable.length === 1) return addEntry(writable[0].id, entryId);
    table.choose("Add it to…", (opened.length ? opened : writable).slice(0, 12).map((entry) => ({ id: entry.id, label: entry.name, icon: "user", hint: entry.summary }))).then((id) => id && addEntry(id, entryId));
  }

  async function addEntry(actorId, entryId, preset = {}) {
    const entry = await withEntry(entryId);
    if (!entry) return;
    const options = { ...preset };
    const sheet = sheets.get(actorId);
    if (entry.kind === "feat" && entry.choice) {
      if (entry.choice.kind === "skill") {
        const skills = Object.entries(data.system.skills || {}).filter(([, skill]) => !skill.group).map(([id, skill]) => ({ id, label: skill.name }));
        const custom = Object.keys((sheet && sheet.doc.skills) || {}).filter((id) => id.includes(":")).map((id) => ({ id, label: ((sheet.derived.skills || {})[id] || {}).name || id }));
        const answer = await ask(entry.name, [{ id: "choice", label: entry.choice.label, type: "select", options: [...skills, ...custom].sort((a, b) => a.label.localeCompare(b.label)) }], { choice: "per" }, "Add");
        if (!answer) return;
        options.choice = answer.choice;
      } else {
        const answer = await table.prompt(entry.name + ": " + entry.choice.label.toLowerCase(), "");
        if (!answer) return;
        options.choice = answer;
      }
    } else if (entry.kind === "race" && entry.choice === "ability") {
      const ability = await table.choose("+2 to which ability score?", ABILITIES.map((id) => ({ id, label: (data.system.abilityNames || {})[id] || id })));
      if (!ability) return;
      options.ability = ability;
    } else if (entry.kind === "spell" && !options.key) {
      const casters = (sheet && sheet.derived.casting) || [];
      if (casters.length > 1) {
        const key = await table.choose("Add " + entry.name + " to which class?", casters.map((caster) => ({ id: caster.key, label: caster.name })));
        if (!key) return;
        options.key = key;
      } else if (casters.length === 1) options.key = casters[0].key;
    } else if (entry.kind === "buff" && entry.leveled) {
      const answer = await ask(entry.name, [{ id: "level", label: "Caster level or bonus", type: "number", min: 1, max: 40, hint: entry.text }], { level: (sheet && sheet.derived.level) || 1 }, "Add");
      if (!answer) return;
      options.level = answer.level;
    }
    send("actorAdd", { actorId, entryId, options });
  }

  const REQUESTS = {
    levelUp: async (actorId) => {
      const sheet = sheets.get(actorId);
      const have = new Set(((sheet && sheet.derived.levels) || []).map((level) => level.classId));
      const classes = (data.system.classes || []).filter((entry) => !entry.npc || (sheet && sheet.kind === "npc") || have.has(entry.id)).sort((a, b) => Number(have.has(b.id)) - Number(have.has(a.id)) || a.name.localeCompare(b.name));
      const classId = await table.choose(have.size ? "Gain a level in…" : "Choose a class", classes.map((entry) => ({ id: entry.id, label: entry.name, icon: entry.casting ? "sparkle" : "shield", hint: "d" + entry.hd + (have.has(entry.id) ? " · current class" : "") })));
      if (classId) send("actorAdd", { actorId, entryId: classId, options: {} });
    },
    levelDown: (actorId, { classId, name }) => table.confirm("Remove a level of " + name + "?", "The hit points rolled for that level are removed too.", "Remove level").then((yes) => yes && send("actorAction", { actorId, action: "levelDown", data: { classId } })),
    race: async (actorId) => {
      const raceId = await table.choose("Choose a race", (data.system.races || []).map((entry) => ({ id: entry.id, label: entry.name, icon: "users" })));
      if (raceId) addEntry(actorId, raceId);
    },
    skill: async (actorId, { base, name }) => {
      const label = await table.prompt("Which " + name + " skill?", "");
      if (label) send("actorAction", { actorId, action: "skill", data: { base, label } });
    },
    add: (actorId, { kind, key, list, group }) => {
      const sheet = sheets.get(actorId);
      const info = kindInfo(kind);
      const filter = kind === "spell" && list ? (entry) => (" " + entry.detail + ",").includes(" " + list + " ") : group ? (entry) => entry.group === group : null;
      pick(kind, "Add " + (kind === "buff" ? "an effect" : "a" + (/^[aeiou]/.test(info.singular) ? "n " : " ") + info.singular) + " to " + ((sheet && sheet.name) || "the character"), filter, (entryId) => addEntry(actorId, entryId, key ? { key } : {}));
    },
    feature: async (actorId) => {
      const answer = await ask("Add a feature", [{ id: "name", label: "Name", type: "text" }, { id: "text", label: "What it does", type: "textarea", rows: 4 }, { id: "uses", label: "Uses per day", type: "number", min: 0, max: 99, hint: "Leave at 0 for a feature that is always on." }], { name: "", text: "", uses: 0 }, "Add");
      if (answer && answer.name) send("actorAction", { actorId, action: "feature", data: answer });
    },
    rest: (actorId, { full }) => table.confirm(full ? "Rest for a full day?" : "Rest for the night?", "Hit points and ability damage heal, spell slots and daily abilities are restored.", "Rest").then((yes) => yes && send("actorAction", { actorId, action: "rest", data: { full: !!full } })),
    drop: (actorId, { id }) => addEntry(actorId, id),
  };

  function bonusFields(count) {
    const fields = [{ type: "section", label: "Bonuses it grants while worn or active" }];
    for (let index = 0; index < count; index++) {
      fields.push({ id: "target" + index, label: "Bonus " + (index + 1) + " applies to", type: "select", options: TARGETS.map(([id, label]) => ({ id, label })) });
      fields.push({ id: "type" + index, label: "Bonus type", type: "select", options: BONUS_TYPES, when: "target" + index });
      fields.push({ id: "value" + index, label: "Amount", type: "text", placeholder: "+2, or a formula such as floor(@level / 2)", when: "target" + index });
    }
    return fields;
  }

  function bonuses(values, count) {
    const changes = [];
    for (let index = 0; index < count; index++) if (values["target" + index]) changes.push({ target: values["target" + index], type: values["type" + index] || "untyped", value: String(values["value" + index] || "0").replace(/^\+/, "") });
    return changes;
  }

  function createEntry(kind) {
    const key = "create:" + kind;
    const save = (entry) => {
      send("entrySave", { entry: { kind, ...entry } });
      table.closeWindow(key);
    };
    const actions = [{ id: "save", label: "Add to the library", kind: "primary" }];
    if (kind === "monster") {
      table.form(key, { title: "Import a monster", icon: "skull", width: 520, height: 560 }, [{ id: "text", label: "", type: "textarea", rows: 20, wide: true, placeholder: "Paste a stat block. It starts with the name and CR, and needs at least an AC line and an hp line." }], { text: "" }, { actions, action: (id, values) => (values.text.trim() ? save({ text: values.text }) : table.toast("Paste a stat block first.")) });
    } else if (kind === "item") {
      const fields = [
        { id: "name", label: "Name", type: "text" },
        { id: "type", label: "Kind of item", type: "select", options: [{ id: "gear", label: "Gear" }, { id: "weapon", label: "Weapon" }, { id: "armor", label: "Armor" }, { id: "shield", label: "Shield" }, { id: "magic", label: "Magic item" }, { id: "consumable", label: "Consumable" }] },
        { id: "price", label: "Price (gp)", type: "number", min: 0 },
        { id: "weight", label: "Weight (lb.)", type: "number", min: 0 },
        { id: "group", label: "Used", type: "segment", options: [{ id: "melee", label: "In melee" }, { id: "ranged", label: "At range" }], when: "isWeapon" },
        { id: "category", label: "Proficiency", type: "select", options: ["simple", "martial", "exotic"], when: "isWeapon" },
        { id: "handed", label: "Wielded", type: "select", options: [{ id: "light", label: "Light" }, { id: "one", label: "One-handed" }, { id: "two", label: "Two-handed" }], when: "isWeapon" },
        { id: "damage", label: "Damage (Medium)", type: "text", placeholder: "1d8", when: "isWeapon" },
        { id: "critRange", label: "Threatens from", type: "number", min: 2, max: 20, when: "isWeapon" },
        { id: "critMult", label: "Critical multiplier", type: "number", min: 2, max: 6, when: "isWeapon" },
        { id: "damageType", label: "Damage type", type: "text", placeholder: "S, P, B or an energy type", when: "hasDamage" },
        { id: "range", label: "Range increment (ft.)", type: "number", min: 0, when: "isWeapon" },
        { id: "armorCategory", label: "Armor weight", type: "select", options: ["light", "medium", "heavy"], when: "isArmor" },
        { id: "bonus", label: "AC bonus", type: "number", min: 0, max: 30, when: "isProtection" },
        { id: "maxDex", label: "Maximum Dex bonus", type: "text", placeholder: "blank for none", when: "isProtection" },
        { id: "acp", label: "Armor check penalty", type: "number", min: 0, max: 20, when: "isProtection" },
        { id: "spellFailure", label: "Arcane spell failure %", type: "number", min: 0, max: 100, when: "isProtection" },
        { id: "formula", label: "Rolls when used", type: "text", placeholder: "2d8+3", when: "isConsumable" },
        { id: "healing", label: "The roll heals", type: "switch", when: "isConsumable" },
        { id: "description", label: "Description", type: "textarea", rows: 3 },
        ...bonusFields(2),
      ];
      const flags = (values) => Object.assign(values, { isWeapon: values.type === "weapon", isArmor: values.type === "armor", isProtection: values.type === "armor" || values.type === "shield", isConsumable: values.type === "consumable", hasDamage: values.type === "weapon" || values.type === "consumable" });
      const entry = table.form(key, { title: "New item", icon: "bag", width: 460, height: 620 }, fields, flags({ name: "", type: "gear", price: 0, weight: 0, group: "melee", category: "martial", handed: "one", damage: "1d8", critRange: 20, critMult: 2, damageType: "", range: 0, armorCategory: "light", bonus: 1, maxDex: "", acp: 0, spellFailure: 0, formula: "", healing: false, description: "" }), {
        actions,
        change: (id, value, values) => entry.form.setProps({ values: flags(values) }),
        action: (id, values) => (values.name.trim() ? save({ ...values, category: values.type === "armor" ? values.armorCategory : values.category, changes: bonuses(values, 2) }) : table.toast("Give the item a name.")),
      });
    } else if (kind === "spell") {
      table.form(key, { title: "New spell", icon: "sparkle", width: 460, height: 620 }, [
        { id: "name", label: "Name", type: "text" },
        { id: "school", label: "School", type: "select", options: ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation", "universal"] },
        { id: "levels", label: "Class lists and levels", type: "text", placeholder: "wizard 3, cleric 4", hint: "Lists: wizard (also sorcerer), cleric, druid, bard, paladin, ranger." },
        { id: "castingTime", label: "Casting time", type: "text" },
        { id: "components", label: "Components", type: "text" },
        { id: "range", label: "Range", type: "text" },
        { id: "duration", label: "Duration", type: "text" },
        { id: "save", label: "Saving throw", type: "text", placeholder: "Reflex half" },
        { id: "description", label: "What it does", type: "textarea", rows: 4 },
        { type: "section", label: "A roll made when it is cast (optional)" },
        { id: "dice", label: "Dice", type: "text", placeholder: "min(10,@cl)d6", hint: "@cl is the caster level." },
        { id: "bonus", label: "Added to the roll", type: "text", placeholder: "min(5,@cl)" },
        { id: "damageType", label: "Damage type", type: "text", placeholder: "fire" },
        { id: "healing", label: "The roll heals", type: "switch" },
      ], { name: "", school: "evocation", levels: "", castingTime: "1 standard action", components: "V, S", range: "", duration: "", save: "", description: "", dice: "", bonus: "", damageType: "", healing: false }, { actions, action: (id, values) => (values.name.trim() ? save(values) : table.toast("Give the spell a name.")) });
    } else if (kind === "feat") {
      table.form(key, { title: "New feat", icon: "star", width: 440, height: 600 }, [{ id: "name", label: "Name", type: "text" }, { id: "type", label: "Type", type: "select", options: ["General", "Combat", "Metamagic", "Item Creation", "Teamwork"] }, { id: "prerequisites", label: "Prerequisites", type: "text" }, { id: "description", label: "Benefit", type: "textarea", rows: 4 }, ...bonusFields(3)], { name: "", type: "General", prerequisites: "", description: "" }, { actions, action: (id, values) => (values.name.trim() ? save({ ...values, changes: bonuses(values, 3) }) : table.toast("Give the feat a name.")) });
    } else if (kind === "buff") {
      table.form(key, { title: "New effect", icon: "bolt", width: 440, height: 600 }, [{ id: "name", label: "Name", type: "text" }, { id: "description", label: "What it does", type: "textarea", rows: 3 }, ...bonusFields(4)], { name: "", description: "" }, { actions, action: (id, values) => (values.name.trim() ? save({ ...values, changes: bonuses(values, 4) }) : table.toast("Give the effect a name.")) });
    } else table.toast("New " + kindInfo(kind).label.toLowerCase() + " come from a content module.");
  }

  function targetsFor(view) {
    if (view.selectedTokens.length) return view.selectedTokens;
    const own = data.actors.filter((entry) => entry.canWrite && entry.kind === "character");
    if (!view.gm && own.length === 1) return [own[0].id];
    if (open.size === 1) return [...open];
    view.toast("Select the tokens this applies to first.");
    return null;
  }

  await table.mount({
    Easel,
    Application,
    require: ["easel.pf1e.sheet@1", "easel.pf1e.entry@1"],
    system: {
      quickDice: ["d4", "d6", "d8", "d10", "d12", "d20", "d100"],
      rollMode: (mode) => {
        rollMode = mode;
      },
      actorBrowser: { createLabel: "New character", emptyText: "Create a character, or drag a monster from the library onto the map." },
      actors: (view) =>
        data.actors.map((entry) => ({
          id: entry.id,
          name: entry.name,
          image: entry.image,
          folderId: view.gm ? (entry.kind === "npc" ? "npc" : "pc") : "",
          detail: entry.summary + " · " + entry.hp.value + "/" + entry.hp.max + " hp",
          badges: [...(["ok", "staggered"].includes(entry.status) ? [] : [{ label: title(entry.status), kind: "danger" }]), ...(view.gm && entry.kind === "character" && !entry.ownerUserIds.length ? [{ label: "Unassigned" }] : [])],
        })),
      actorFolders: (view) => (view.gm ? [{ id: "pc", name: "Player characters", sort: 0 }, { id: "npc", name: "Monsters and NPCs", sort: 1 }] : []),
      canCreateActor: () => true,
      actorActions: (view) => (view.gm ? [{ id: "assign", label: "Give to a player", icon: "users" }] : []),
      actorAction: (id, action, view) => {
        if (action !== "assign") return;
        const players = (view.state.members || []).filter((member) => member.role !== "administrator");
        view.choose("Who plays " + (actor(id)?.name || "this character") + "?", [...players.map((member) => ({ id: member.id, label: member.name, icon: "user" })), { id: "none", label: "No one", icon: "close" }]).then((choice) => {
          if (choice) send("actorUpdate", { actorId: id, changes: { ownerUserIds: choice === "none" ? [] : [choice] } });
        });
      },
      createActor: async (folderId, view) => {
        const kind = view.gm ? await view.choose("New character", [{ id: "character", label: "Player character", icon: "user", hint: "Built with a race and class levels" }, { id: "npc", label: "Non-player character", icon: "users", hint: "Built the same way; can take NPC classes" }]) : "character";
        if (!kind) return;
        const name = await view.prompt("Name the character", "New character");
        if (name) send("actorCreate", { name, kind, entryId: "" });
      },
      deleteActor: (id) => send("actorDelete", { actorId: id }),
      sheetComponent: "easel.pf1e.sheet@1",
      sheetEvents: SHEET_EVENTS,
      sheetWindow: { width: 660, height: 720 },
      sheetTitle: (id) => actor(id)?.name || "Character",
      sheet: (id) => {
        if (!actor(id)) return null;
        return { sheet: sheets.get(id) || {}, system: data.system, loading: !sheets.has(id) };
      },
      sheetOpened: (id) => {
        open.add(id);
        send("open", { actorId: id });
      },
      sheetClosed: (id) => {
        open.delete(id);
        sheets.delete(id);
      },
      sheetEvent: (id, name, payload) => {
        if (name === "set") send("actorUpdate", { actorId: id, changes: { set: { [payload.path]: payload.value.value } } });
        else if (name === "rename") send("actorUpdate", { actorId: id, changes: { name: payload.name } });
        else if (name === "image")
          Application.files
            .upload(payload.file.file)
            .then((stored) => send("actorUpdate", { actorId: id, changes: { portrait: stored.url } }))
            .catch((error) => table.toast(error.message, "error"));
        else if (name === "roll") send("roll", { actorId: id, kind: payload.kind, id: payload.id, options: { ...payload.options, rollMode } });
        else if (name === "action") send("actorAction", { actorId: id, action: payload.action, data: payload.data });
        else if (name === "add") send("actorAdd", { actorId: id, entryId: payload.entryId, options: payload.options });
        else if (name === "remove") send("actorRemove", { actorId: id, list: payload.list, uid: payload.uid });
        else if (name === "item") send("actorItem", { actorId: id, uid: payload.uid, changes: payload.changes });
        else if (name === "view") viewEntry(payload.id);
        else if (name === "request") REQUESTS[payload.what]?.(id, payload.data || {});
      },
      card: (card, message) => {
        if (card.system === "pf1e") return card;
        const content = card.content || card;
        return { title: content.title, formula: content.formula, total: content.total, dice: (content.rolls || content.dice || []).map((die) => (typeof die === "object" ? die : { value: die })), text: content.text };
      },
      cardAction: ({ action, payload }, view) => {
        const targets = targetsFor(view);
        if (!targets) return;
        if (action === "apply") send("apply", { targets, payload });
        else if (action === "save") send("saves", { targets, save: payload.save, dc: payload.dc, rollMode });
        else if (action === "effect") send("effect", { targets, entryId: payload.entryId, level: payload.level || 1, rounds: 0 });
        else send("card", { action, targets, payload: payload || {}, rollMode });
      },
      drop: ({ data: dropped, x, y, groundId }, view) => {
        if (!String(dropped.kind || "").startsWith("pf1e.")) return false;
        if (dropped.kind !== "pf1e.monster") view.toast("Drop that on a character sheet.");
        else if (!view.gm) view.toast("Only the game master places monsters.");
        else send("spawn", { entryId: dropped.id, sceneId: view.scene.id, groundId: groundId || "", x, y });
        return true;
      },
      tabs: () => (libraryHost ? [{ id: "library", label: "Library", icon: "sparkle", panel: libraryHost.id }] : []),
    },
  });

  Application.events.on("easel.pf1e.state", (state) => {
    data = state;
    buildLibrary();
    renderLibrary();
    table.render();
  });
  Application.events.on("easel.pf1e.sheet", ({ actorId, sheet }) => {
    if (!open.has(actorId)) return;
    sheets.set(actorId, sheet);
    table.render();
  });
  Application.events.on("easel.pf1e.entries", ({ kind, entries: found }) => {
    library.set(kind, found);
    renderLibrary();
  });
  Application.events.on("easel.pf1e.entry", ({ entry }) => {
    entries.set(entry.id, entry);
    for (const resolve of waiting.get(entry.id) || []) resolve(entry);
    waiting.delete(entry.id);
    table.windows.get("entry:" + entry.id)?.update?.();
  });
  Application.events.on("easel.pf1e.error", ({ message }) => {
    table.toast(message, "error");
    for (const [id, list] of waiting) {
      for (const resolve of list) resolve(null);
      waiting.delete(id);
    }
  });
  Application.events.on("easel.pf1e.notice", ({ message }) => table.toast(message));
  Application.events.on("easel.pf1e.changed", ({ library: reload }) => {
    send("refresh");
    for (const id of open) send("open", { actorId: id });
    if (reload) {
      const loaded = [...library.keys()];
      library.clear();
      entries.clear();
      for (const kind of loaded) send("library", { kind });
    }
  });
  Application.onReady(() => send("refresh"));
}
