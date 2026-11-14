import { Component, h, icon, iconButton, button, safeUrl, initials } from "./ui.mjs";
import { ensureStyles, signed, title, attackLine, statblock, damageType } from "./format.mjs";
import { sectionTypes } from "./registry.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];
const ITEM_GROUPS = [["weapon", "Weapons"], ["armor", "Armor"], ["shield", "Shields"], ["magic", "Magic items"], ["consumable", "Consumables"], ["ammo", "Ammunition"], ["gear", "Gear"]];
const STATUS = { ok: "", staggered: "Staggered", disabled: "Disabled", dying: "Dying", stable: "Stable", unconscious: "Unconscious", dead: "Dead", destroyed: "Destroyed" };
const ORDINAL = ["Cantrips", "1st level", "2nd level", "3rd level", "4th level", "5th level", "6th level", "7th level", "8th level", "9th level"];

export default class Sheet extends Component {
  constructor() {
    super("easel.pf1e.sheet", "div");
    ensureStyles();
    this.element.classList.add("pf-sheet");
    this.tab = "main";
    this.open = new Set();
    this.amount = "";
    this.bonus = "";
    this.picker = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif,image/svg+xml", hidden: true });
    this.picker.addEventListener("change", () => {
      if (this.picker.files[0]) this.emit("image", { file: { file: this.picker.files[0] } });
      this.picker.value = "";
    });
    this.on(this.element, "dragover", (event) => {
      if ([...event.dataTransfer.types].includes("application/x-easel-kit")) event.preventDefault();
    });
    this.on(this.element, "drop", (event) => {
      try {
        const data = JSON.parse(event.dataTransfer.getData("application/x-easel-kit") || "{}");
        if (!data.id || !String(data.kind || "").startsWith("pf1e.")) return;
        event.preventDefault();
        event.stopPropagation();
        this.emit("request", { what: "drop", data: { id: String(data.id), kind: String(data.kind).slice(5) } });
      } catch {}
    });
  }

  get sheet() {
    return this.props.sheet || {};
  }

  get canWrite() {
    return !!this.sheet.canWrite;
  }

  get canControl() {
    return !!this.sheet.canControl;
  }

  set(path, value) {
    this.emit("set", { path: String(path), value: { value } });
  }

  roll(kind, id, options = {}) {
    const bonus = Number(this.bonus);
    this.emit("roll", { kind, id: String(id), options: { ...(Number.isFinite(bonus) && bonus ? { bonus } : {}), ...options } });
  }

  act(action, data = {}) {
    this.emit("action", { action, data });
  }

  number(path, value, label, extra = {}, apply) {
    const node = h("input", { type: "number", class: "pf-num", value: value === null || value === undefined ? "" : value, disabled: !this.canWrite, "aria-label": label, title: label, dataset: { path }, ...extra });
    node.addEventListener("change", () => {
      const number = Number(node.value);
      if (node.value === "" && extra.blank) return apply ? apply(null) : this.set(path, null);
      if (node.value === "" || !Number.isFinite(number)) {
        node.value = value === null || value === undefined ? "" : value;
        return;
      }
      if (apply) apply(number);
      else this.set(path, number);
    });
    node.addEventListener("click", (event) => event.stopPropagation());
    return node;
  }

  text(path, value, label, placeholder = "", apply) {
    const node = h("input", { type: "text", value: value || "", disabled: !this.canWrite, "aria-label": label, placeholder, dataset: { path } });
    node.addEventListener("change", () => (apply ? apply(node.value) : this.set(path, node.value)));
    return node;
  }

  select(path, value, options, label) {
    const node = h("select", { disabled: !this.canWrite, "aria-label": label, dataset: { path } });
    for (const [id, name] of options) node.append(h("option", { value: id, selected: id === value, text: name }));
    node.addEventListener("change", () => this.set(path, node.value));
    return node;
  }

  check(checked, label, apply, disabled = false) {
    const node = h("button", { type: "button", class: "ez-switch", role: "switch", "aria-checked": String(!!checked), "aria-label": label, title: label, disabled });
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      apply(!checked);
    });
    return node;
  }

  tile(label, value, sub, onRoll, tip = "") {
    const node = h(onRoll && this.canControl ? "button" : "div", { class: "pf-tile", title: tip || (onRoll ? "Roll " + label : ""), ...(onRoll && this.canControl ? { type: "button" } : {}) }, h("span", { class: "ez-eyebrow", text: label }), h("strong", { text: value }), sub ? h("span", { class: "pf-tile-sub", text: sub }) : null);
    if (onRoll && this.canControl) node.addEventListener("click", onRoll);
    return node;
  }

  parts(parts) {
    return list(parts)
      .filter((part) => part && part.value)
      .map((part) => part.label + " " + signed(part.value))
      .join("\n");
  }

  block(titleText, ...children) {
    const node = h("section", { class: "pf-block" });
    if (titleText) node.append(h("h4", { class: "ez-eyebrow", text: titleText }));
    for (const child of children.flat()) if (child) node.append(child);
    return node;
  }

  empty(text) {
    return h("div", { class: "pf-empty", text });
  }

  header(sheet, derived) {
    const portrait = h("div", { class: "ez-sheet-portrait", title: this.canWrite ? "Change portrait" : "" });
    const image = safeUrl(sheet.portrait);
    if (image) portrait.append(h("img", { src: image, alt: "" }));
    else portrait.textContent = initials(sheet.name);
    if (this.canWrite) portrait.addEventListener("click", () => this.picker.click());
    const name = h("input", { type: "text", class: "ez-sheet-name", value: sheet.name || "", disabled: !this.canWrite, "aria-label": "Name", dataset: { path: "@name" } });
    name.addEventListener("change", () => this.emit("rename", { name: name.value }));
    const hp = derived.hp || { current: 0, max: 0, temp: 0, nonlethal: 0, status: "ok" };
    const ratio = hp.max > 0 ? Math.max(0, Math.min(1, hp.current / hp.max)) : 0;
    const amount = h("input", { type: "number", class: "pf-num", min: 0, placeholder: "0", value: this.amount, "aria-label": "Hit point change", dataset: { path: "@amount" } });
    amount.addEventListener("input", () => (this.amount = amount.value));
    const apply = (action) => () => {
      const value = Math.abs(Number(amount.value));
      if (!value) return amount.focus();
      this.amount = "";
      this.act(action, { amount: value });
    };
    const controls = this.canControl ? h("div", { class: "pf-hp-controls" }, amount, button("Damage", { kind: "small ez-btn-danger", onClick: apply("damage") }), button("Heal", { kind: "small", onClick: apply("heal") })) : null;
    const status = STATUS[hp.status] ? h("span", { class: "ez-chip ez-chip-danger", text: STATUS[hp.status] }) : null;
    const health = h(
      "div",
      { class: "pf-hp", title: this.parts(hp.parts) },
      h("div", { class: "pf-hp-line" }, h("span", { class: "ez-eyebrow", text: "Hit points" }), status),
      h("div", { class: "pf-hp-value" }, h("strong", { text: String(hp.current) }), h("span", { text: " / " + hp.max }), hp.temp ? h("span", { class: "pf-hp-temp", text: "+" + hp.temp + " temporary" }) : null, hp.nonlethal ? h("span", { class: "pf-hp-temp", text: hp.nonlethal + " nonlethal" }) : null),
      h("div", { class: "ez-bar", dataset: { level: ratio > 0.5 ? "high" : ratio > 0.25 ? "mid" : "low" } }, h("span", { style: { width: ratio * 100 + "%" } })),
      controls,
    );
    return h("header", { class: "pf-head" }, portrait, h("div", { class: "ez-sheet-id" }, name, h("div", { class: "pf-summary", text: sheet.summary || "" })), health);
  }

  abilities(doc, derived, built) {
    const names = (this.props.system || {}).abilityNames || {};
    const grid = h("div", { class: "pf-abilities" });
    for (const ability of ABILITIES) {
      const value = derived.abilities[ability];
      const raw = doc.abilities[ability] || {};
      const cell = h("div", { class: "pf-ability", title: this.parts(value.parts) });
      const roll = h("button", { type: "button", class: "pf-ability-mod", disabled: !this.canControl, title: "Roll " + (names[ability] || ability), text: value.score === null ? "—" : signed(value.mod) });
      roll.addEventListener("click", () => this.roll("ability", ability));
      cell.append(h("span", { class: "ez-eyebrow", text: (names[ability] || ability).slice(0, 3) }), roll, h("span", { class: "pf-ability-score", text: value.score === null ? "—" : String(value.score) }));
      const edit = h("div", { class: "pf-ability-edit" });
      if (built) edit.append(h("label", {}, h("span", { text: "Base" }), this.number("abilities." + ability + ".base", raw.base, (names[ability] || ability) + " base score", { min: 0, max: 99 })));
      edit.append(h("label", {}, h("span", { text: "Damage" }), this.number("abilities." + ability + ".damage", raw.damage || 0, (names[ability] || ability) + " damage", { min: 0, max: 99 })));
      cell.append(edit);
      grid.append(cell);
    }
    return grid;
  }

  defenses(derived) {
    const system = this.props.system || {};
    const row = h("div", { class: "pf-tiles" });
    row.append(this.tile("AC", String(derived.ac.total), "touch " + derived.ac.touch + " · flat " + derived.ac.flat, null, this.parts(derived.ac.parts)));
    for (const [id, save] of Object.entries(derived.saves || {})) row.append(this.tile(((system.saves || {})[id] || {}).name || id, signed(save.total), "", () => this.roll("save", id), this.parts(save.parts)));
    row.append(this.tile("Initiative", signed(derived.init.total), "", () => this.roll("initiative", "init"), this.parts(derived.init.parts)));
    const speed = derived.speed || {};
    row.append(this.tile("Speed", speed.land + " ft.", ["fly", "swim", "climb", "burrow"].filter((mode) => speed[mode]).map((mode) => mode + " " + speed[mode]).join(" · ")));
    row.append(this.tile("Base attack", signed(derived.bab), ""));
    if (derived.maneuvers) {
      row.append(this.tile("CMB", signed(derived.maneuvers.cmb), "", () => this.roll("cmb", "cmb"), this.parts(derived.maneuvers.cmbParts)));
      row.append(this.tile("CMD", String(derived.maneuvers.cmd), derived.maneuvers.cmdFlat !== undefined ? "flat " + derived.maneuvers.cmdFlat : derived.maneuvers.cmdNotes || ""));
    }
    return row;
  }

  resist(derived) {
    const defenses = derived.defenses || {};
    const rows = [];
    if (list(defenses.dr).length) rows.push(["Damage reduction", defenses.dr.map((entry) => entry.amount + "/" + entry.bypass).join(", ")]);
    if (Object.keys(defenses.resist || {}).length) rows.push(["Resistances", Object.entries(defenses.resist).map(([type, amount]) => type + " " + amount).join(", ")]);
    if (list(defenses.immune).length) rows.push(["Immune", defenses.immune.join(", ")]);
    if (list(defenses.vulnerable).length) rows.push(["Vulnerable", defenses.vulnerable.join(", ")]);
    if (defenses.sr) rows.push(["Spell resistance", String(defenses.sr)]);
    if (list(derived.senses).length) rows.push(["Senses", derived.senses.join(", ")]);
    if (list(derived.casting).some((caster) => caster.spellFailure)) rows.push(["Arcane spell failure", derived.spellFailure + "%"]);
    if (derived.acp) rows.push(["Armor check penalty", String(derived.acp)]);
    if (derived.armor && !derived.armor.proficient) rows.push(["Armor", "Not proficient: the check penalty applies to attack rolls"]);
    if (!rows.length) return null;
    return this.block("Defenses and senses", h("div", { class: "ez-rows" }, rows.map(([label, value]) => h("div", { class: "ez-row" }, h("span", { class: "ez-row-main pf-muted", text: label }), h("span", { class: "pf-value", text: value })))));
  }

  main(sheet, doc, derived) {
    const system = this.props.system || {};
    const page = [];
    if (doc.mode === "statblock") {
      page.push(this.defenses(derived), this.abilities(doc, derived, false), this.block("", statblock(doc.statblock || {}, sheet.name, doc.size)));
      return page;
    }
    page.push(this.abilities(doc, derived, true), this.defenses(derived));
    const classes = h("div", { class: "pf-chips" });
    for (const level of list(derived.levels)) {
      const chip = h("span", { class: "ez-chip ez-chip-primary" }, level.name + " " + level.level);
      if (this.canWrite) chip.append(iconButton("minus", "Remove a level of " + level.name, () => this.emit("request", { what: "levelDown", data: { classId: level.classId, name: level.name } }), "pf-chip-btn"));
      classes.append(chip);
    }
    if (this.canWrite) classes.append(button(derived.level ? "Level up" : "Choose a class", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => this.emit("request", { what: "levelUp", data: {} }) }));
    const race = h("div", { class: "pf-chips" }, doc.race ? h("span", { class: "ez-chip", text: doc.race.name }) : h("span", { class: "pf-muted", text: "No race chosen" }));
    if (this.canWrite) race.append(button(doc.race ? "Change" : "Choose a race", { kind: "small ez-btn-ghost", onClick: () => this.emit("request", { what: "race", data: {} }) }));
    const hints = [];
    if (derived.skillPoints) hints.push("Skill ranks " + derived.skillPoints.spent + " of " + derived.skillPoints.total);
    if (derived.feats) hints.push("Feats " + derived.feats.count + " of " + derived.feats.allowed);
    if (derived.abilityIncreases) hints.push("Ability increases earned: " + derived.abilityIncreases);
    const over = (derived.skillPoints && derived.skillPoints.spent > derived.skillPoints.total) || (derived.feats && derived.feats.count > derived.feats.allowed);
    page.push(this.block("Race and class", h("div", { class: "ez-rows" }, h("div", { class: "ez-row" }, h("span", { class: "ez-row-main pf-muted", text: "Race" }), race), h("div", { class: "ez-row" }, h("span", { class: "ez-row-main pf-muted", text: "Class" }), classes)), h("div", { class: "pf-hint", dataset: { warn: String(!!over) }, text: hints.join(" · ") })));
    const field = (label, control) => h("label", { class: "ez-row" }, h("span", { class: "ez-row-main pf-muted", text: label }), control);
    const details = doc.details || {};
    page.push(
      this.block(
        "Details",
        h(
          "div",
          { class: "ez-rows pf-details" },
          field("Alignment", this.select("details.alignment", details.alignment || "", [["", "—"], ...list(system.alignments).map((id) => [id, id])], "Alignment")),
          field("Size", this.select("size", doc.size, Object.entries(system.sizes || {}), "Size")),
          field("Deity", this.text("details.deity", details.deity, "Deity")),
          field("Languages", this.text("details.languages", details.languages, "Languages")),
          field("Experience", this.number("xp", doc.xp || 0, "Experience points", { min: 0 })),
          field("Base speed", this.number("speed.land", (doc.speed || {}).land, "Base land speed", { min: 0, step: 5 })),
          field("Favored class hit points", this.number("favored.hp", (doc.favored || {}).hp || 0, "Favored class bonus hit points", { min: 0 })),
          field("Favored class skill ranks", this.number("favored.skill", (doc.favored || {}).skill || 0, "Favored class bonus skill ranks", { min: 0 })),
        ),
      ),
    );
    page.push(this.resist(derived));
    return page;
  }

  attacks(doc, derived, wanted) {
    const rows = h("div", { class: "pf-attacks" });
    for (const attack of list(derived.attacks).filter(wanted || (() => true))) {
      const text = attackLine(attack);
      const item = doc.items.find((entry) => "item:" + entry.uid === attack.id);
      const tags = [attack.kind === "ranged" ? (attack.range ? attack.range + " ft." : "ranged") : attack.reach ? "reach" : "", text.crit, attack.nonlethal ? "nonlethal" : "", attack.proficient === false ? "not proficient" : "", attack.notes || ""].filter(Boolean);
      const row = h("div", { class: "pf-attack", title: this.parts(attack.attackParts) }, h("div", { class: "pf-attack-main" }, h("strong", { text: title(attack.name) }), h("span", { class: "pf-muted", text: tags.join(" · ") })), h("span", { class: "pf-attack-bonus", text: text.bonus || "—" }), h("span", { class: "pf-attack-damage", text: text.damage }));
      const actions = h("div", { class: "pf-attack-actions" });
      if (item && item.weapon && item.weapon.handed === "one") actions.append(this.chipToggle("Two hands", !!doc.toggles["twohand:" + item.uid], (on) => this.act("toggle", { id: "twohand:" + item.uid, on })));
      if (item && item.weapon && item.weapon.thrown && item.weapon.group !== "ranged") actions.append(this.chipToggle("Thrown", !!doc.toggles["thrown:" + item.uid], (on) => this.act("toggle", { id: "thrown:" + item.uid, on })));
      if (this.canControl && list(attack.bonuses).length) {
        actions.append(button("Attack", { kind: "small ez-btn-primary", onClick: () => this.roll("attack", attack.id, { full: false }) }));
        if (attack.bonuses.length > 1) actions.append(button("Full", { kind: "small", title: "Full attack: every attack in the sequence", onClick: () => this.roll("attack", attack.id, { full: true }) }));
      }
      row.append(actions);
      rows.append(row);
    }
    return rows;
  }

  chipToggle(label, on, apply) {
    const node = h("button", { type: "button", class: "ez-chip pf-chip-toggle" + (on ? " ez-chip-primary" : ""), "aria-pressed": String(!!on), disabled: !this.canControl, text: label });
    node.addEventListener("click", () => apply(!on));
    return node;
  }

  toggles(derived) {
    if (!list(derived.toggles).length) return null;
    return this.block("Switch on when used", h("div", { class: "pf-chips" }, derived.toggles.map((toggle) => this.chipToggle(toggle.label, toggle.on, (on) => this.act("toggle", { id: toggle.id, on })))));
  }

  conditions(doc) {
    const conditions = (this.props.system || {}).conditions || {};
    const active = new Set(doc.conditions || []);
    const chips = h("div", { class: "pf-chips" });
    for (const [id, condition] of Object.entries(conditions)) {
      const chip = this.chipToggle(condition.name, active.has(id), (on) => this.act("condition", { id, on }));
      chip.title = condition.text;
      chips.append(chip);
    }
    return this.block("Conditions", chips);
  }

  combat(sheet, doc, derived) {
    const bonus = h("input", { type: "number", class: "pf-num", value: this.bonus, placeholder: "0", "aria-label": "Situational bonus", dataset: { path: "@bonus" } });
    bonus.addEventListener("input", () => (this.bonus = bonus.value));
    const notes = list(derived.notes).filter((note) => !note.target.startsWith("skill."));
    return [
      this.defenses(derived),
      this.block("Attacks", this.attacks(doc, derived), this.canControl ? h("label", { class: "pf-inline" }, h("span", { class: "pf-muted", text: "Situational bonus on the next rolls" }), bonus) : null),
      this.toggles(derived),
      this.conditions(doc),
      notes.length ? this.block("Remember", h("ul", { class: "pf-list" }, notes.map((note) => h("li", {}, h("strong", { text: note.source + ": " }), note.text)))) : null,
      this.resist(derived),
    ];
  }

  skills(sheet, doc, derived) {
    const system = this.props.system || {};
    const built = doc.mode !== "statblock";
    const table = h("div", { class: "pf-skills" });
    const entries = Object.entries(derived.skills || {}).sort((a, b) => a[1].name.localeCompare(b[1].name));
    for (const [id, skill] of entries) {
      if (!built && !skill.listed && !skill.usable) continue;
      const row = h("div", { class: "pf-skill", dataset: { usable: String(!!skill.usable) }, title: this.parts(skill.parts) });
      const dot = h("span", { class: "pf-dot", dataset: { on: String(!!skill.classSkill) }, title: skill.classSkill ? "Class skill" : "Not a class skill" });
      const roll = h("button", { type: "button", class: "pf-skill-total", disabled: !this.canControl || !skill.usable, title: skill.usable ? "Roll " + skill.name : "Cannot be used untrained", text: signed(skill.total) });
      roll.addEventListener("click", (event) => this.roll("skill", id, event.shiftKey ? { take: 10 } : {}));
      row.append(dot, h("span", { class: "pf-skill-name" }, skill.name, h("span", { class: "pf-muted", text: " " + title(skill.ability) + (skill.trained ? " · trained only" : "") })), roll);
      if (built) {
        const raw = doc.skills[id] || {};
        row.append(this.number("skills." + id + ".ranks", raw.ranks || 0, skill.name + " ranks", { min: 0, max: 40 }), this.number("skills." + id + ".misc", raw.misc || 0, skill.name + " other bonus", { min: -99, max: 99 }));
        if (id.includes(":") && this.canWrite) row.append(iconButton("trash", "Remove " + skill.name, () => this.act("skillRemove", { id })));
        else row.append(h("span", {}));
      }
      table.append(row);
    }
    const head = built ? h("div", { class: "pf-skill pf-skill-head" }, h("span", {}), h("span", { text: "Skill" }), h("span", { text: "Total" }), h("span", { text: "Ranks" }), h("span", { text: "Other" }), h("span", {})) : null;
    const points = derived.skillPoints;
    const groups = Object.entries(system.skills || {}).filter(([, skill]) => skill.group);
    return [
      this.block(
        "Skills",
        points ? h("div", { class: "pf-hint", dataset: { warn: String(points.spent > points.total) }, text: "Ranks spent: " + points.spent + " of " + points.total + ". No skill can have more than " + points.max + " ranks. Shift-click a total to take 10." }) : null,
        head,
        table,
        built && this.canWrite && groups.length ? h("div", { class: "pf-actions" }, groups.map(([id, skill]) => button("Add " + skill.name, { kind: "small ez-btn-ghost", iconName: "plus", onClick: () => this.emit("request", { what: "skill", data: { base: id, name: skill.name } }) }))) : null,
      ),
    ];
  }

  spells(sheet, doc, derived) {
    const page = [];
    for (const caster of list(derived.casting)) {
      const names = (this.props.system || {}).abilityNames || {};
      const head = h("div", { class: "pf-tiles" }, this.tile("Caster level", String(caster.casterLevel), "", () => this.roll("casterLevel", caster.key)), this.tile("Concentration", signed(caster.concentration), "", () => this.roll("concentration", caster.key)), this.tile(names[caster.ability] || caster.ability, signed(caster.abilityMod), caster.type === "prepared" ? "prepares spells" : "casts spontaneously"));
      if (caster.spellFailure) head.append(this.tile("Spell failure", caster.spellFailure + "%", "from armor"));
      const block = this.block(caster.name + " spells", head);
      for (const level of caster.levels) {
        const known = caster.spells.filter((spell) => spell.level === level.level).sort((a, b) => a.name.localeCompare(b.name));
        const prepared = caster.prepared.filter((spell) => spell.level === level.level);
        const section = h("div", { class: "pf-spell-level" });
        let slots;
        if (level.unlimited) slots = caster.type === "prepared" ? prepared.length + " of " + level.prepares + " prepared · cast at will" : "At will";
        else if (caster.type === "prepared") slots = prepared.filter((spell) => !spell.cast).length + " of " + level.slots + " left";
        else slots = Math.max(0, level.slots - level.used) + " of " + level.slots + " slots left";
        const headRow = h("div", { class: "pf-spell-head" }, h("strong", { text: ORDINAL[level.level] || "Level " + level.level }), h("span", { class: "pf-muted", text: "DC " + level.dc + (level.known !== null && level.known !== undefined ? " · knows " + known.length + " of " + level.known : "") }), h("span", { class: "ez-chip", text: level.able ? slots : "Ability score too low" }));
        if (caster.type !== "prepared" && !level.unlimited && this.canWrite && level.used > 0) headRow.append(iconButton("undo", "Give back a slot", () => this.set("casting." + caster.key + ".used." + level.level, Math.max(0, level.used - 1))));
        section.append(headRow);
        if (caster.type === "prepared" && prepared.length) {
          const row = h("div", { class: "pf-prepared" });
          for (const spell of prepared) {
            const chip = h("span", { class: "ez-chip pf-prepared-spell" + (spell.cast ? "" : " ez-chip-primary"), dataset: { cast: String(!!spell.cast) } }, h("span", { text: spell.name }));
            if (this.canControl && !spell.cast) chip.append(iconButton("bolt", "Cast " + spell.name, () => this.roll("spell", spell.spellUid, { key: caster.key, prepared: spell.uid }), "pf-chip-btn"));
            if (this.canWrite && spell.cast) chip.append(iconButton("undo", "Recover " + spell.name, () => this.act("recoverSpell", { key: caster.key, uid: spell.uid }), "pf-chip-btn"));
            if (this.canWrite) chip.append(iconButton("close", "Unprepare " + spell.name, () => this.emit("remove", { list: "prepared:" + caster.key, uid: spell.uid }), "pf-chip-btn"));
            row.append(chip);
          }
          section.append(row);
        }
        const rows = h("div", { class: "ez-rows" });
        for (const spell of known) {
          const row = h("div", { class: "ez-row pf-spell" });
          const name = h("button", { type: "button", class: "pf-link", text: spell.name });
          name.addEventListener("click", () => this.emit("view", { id: String(spell.entryId) }));
          row.append(h("span", { class: "ez-row-main" }, name, h("span", { class: "pf-muted", text: " " + (spell.school || "") })));
          if (caster.type === "prepared" && this.canWrite && level.able) row.append(button("Prepare", { kind: "small ez-btn-ghost", onClick: () => this.act("prepare", { key: caster.key, uid: spell.uid }) }));
          if (caster.type !== "prepared" && this.canControl && level.able) row.append(button("Cast", { kind: "small ez-btn-primary", onClick: () => this.roll("spell", spell.uid, { key: caster.key }) }));
          if (this.canWrite) row.append(iconButton("trash", "Forget " + spell.name, () => this.emit("remove", { list: "spells:" + caster.key, uid: spell.uid })));
          rows.append(row);
        }
        if (!known.length) rows.append(this.empty(caster.type === "prepared" ? "No spells of this level in the spellbook or list yet." : "No spells of this level known yet."));
        section.append(rows);
        block.append(section);
      }
      if (this.canWrite) block.append(h("div", { class: "pf-actions" }, button("Add a spell", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => this.emit("request", { what: "add", data: { kind: "spell", key: caster.key, list: caster.list } }) })));
      page.push(block);
    }
    return page;
  }

  itemEditor(item) {
    const change = (key) => (value) => this.emit("item", { uid: item.uid, changes: { [key]: value } });
    const field = (label, control) => h("label", { class: "pf-field" }, h("span", { text: label }), control);
    const grid = h("div", { class: "pf-item-edit" });
    grid.append(field("Name", this.text("@item-name-" + item.uid, item.name, "Name", "", change("name"))), field("Weight", this.number("@item-weight-" + item.uid, item.weight, "Weight", { min: 0, step: "any" }, change("weight"))), field("Price (gp)", this.number("@item-price-" + item.uid, item.price, "Price", { min: 0, step: "any" }, change("price"))));
    if (item.weapon || item.armor) grid.append(field("Enhancement", this.number("@item-enh-" + item.uid, item.enhancement || 0, "Enhancement bonus", { min: 0, max: 10 }, change("enhancement"))), field("Masterwork", this.check(item.masterwork, "Masterwork", change("masterwork"), !this.canWrite)));
    if (item.weapon) {
      grid.append(field("Damage (Medium)", this.text("@item-dmg-" + item.uid, item.weapon.damage, "Damage dice", "1d8", change("weapon.damage"))), field("Threat range from", this.number("@item-cr-" + item.uid, item.weapon.critRange, "Critical threat range", { min: 2, max: 20 }, change("weapon.critRange"))), field("Critical ×", this.number("@item-cm-" + item.uid, item.weapon.critMult, "Critical multiplier", { min: 2, max: 6 }, change("weapon.critMult"))), field("Damage type", this.text("@item-dt-" + item.uid, item.weapon.damageType, "Damage type", "S", change("weapon.damageType"))));
      if (item.weapon.strDamage === "composite") grid.append(field("Strength rating", this.number("@item-sr-" + item.uid, item.weapon.strRating || 0, "Composite bow Strength rating", { min: 0, max: 20 }, change("weapon.strRating"))));
      if (item.weapon.handed !== "two" && item.weapon.group !== "ranged") grid.append(field("Off hand", this.check(item.weapon.offhand, "Wielded in the off hand", change("weapon.offhand"), !this.canWrite)));
    }
    if (item.armor) grid.append(field("Armor bonus", this.number("@item-ab-" + item.uid, item.armor.bonus, "Armor bonus", { min: 0, max: 30 }, change("armor.bonus"))), field("Maximum Dex", this.number("@item-md-" + item.uid, item.armor.maxDex, "Maximum Dexterity bonus", { min: 0, max: 20, blank: true }, change("armor.maxDex"))), field("Check penalty", this.number("@item-acp-" + item.uid, item.armor.acp, "Armor check penalty", { min: -20, max: 0 }, change("armor.acp"))), field("Spell failure %", this.number("@item-sf-" + item.uid, item.armor.spellFailure, "Arcane spell failure", { min: 0, max: 100 }, change("armor.spellFailure"))));
    if (item.uses) grid.append(field("Used", this.number("@item-used-" + item.uid, item.uses.used || 0, "Charges used", { min: 0 }, change("uses.used"))), field("Of", this.number("@item-max-" + item.uid, item.uses.max || 0, "Charges", { min: 0 }, change("uses.max"))));
    const wrap = h("div", { class: "pf-item-detail" }, grid);
    if (item.description) wrap.append(h("p", { class: "pf-text", text: item.description }));
    if (item.entryId) wrap.append(button("Library entry", { kind: "small ez-btn-ghost", iconName: "book", onClick: () => this.emit("view", { id: String(item.entryId) }) }));
    return wrap;
  }

  gear(sheet, doc, derived) {
    const page = [];
    const coins = h("div", { class: "pf-coins" });
    for (const coin of ["pp", "gp", "sp", "cp"]) coins.append(h("label", {}, h("span", { class: "ez-eyebrow", text: coin }), this.number("currency." + coin, (doc.currency || {})[coin] || 0, coin.toUpperCase(), { min: 0 })));
    const load = derived.encumbrance;
    const loadLine = load ? h("div", { class: "pf-hint", dataset: { warn: String(load.load !== "light") }, text: "Carrying " + load.weight + " lb. — " + load.load + " load (light to " + load.light + ", medium to " + load.medium + ", heavy to " + load.heavy + ")" }) : null;
    page.push(this.block("Coins and load", coins, loadLine));
    const items = list(doc.items);
    const groups = this.block("Carried");
    for (const [type, label] of ITEM_GROUPS) {
      const members = items.filter((item) => (ITEM_GROUPS.some(([known]) => known === item.type) ? item.type : "gear") === type);
      if (!members.length) continue;
      groups.append(h("h5", { class: "pf-subhead", text: label }));
      const rows = h("div", { class: "ez-rows" });
      for (const item of members) {
        const open = this.open.has(item.uid);
        const row = h("div", { class: "ez-row pf-item" });
        const equippable = ["weapon", "armor", "shield", "magic"].includes(item.type) || list(item.changes).length;
        row.append(equippable ? this.check(item.equipped, (item.equipped ? "Unequip " : "Equip ") + item.name, (on) => this.emit("item", { uid: item.uid, changes: { equipped: on } }), !this.canWrite) : h("span", { class: "pf-switch-gap" }));
        const name = h("button", { type: "button", class: "pf-link", text: item.name + (Number(item.enhancement) > 0 ? " +" + item.enhancement : item.masterwork ? " (masterwork)" : "") });
        name.addEventListener("click", () => {
          if (open) this.open.delete(item.uid);
          else this.open.add(item.uid);
          this.render(this.props);
        });
        const sub = item.weapon ? item.weapon.damage + " " + damageType(item.weapon.damageType) : item.armor ? signed(item.armor.bonus + (Number(item.enhancement) || 0)) + " AC" : item.uses ? Math.max(0, Number(item.uses.max) - Number(item.uses.used)) + " of " + item.uses.max + " left" : "";
        row.append(h("span", { class: "ez-row-main" }, name, sub ? h("span", { class: "pf-muted", text: " " + sub }) : null));
        if (item.use && this.canControl) row.append(button("Use", { kind: "small ez-btn-primary", onClick: () => this.roll("item", item.uid) }));
        row.append(this.number("@item-qty-" + item.uid, item.quantity, "Quantity of " + item.name, { min: 0, step: "any" }, (value) => this.emit("item", { uid: item.uid, changes: { quantity: value } })), h("span", { class: "pf-weight pf-muted", text: item.weight ? Math.round(item.weight * (Number(item.quantity) || 0) * 10) / 10 + " lb." : "" }));
        if (this.canWrite) row.append(iconButton("trash", "Remove " + item.name, () => this.emit("remove", { list: "items", uid: item.uid })));
        rows.append(row);
        if (open) rows.append(this.itemEditor(item));
      }
      groups.append(rows);
    }
    if (!items.length) groups.append(this.empty("Nothing carried. Add items here, or drag them from the library."));
    if (this.canWrite) groups.append(h("div", { class: "pf-actions" }, button("Add an item", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => this.emit("request", { what: "add", data: { kind: "item" } }) })));
    page.push(groups);
    return page;
  }

  features(sheet, doc, derived) {
    const page = [];
    const feats = this.block("Feats");
    const rows = h("div", { class: "ez-rows" });
    for (const feat of list(doc.feats)) {
      const name = h("button", { type: "button", class: "pf-link", text: feat.name });
      name.addEventListener("click", () => this.emit("view", { id: String(feat.entryId) }));
      const row = h("div", { class: "ez-row pf-feature" }, h("div", { class: "ez-row-main" }, name, h("p", { class: "pf-text", text: feat.text || "" })));
      if (this.canWrite) row.append(iconButton("trash", "Remove " + feat.name, () => this.emit("remove", { list: "feats", uid: feat.uid })));
      rows.append(row);
    }
    if (doc.mode === "statblock" && derived.feats && list(derived.feats.names).length) rows.append(h("div", { class: "ez-row" }, h("span", { class: "ez-row-main", text: derived.feats.names.join(", ") })));
    else if (!list(doc.feats).length) rows.append(this.empty("No feats yet."));
    feats.append(rows);
    if (derived.feats && doc.mode !== "statblock") feats.append(h("div", { class: "pf-hint", dataset: { warn: String(derived.feats.count > derived.feats.allowed) }, text: derived.feats.count + " of " + derived.feats.allowed + " feats chosen" }));
    if (this.canWrite && doc.mode !== "statblock") feats.append(h("div", { class: "pf-actions" }, button("Add a feat", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => this.emit("request", { what: "add", data: { kind: "feat" } }) })));
    page.push(feats);
    const featureRows = h("div", { class: "ez-rows" });
    for (const feature of list(derived.features)) {
      const row = h("div", { class: "ez-row pf-feature" });
      const main = h("div", { class: "ez-row-main" }, h("strong", { text: feature.name }), h("span", { class: "pf-muted", text: " " + [feature.source, feature.level ? "level " + feature.level : ""].filter(Boolean).join(" · ") }), h("p", { class: "pf-text", text: feature.text || "" }));
      row.append(main);
      if (feature.uses) {
        const left = Math.max(0, feature.uses.max - feature.uses.used);
        row.append(h("span", { class: "ez-chip", text: left + " of " + feature.uses.max + (feature.uses.unit ? " " + feature.uses.unit : "") + " left" }));
        if (this.canWrite && feature.uses.used > 0) row.append(iconButton("undo", "Give back a use", () => this.set("uses." + feature.key, Math.max(0, feature.uses.used - 1))));
      }
      if ((feature.uses || feature.roll) && this.canControl) row.append(button("Use", { kind: "small ez-btn-primary", onClick: () => this.roll("feature", feature.key) }));
      if (feature.own && this.canWrite) row.append(iconButton("trash", "Remove " + feature.name, () => this.emit("remove", { list: "features", uid: feature.uid })));
      featureRows.append(row);
    }
    if (!list(derived.features).length) featureRows.append(this.empty("Class features appear here as levels are gained."));
    const features = this.block("Class features and abilities", featureRows);
    if (this.canWrite && doc.mode !== "statblock") features.append(h("div", { class: "pf-actions" }, button("Add a feature", { kind: "small ez-btn-ghost", iconName: "plus", onClick: () => this.emit("request", { what: "feature", data: {} }) })));
    page.push(features);
    if (doc.race && list(doc.race.traits).length) page.push(this.block(doc.race.name + " traits", h("div", { class: "ez-rows" }, doc.race.traits.map((trait) => h("div", { class: "ez-row pf-feature" }, h("div", { class: "ez-row-main" }, h("strong", { text: trait.name }), h("p", { class: "pf-text", text: trait.text })))))));
    return page;
  }

  effects(sheet, doc, derived) {
    const page = [];
    const rows = h("div", { class: "ez-rows" });
    for (const buff of list(doc.buffs)) {
      const name = h("button", { type: "button", class: "pf-link", text: buff.name });
      name.addEventListener("click", () => buff.entryId && this.emit("view", { id: String(buff.entryId) }));
      const row = h("div", { class: "ez-row pf-feature" }, this.check(buff.active, (buff.active ? "Switch off " : "Switch on ") + buff.name, (on) => this.act("buff", { uid: buff.uid, active: on }), !this.canControl), h("div", { class: "ez-row-main" }, name, h("p", { class: "pf-text", text: buff.text || "" })));
      if (buff.leveled) row.append(h("label", { class: "pf-mini" }, h("span", { text: "Level" }), this.number("@buff-level-" + buff.uid, buff.level || 1, "Level of " + buff.name, { min: 1, max: 40 }, (value) => this.act("buff", { uid: buff.uid, level: value }))));
      row.append(h("label", { class: "pf-mini" }, h("span", { text: "Rounds" }), this.number("@buff-rounds-" + buff.uid, buff.rounds === undefined ? null : buff.rounds, "Rounds left of " + buff.name, { min: 0, blank: true, placeholder: "∞" }, (value) => this.act("buff", { uid: buff.uid, rounds: value }))));
      if (this.canWrite) row.append(iconButton("trash", "Remove " + buff.name, () => this.emit("remove", { list: "buffs", uid: buff.uid })));
      rows.append(row);
    }
    if (!list(doc.buffs).length) rows.append(this.empty("No spell effects or situational modifiers. Add them here, or drag them from the library."));
    const block = this.block("Effects", rows);
    if (this.canWrite) block.append(h("div", { class: "pf-actions" }, button("Add an effect", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => this.emit("request", { what: "add", data: { kind: "buff" } }) })));
    page.push(block, this.toggles(derived), this.conditions(doc));
    if (this.canWrite) page.push(this.block("Rest", h("div", { class: "pf-actions" }, button("Rest for the night", { kind: "small", iconName: "moon", onClick: () => this.emit("request", { what: "rest", data: { full: false } }) }), button("Full day of bed rest", { kind: "small ez-btn-ghost", onClick: () => this.emit("request", { what: "rest", data: { full: true } }) }))));
    return page;
  }

  notes(sheet, doc) {
    const node = h("textarea", { rows: 16, disabled: !this.canWrite, placeholder: "Background, plans, reminders…", "aria-label": "Notes", dataset: { path: "notes" } });
    node.value = doc.notes || "";
    node.addEventListener("change", () => this.set("notes", node.value));
    return [this.block("Notes", node)];
  }

  pool(pool) {
    const up = pool.counts === "up";
    const shown = up ? pool.value : pool.left;
    const ratio = pool.max > 0 ? Math.max(0, Math.min(1, shown / pool.max)) : 0;
    const node = h("div", { class: "pf-pool", dataset: { resource: pool.id } }, h("div", { class: "pf-pool-head" }, h("strong", { text: pool.name }), h("span", { class: "pf-pool-value", text: shown + " / " + pool.max + (pool.unit ? " " + pool.unit : "") + (up ? "" : " left") })), h("div", { class: "ez-bar", dataset: { level: up ? (ratio >= 1 ? "low" : ratio > 0.5 ? "mid" : "high") : ratio > 0.5 ? "high" : ratio > 0.25 ? "mid" : "low" } }, h("span", { style: { width: ratio * 100 + "%" } })));
    if (this.canControl) node.append(h("div", { class: "pf-pool-controls" }, iconButton("minus", (up ? "Remove " : "Spend ") + pool.name, () => this.act("resource", { id: pool.id, delta: up ? -1 : 1 })), iconButton("plus", (up ? "Take " : "Regain ") + pool.name, () => this.act("resource", { id: pool.id, delta: up ? 1 : -1 }))));
    if (pool.text) node.append(h("p", { class: "pf-text", text: pool.text }));
    return node;
  }

  section(section, sheet, doc, derived) {
    const block = this.block(section.title || "");
    const type = section.type;
    const custom = sectionTypes.get(type);
    if (custom) {
      this.local = this.local || {};
      const key = section.id || type;
      const drawn = custom(section, {
        h,
        icon,
        button,
        iconButton,
        signed,
        title,
        sheet,
        doc,
        derived,
        system: this.props.system || {},
        canWrite: this.canWrite,
        canControl: this.canControl,
        state: this.local[key] || (this.local[key] = {}),
        redraw: () => this.render(this.props),
        roll: (kind, id, options) => this.roll(kind, id, options),
        act: (action, data) => this.act(action, data),
        set: (path, value) => this.set(path, value),
        view: (id) => this.emit("view", { id: String(id) }),
        request: (what, data) => this.emit("request", { what, data: data || {} }),
        remove: (name, uid) => this.emit("remove", { list: name, uid }),
        tile: (label, value, sub, onRoll, tip) => this.tile(label, value, sub, onRoll, tip),
        pool: (pool) => this.pool(pool),
        attacks: (wanted) => this.attacks(doc, derived, wanted),
        chip: (label, on, apply) => this.chipToggle(label, on, apply),
        empty: (text) => this.empty(text),
        block: (heading, ...children) => this.block(heading, ...children),
      });
      if (!drawn) return null;
      block.append(drawn);
    } else if (type === "resource") {
      const pool = (derived.resources || {})[section.resource];
      if (!pool) return null;
      block.append(this.pool(pool));
    } else if (type === "attacks") block.append(this.attacks(doc, derived, (attack) => list(attack.tags).includes(section.tag)));
    else if (type === "toggles") {
      const shown = list(derived.toggles).filter((toggle) => list(section.ids).includes(toggle.id));
      if (!shown.length) return null;
      block.append(h("div", { class: "pf-chips" }, shown.map((toggle) => this.chipToggle(toggle.label, toggle.on, (on) => this.act("toggle", { id: toggle.id, on })))));
    } else if (type === "values") block.append(h("div", { class: "ez-rows" }, list(section.rows).map((row) => h("div", { class: "ez-row" }, h("span", { class: "ez-row-main pf-muted", text: row.label }), h("span", { class: "pf-value", text: String(row.value) })))));
    else if (type === "buttons") {
      if (!this.canControl) return null;
      block.append(h("div", { class: "pf-actions" }, list(section.buttons).map((entry) => button(entry.label, { kind: "small" + (entry.primary ? " ez-btn-primary" : ""), title: entry.hint || "", onClick: () => (entry.roll ? this.roll(entry.roll.kind, entry.roll.id || "", entry.roll.options || {}) : this.act(entry.action, entry.data || {})) }))));
    } else if (type === "list") {
      const rows = h("div", { class: "ez-rows" });
      const entries = list((doc.lists || {})[section.kind]).filter((entry) => !section.group || entry.group === section.group);
      for (const entry of entries) {
        const name = h("button", { type: "button", class: "pf-link", text: entry.name });
        name.addEventListener("click", () => entry.entryId && this.emit("view", { id: String(entry.entryId) }));
        const row = h("div", { class: "ez-row pf-feature" }, h("div", { class: "ez-row-main" }, name, entry.group && !section.group ? h("span", { class: "pf-muted", text: " " + entry.group }) : null, h("p", { class: "pf-text", text: entry.text || "" })));
        if (entry.use && this.canControl) row.append(button(section.useLabel || "Use", { kind: "small ez-btn-primary", onClick: () => this.roll("use", section.kind + "/" + entry.uid) }));
        if (this.canWrite) row.append(iconButton("trash", "Remove " + entry.name, () => this.emit("remove", { list: "list:" + section.kind, uid: entry.uid })));
        rows.append(row);
      }
      if (!entries.length) rows.append(this.empty(section.emptyText || "Nothing here yet."));
      block.append(rows);
      if (this.canWrite) block.append(h("div", { class: "pf-actions" }, button(section.addLabel || "Add", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => this.emit("request", { what: "add", data: { kind: section.kind, group: section.group || "" } }) })));
    } else if (type !== "text") return null;
    if (section.text) block.append(h("p", { class: "pf-text", text: section.text }));
    return block;
  }

  render(props) {
    this.props = props;
    const sheet = props.sheet || {};
    if (props.loading || !sheet.doc || !sheet.derived) {
      this.element.replaceChildren(h("div", { class: "ez-empty" }, icon("user", 28), h("span", { text: "Opening the sheet…" })), this.picker);
      return;
    }
    const doc = sheet.doc;
    const derived = sheet.derived;
    const tabs = [["main", doc.mode === "statblock" ? "Stat block" : "Character"], ["combat", "Combat"], ["skills", "Skills"]];
    if (list(derived.casting).length) tabs.push(["spells", "Spells"]);
    tabs.push(["gear", "Gear"], ["features", "Features"], ["effects", "Effects"]);
    const sections = list(sheet.sections);
    for (const section of sections) if (section.tab && !tabs.some(([id]) => id === section.tab) && section.tab !== "notes") tabs.push([section.tab, section.tabLabel || title(section.tab)]);
    tabs.push(["notes", "Notes"]);
    if (!tabs.some(([id]) => id === this.tab)) this.tab = "main";
    const active = document.activeElement;
    const focused = this.element.contains(active) ? active.dataset.path : null;
    const scroller = this.element.parentElement;
    const scroll = this.jump ? 0 : scroller ? scroller.scrollTop : 0;
    this.jump = false;
    const bar = h("div", { class: "ez-sheet-tabs pf-tabs", role: "tablist" });
    for (const [id, label] of tabs) {
      const node = h("button", { type: "button", class: "ez-sheet-tab", role: "tab", "aria-selected": String(id === this.tab), text: label });
      node.addEventListener("click", () => {
        this.tab = id;
        this.jump = true;
        this.render(this.props);
      });
      bar.append(node);
    }
    const page = h("div", { class: "pf-page" });
    const builtIn = ["main", "combat", "skills", "spells", "gear", "features", "effects", "notes"].includes(this.tab);
    for (const node of (builtIn ? this[this.tab](sheet, doc, derived) : []).flat()) if (node) page.append(node);
    for (const section of sections.filter((entry) => (entry.tab || "features") === this.tab)) {
      const node = this.section(section, sheet, doc, derived);
      if (node) page.append(node);
    }
    this.element.replaceChildren(this.header(sheet, derived), bar, page, this.picker);
    if (scroller) scroller.scrollTop = scroll;
    if (focused) this.element.querySelector('[data-path="' + CSS.escape(focused) + '"]')?.focus({ preventScroll: true });
  }
}
