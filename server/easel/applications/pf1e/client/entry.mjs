import { Component, h, button } from "./ui.mjs";
import { ensureStyles, statblock, line, title, signed, changeText, damageType } from "./format.mjs";

const list = (value) => (Array.isArray(value) ? value : []);
const BAB = { full: "Full (+1 per level)", medium: "Three-quarters", poor: "Half" };

export default class Entry extends Component {
  constructor() {
    super("easel.pf1e.entry", "article");
    ensureStyles();
    this.element.classList.add("pf-entry");
  }

  put(node, ...children) {
    for (const child of children) if (child) node.append(child);
  }

  spell(entry, body) {
    const levels = Object.entries(entry.levels || {}).map(([name, level]) => name + " " + level).join(", ");
    this.put(body, line("School", title(entry.school)), line("Level", levels), line("Casting Time", entry.castingTime), line("Components", entry.components), line("Range", entry.range), line("Duration", entry.duration), line("Saving Throw", entry.save || "none"));
    if (entry.description) body.append(h("p", { class: "pf-text", text: entry.description }));
    if (entry.roll) {
      const roll = entry.roll;
      body.append(h("p", { class: "pf-line pf-muted", text: "Rolls " + (Number(roll.count) === 0 ? "" : "(" + roll.count + ")d" + roll.die) + (roll.bonus ? " + (" + roll.bonus + ")" : "") + (roll.healing ? " healing" : roll.type ? " " + roll.type : "") + ", where @cl is the caster level." }));
    }
  }

  item(entry, body, system) {
    this.put(body, line("Type", title(entry.type)), line("Price", entry.price ? Number(entry.price).toLocaleString() + " gp" : ""), line("Weight", entry.weight ? entry.weight + " lb." : ""), line("Slot", entry.slot));
    const weapon = entry.weapon;
    if (weapon) {
      const range = Number(weapon.critRange) < 20 ? weapon.critRange + "–20/" : "";
      this.put(body, line("Weapon", title(weapon.category) + ", " + (weapon.group === "ranged" ? "ranged" : weapon.handed === "light" ? "light" : weapon.handed + "-handed")), line("Damage", weapon.damage + " (Medium) " + damageType(weapon.damageType)), line("Critical", range + "×" + weapon.critMult), line("Range", weapon.range ? weapon.range + " ft." : ""), line("Special", list(weapon.properties).join(", ")));
    }
    const armor = entry.armor;
    if (armor) this.put(body, line("Armor bonus", signed(armor.bonus)), line("Maximum Dex bonus", armor.maxDex === null || armor.maxDex === undefined ? "" : signed(armor.maxDex)), line("Armor check penalty", String(armor.acp)), line("Arcane spell failure", armor.spellFailure + "%"));
    if (entry.use) body.append(line(entry.use.healing ? "Heals" : "Deals", entry.use.formula + (entry.use.type ? " " + entry.use.type : "")));
    if (entry.uses) body.append(line("Charges", String(entry.uses.max)));
    if (entry.description) body.append(h("p", { class: "pf-text", text: entry.description }));
    this.changes(entry, body, system);
  }

  changes(entry, body, system) {
    const changes = list(entry.changes);
    if (!changes.length) return;
    body.append(h("h4", { class: "pf-rule", text: "Effects" }));
    const rows = h("ul", { class: "pf-list" });
    for (const change of changes) rows.append(h("li", { text: changeText(change, system) }));
    body.append(rows);
  }

  kind(entry, body, system) {
    const skills = (system && system.skills) || {};
    this.put(body, line("Hit Die", "d" + entry.hd), line("Base attack", BAB[entry.bab] || entry.bab), line("Good saves", Object.entries(entry.saves || {}).filter(([, value]) => value === "good").map(([save]) => title(save)).join(", ") || "none"), line("Skill ranks per level", entry.ranks + " + Intelligence modifier"), line("Class skills", list(entry.classSkills).map((id) => (skills[id] || {}).name || id).join(", ")), line("Weapons", list(entry.weapons).join(", ")), line("Armor", list(entry.armors).join(", ") || "none"));
    if (entry.casting) body.append(line("Spellcasting", title(entry.casting.type) + ", " + ((system && system.abilityNames) || {})[entry.casting.ability] + "-based, " + entry.casting.list + " list"));
    if (entry.description) body.append(h("p", { class: "pf-text", text: entry.description }));
    if (list(entry.features).length) body.append(h("h4", { class: "pf-rule", text: "Class features" }));
    for (const feature of list(entry.features)) body.append(h("p", { class: "pf-line" }, h("strong", { text: feature.name + " (level " + feature.level + ") " }), feature.text || ""));
  }

  race(entry, body, system) {
    this.put(body, line("Size", title(entry.size)), line("Speed", entry.speed + " ft."), line("Senses", list(entry.senses).join(", ")), line("Languages", entry.languages));
    if (entry.description) body.append(h("p", { class: "pf-text", text: entry.description }));
    for (const trait of list(entry.traits)) body.append(h("p", { class: "pf-line" }, h("strong", { text: trait.name + " " }), trait.text));
    void system;
  }

  render(props) {
    const entry = props.entry || {};
    const system = props.system || {};
    const body = h("div", { class: "pf-entry-body" });
    if (!entry.kind) body.append(h("div", { class: "ez-empty" }, h("span", { text: "Loading…" })));
    else if (entry.kind === "monster") body.append(statblock(entry.statblock || {}, entry.name, entry.size));
    else {
      body.append(h("header", { class: "pf-entry-head" }, h("h3", { text: entry.name }), h("span", { class: "ez-chip", text: entry.source || "" })));
      if (entry.kind === "spell") this.spell(entry, body);
      else if (entry.kind === "item") this.item(entry, body, system);
      else if (entry.kind === "class") this.kind(entry, body, system);
      else if (entry.kind === "race") this.race(entry, body, system);
      else if (entry.kind === "feat") {
        this.put(body, line("Type", entry.type), line("Prerequisites", entry.prerequisites || "none"));
        body.append(h("p", { class: "pf-text", text: entry.benefit || "" }));
        this.changes(entry, body, system);
      } else {
        this.put(body, line("Group", entry.group), line("Requires", entry.prerequisites));
        for (const cost of list((entry.use || {}).cost)) body.append(line("Costs", cost.amount + " " + cost.resource));
        body.append(h("p", { class: "pf-text", text: entry.text || entry.description || "" }));
        this.changes(entry, body, system);
      }
    }
    const actions = h("footer", { class: "pf-entry-actions", hidden: !list(props.actions).length });
    for (const action of list(props.actions)) actions.append(button(action.label, { kind: action.kind || "", iconName: action.icon || "", onClick: () => this.emit("action", { action: String(action.id), id: String(entry.id || "") }) }));
    this.element.replaceChildren(body, actions);
  }
}
