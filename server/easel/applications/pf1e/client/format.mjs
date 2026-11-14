import { h } from "./ui.mjs";

export const signed = (value) => (Number(value) >= 0 ? "+" : "") + Number(value);
export const title = (text) => String(text || "").replace(/^./, (letter) => letter.toUpperCase());
const list = (value) => (Array.isArray(value) ? value : []);
const DAMAGE = { b: "bludgeoning", p: "piercing", s: "slashing" };

export function ensureStyles() {
  if (document.querySelector("link[data-pf1e]")) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./pf1e.css", import.meta.url).href;
  link.dataset.pf1e = "true";
  document.head.append(link);
}

export function damageType(type) {
  return String(type || "")
    .split(/\s+/)
    .map((word) => DAMAGE[word.toLowerCase()] || word)
    .join(" ");
}

export function attackLine(attack) {
  const damage = list(attack.damage)
    .map((part) => part.formula + (part.type ? " " + damageType(part.type) : ""))
    .join(" plus ");
  const crit = attack.crit || {};
  const range = Number(crit.range) < 20 ? crit.range + "–20" : "";
  const mult = Number(crit.mult) !== 2 || range ? "×" + (crit.mult || 2) : "";
  const bonuses = list(attack.bonuses);
  const same = bonuses.length > 1 && bonuses.every((value) => value === bonuses[0]) && /^\d/.test(String(attack.name || ""));
  return { bonus: (same ? bonuses.slice(0, 1) : bonuses).map(signed).join("/"), damage: damage || "—", crit: [range, mult].filter(Boolean).join("/") };
}

export function line(label, value) {
  if (value === undefined || value === null || value === "") return null;
  return h("p", { class: "pf-line" }, h("strong", { text: label + " " }), String(value));
}

export function changeText(change, system) {
  if (change.note) return change.note;
  const skills = (system && system.skills) || {};
  const names = { ac: "AC", saves: "all saves", fort: "Fortitude", ref: "Reflex", will: "Will", attack: "attack rolls", "attack.melee": "melee attacks", "attack.ranged": "ranged attacks", damage: "damage", "damage.melee": "melee damage", "damage.ranged": "ranged damage", init: "initiative", speed: "speed", hp: "hit points", skills: "all skills", cmb: "CMB", cmd: "CMD", str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma", feats: "bonus feats", skillRanks: "skill ranks", acp: "armor check penalty", armorMaxDex: "maximum Dexterity bonus" };
  let target = names[change.target] || change.target;
  if (change.target.startsWith("skill.")) target = (skills[change.target.slice(6).split(":")[0]] || {}).name || change.target.slice(6);
  const amount = change.value !== undefined ? signed(change.value) : change.count !== undefined ? "extra d" + (change.die || 6) + " dice" : "(" + change.formula + ")";
  return amount + (change.type && change.type !== "untyped" ? " " + change.type : "") + " to " + target + (change.toggle ? " while switched on" : "");
}

export function statblock(stat, name, size) {
  const node = h("div", { class: "pf-statblock" });
  const put = (...children) => {
    for (const child of children) if (child) node.append(child);
  };
  const section = (label) => put(h("h4", { class: "pf-rule", text: label }));
  put(h("div", { class: "pf-statblock-head" }, h("strong", { text: name }), h("span", { text: "CR " + (stat.cr || "—") })));
  put(h("p", { class: "pf-line" }, [stat.xp ? "XP " + Number(stat.xp).toLocaleString() + " · " : "", stat.alignment, title(size), stat.type, list(stat.subtypes).length ? "(" + stat.subtypes.join(", ") + ")" : ""].filter(Boolean).join(" ")));
  put(line("Init", signed(stat.init || 0) + (stat.senses ? "; Senses " + stat.senses : "") + ((stat.skills || {}).Perception !== undefined ? "; Perception " + signed(stat.skills.Perception) : "")));
  if (stat.aura) put(line("Aura", stat.aura));
  section("Defense");
  const ac = stat.ac || {};
  put(line("AC", ac.total + ", touch " + ac.touch + ", flat-footed " + ac.flat + (ac.notes ? " (" + ac.notes + ")" : "")));
  put(line("hp", (stat.hp || {}).max + ((stat.hp || {}).formula ? " (" + stat.hp.formula + ")" : "")));
  const saves = stat.saves || {};
  put(line("Fort", signed(saves.fort || 0) + ", Ref " + signed(saves.ref || 0) + ", Will " + signed(saves.will || 0)));
  if (stat.defensive) put(line("Defenses", stat.defensive));
  section("Offense");
  const speed = stat.speed || {};
  put(line("Speed", [speed.land ? speed.land + " ft." : "", ...["fly", "swim", "climb", "burrow"].filter((mode) => speed[mode]).map((mode) => mode + " " + speed[mode] + " ft.")].filter(Boolean).join(", ") + (speed.notes ? " (" + speed.notes + ")" : "")));
  for (const kind of ["melee", "ranged"]) {
    const attacks = list(stat.attacks).filter((attack) => attack.kind === kind);
    if (attacks.length) put(line(title(kind), attacks.map((attack) => {
      const text = attackLine(attack);
      return attack.name + " " + text.bonus + " (" + [text.damage, text.crit].filter(Boolean).join("/") + (attack.notes ? " plus " + attack.notes : "") + ")";
    }).join(", ")));
  }
  if (stat.space || stat.reach) put(line("Space", (stat.space || "5 ft.") + "; Reach " + (stat.reach || "5 ft.")));
  if (stat.specialAttacks) put(line("Special Attacks", stat.specialAttacks));
  for (const block of list(stat.spells)) {
    put(h("p", { class: "pf-line" }, h("strong", { text: block.title })));
    for (const row of list(block.lines)) put(h("p", { class: "pf-line pf-indent", text: row }));
  }
  section("Statistics");
  const abilities = stat.abilities || {};
  put(h("p", { class: "pf-line" }, ...["str", "dex", "con", "int", "wis", "cha"].flatMap((ability, index) => [h("strong", { text: (index ? ", " : "") + title(ability) + " " }), abilities[ability] === null || abilities[ability] === undefined ? "—" : String(abilities[ability])])));
  put(line("Base Atk", signed(stat.bab || 0) + "; CMB " + signed(stat.cmb || 0) + "; CMD " + (stat.cmd || 10) + (stat.cmdNotes ? " (" + stat.cmdNotes + ")" : "")));
  if (list(stat.feats).length) put(line("Feats", stat.feats.join(", ")));
  const skills = Object.entries(stat.skills || {});
  if (skills.length) put(line("Skills", skills.map(([skill, value]) => skill + " " + signed(value)).join(", ")));
  if (stat.languages) put(line("Languages", stat.languages));
  if (stat.sq) put(line("SQ", stat.sq));
  if (stat.gear) put(line("Gear", stat.gear));
  if (stat.environment || stat.organization || stat.treasure) {
    section("Ecology");
    put(line("Environment", stat.environment), line("Organization", stat.organization), line("Treasure", stat.treasure));
  }
  if (list(stat.special).length) {
    section("Special abilities");
    for (const ability of stat.special) put(h("p", { class: "pf-line" }, h("strong", { text: ability.name + " " }), ability.text));
  }
  if (stat.description) put(h("p", { class: "pf-line pf-flavor", text: stat.description }));
  return node;
}
