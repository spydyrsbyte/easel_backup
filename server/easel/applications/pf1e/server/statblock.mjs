const SIZES = ["fine", "diminutive", "tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"];
const NATURAL = /\b(bite|claw|claws|slam|slams|gore|sting|tail|tentacle|tentacles|wing|wings|hoof|hooves|talon|talons|pincer|pincers|tusk|tusks|touch|rake|butt|kick)\b/i;
const number = (text) => {
  const match = /[+-]?\d+/.exec(String(text || "").replace(/\s+/g, ""));
  return match ? Number(match[0]) : 0;
};

function clean(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .replace(/[–—−]/g, "-")
    .replace(/×/g, "x")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, " ");
}

function splitOutside(text, separator = ",") {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const character of String(text)) {
    if (character === "(") depth += 1;
    if (character === ")") depth = Math.max(0, depth - 1);
    if (character === separator && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function attacks(line, kind) {
  const found = [];
  const options = String(line).split(/\s+or\s+(?![^()]*\))/);
  options.forEach((option, optionIndex) => {
    for (const piece of splitOutside(option.replace(/\s+and\s+(?![^()]*\))/g, ", "))) {
      const match = /^(?:(\d+)\s+)?(.+?)\s+([+-]\d+(?:\/[+-]\d+)*)\s*(?:(melee touch|ranged touch|touch|incorporeal touch)\s*)?(?:\(([^)]*)\))?/.exec(piece);
      if (!match) continue;
      const count = match[1] ? Number(match[1]) : 1;
      const name = match[2].trim();
      const bonuses = match[3].split("/").map(number);
      const inside = match[5] || "";
      const damage = [];
      const notes = [];
      let crit = { range: 20, mult: 2 };
      const [main, ...plus] = inside.split(/\s+plus\s+/);
      const dice = /(\d+d\d+(?:\s*[+-]\s*\d+)?|\d+)/.exec(main || "");
      if (dice) damage.push({ formula: dice[1].replace(/\s+/g, ""), type: "", crit: true });
      const range = /\/(\d+)-20/.exec(main || "");
      const mult = /\/x(\d)/.exec(main || "");
      if (range) crit.range = Number(range[1]);
      if (mult) crit.mult = Number(mult[1]);
      const extraType = /\d\s+([a-z ]+)$/i.exec((main || "").replace(/\/.*$/, ""));
      if (extraType && damage[0]) damage[0].type = extraType[1].trim();
      for (const extra of plus) {
        const more = /^(\d+d\d+(?:[+-]\d+)?)\s*([a-z ]*)$/i.exec(extra.trim());
        if (more) damage.push({ formula: more[1], type: more[2].trim(), crit: false });
        else notes.push(extra.trim());
      }
      const full = count > 1 && bonuses.length === 1 ? Array.from({ length: count }, () => bonuses[0]) : bonuses;
      found.push({ name: (count > 1 ? count + " " : "") + name, kind, bonuses: full, damage, crit, natural: NATURAL.test(name) && !/sword|axe|bow|mace|spear|dagger|hammer|flail|club|staff/i.test(name), notes: [match[4] || "", ...notes, optionIndex > 0 ? "alternative" : ""].filter(Boolean).join("; ") });
    }
  });
  return found;
}

export function parseStatblock(source) {
  const text = clean(source).trim();
  if (!text) throw new Error("Paste a stat block to import.");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const stat = { cr: "", xp: 0, alignment: "", type: "", subtypes: [], init: 0, senses: "", aura: "", ac: { total: 10, touch: 10, flat: 10, notes: "" }, hp: { max: 1, formula: "", hd: 1 }, saves: { fort: 0, ref: 0, will: 0 }, defenses: { dr: [], resist: {}, immune: [], vulnerable: [], sr: 0 }, defensive: "", speed: { land: 30 }, attacks: [], space: "", reach: "", specialAttacks: "", spells: [], abilities: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }, bab: 0, cmb: 0, cmd: 10, cmdNotes: "", feats: [], skills: {}, languages: "", sq: "", gear: "", environment: "", organization: "", treasure: "", special: [], description: "" };
  let size = "medium";
  let name = "";
  let section = "header";
  let seenAc = false;
  let seenHp = false;
  const head = /^(.*?)\s+CR\s+([\d/]+)\s*$/i.exec(lines[0]);
  if (head) {
    name = head[1].trim();
    stat.cr = head[2];
  } else name = lines[0].replace(/\s+CR\b.*$/i, "").trim();
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index];
    const upper = line.toUpperCase();
    if (/^(DEFENSE|OFFENSE|TACTICS|STATISTICS|ECOLOGY|SPECIAL ABILITIES|DESCRIPTION)$/.test(upper)) {
      section = upper.toLowerCase();
      continue;
    }
    if (section === "special abilities") {
      const ability = /^(.+?)\s*\((Ex|Su|Sp)\)\s*(.*)$/.exec(line);
      if (ability) stat.special.push({ name: ability[1].trim() + " (" + ability[2] + ")", text: ability[3].trim() });
      else if (stat.special.length) stat.special[stat.special.length - 1].text += " " + line;
      else stat.special.push({ name: "Special", text: line });
      continue;
    }
    if (section === "description") {
      stat.description += (stat.description ? "\n" : "") + line;
      continue;
    }
    let match;
    if ((match = /^XP\s+([\d,]+)/i.exec(line))) stat.xp = Number(match[1].replace(/,/g, ""));
    else if ((match = /^(LG|NG|CG|LN|N|CN|LE|NE|CE|Any[^A-Z]*?)\s+(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([^()]+?)(?:\s*\(([^)]*)\))?$/i.exec(line)) && section === "header") {
      stat.alignment = match[1].trim();
      size = match[2].toLowerCase();
      stat.type = match[3].trim().toLowerCase();
      stat.subtypes = match[4] ? match[4].split(",").map((entry) => entry.trim().toLowerCase()) : [];
    } else if (/^Init\s/i.test(line)) {
      for (const piece of line.split(";")) {
        const part = piece.trim();
        if (/^Init/i.test(part)) stat.init = number(part);
        else if (/^Senses/i.test(part)) stat.senses = part.replace(/^Senses\s*/i, "");
        else if (/^Perception/i.test(part)) stat.skills.Perception = number(part);
        else if (stat.senses) stat.senses += "; " + part;
      }
      const perception = /Perception\s*([+-]\d+)/i.exec(line);
      if (perception) stat.skills.Perception = Number(perception[1]);
      stat.senses = stat.senses.replace(/;?\s*Perception\s*[+-]\d+/i, "").trim();
    } else if ((match = /^Aura\s+(.*)$/i.exec(line))) stat.aura = match[1];
    else if ((match = /^AC\s+(-?\d+)(?:,\s*touch\s+(-?\d+))?(?:,\s*flat-footed\s+(-?\d+))?\s*(?:\((.*)\))?/i.exec(line))) {
      seenAc = true;
      stat.ac = { total: Number(match[1]), touch: match[2] !== undefined ? Number(match[2]) : Number(match[1]), flat: match[3] !== undefined ? Number(match[3]) : Number(match[1]), notes: match[4] || "" };
    } else if ((match = /^hp\s+(\d+)\s*(?:\(([^)]*)\))?(.*)$/i.exec(line))) {
      seenHp = true;
      const formula = (match[2] || "").split(";")[0].trim();
      let hd = 0;
      const pattern = /(\d+)d\d+/g;
      let die;
      while ((die = pattern.exec(formula))) hd += Number(die[1]);
      stat.hp = { max: Number(match[1]), formula, hd: Math.max(1, hd) };
      if (match[3] && match[3].trim()) stat.defensive += match[3].replace(/^[;,\s]+/, "");
    } else if (/^Fort\s/i.test(line)) {
      const [saves, ...rest] = line.split(";");
      stat.saves = { fort: number(/Fort\s*([+-]?\d+)/i.exec(saves) && /Fort\s*([+-]?\d+)/i.exec(saves)[1]), ref: number(/Ref\s*([+-]?\d+)/i.exec(saves) && /Ref\s*([+-]?\d+)/i.exec(saves)[1]), will: number(/Will\s*([+-]?\d+)/i.exec(saves) && /Will\s*([+-]?\d+)/i.exec(saves)[1]) };
      if (rest.length) stat.defensive += (stat.defensive ? "; " : "") + rest.join(";").trim();
    } else if (/^(Defensive Abilities|DR|Immune|Resist|SR)\b/i.test(line)) {
      stat.defensive += (stat.defensive ? "; " : "") + line;
      for (const piece of line.split(";")) {
        const part = piece.trim();
        let found;
        if ((found = /^DR\s+(\d+)\/(.+)$/i.exec(part))) stat.defenses.dr.push({ amount: Number(found[1]), bypass: found[2].trim().toLowerCase() });
        else if ((found = /^Immune\s+(.+)$/i.exec(part))) stat.defenses.immune.push(...found[1].split(",").map((entry) => entry.trim().toLowerCase()).filter(Boolean));
        else if ((found = /^Resist\s+(.+)$/i.exec(part))) for (const entry of found[1].split(",")) {
          const resist = /([a-z ]+?)\s+(\d+)/i.exec(entry.trim());
          if (resist) stat.defenses.resist[resist[1].trim().toLowerCase()] = Number(resist[2]);
        }
        else if ((found = /^SR\s+(\d+)/i.exec(part))) stat.defenses.sr = Number(found[1]);
      }
    } else if ((match = /^Weaknesse?s?\s+(.+)$/i.exec(line))) {
      stat.defensive += (stat.defensive ? "; " : "") + line;
      for (const entry of match[1].split(",")) {
        const weakness = /vulnerab\w+\s+to\s+(.+)$/i.exec(entry.trim());
        if (weakness) stat.defenses.vulnerable.push(weakness[1].trim().toLowerCase());
      }
    } else if ((match = /^Speed\s+(.+)$/i.exec(line))) {
      const pieces = splitOutside(match[1]);
      stat.speed = { land: 0 };
      const notes = [];
      pieces.forEach((piece, position) => {
        const mode = /^(fly|swim|climb|burrow)\s+(\d+)/i.exec(piece);
        if (mode) {
          stat.speed[mode[1].toLowerCase()] = Number(mode[2]);
          const detail = /\(([^)]*)\)/.exec(piece);
          if (detail) notes.push(mode[1].toLowerCase() + " " + detail[1]);
        } else if (position === 0 && /^\d+/.test(piece)) stat.speed.land = number(piece);
        else notes.push(piece);
      });
      stat.speed.notes = notes.join("; ");
    } else if ((match = /^Melee\s+(.+)$/i.exec(line))) stat.attacks.push(...attacks(match[1], "melee"));
    else if ((match = /^Ranged\s+(.+)$/i.exec(line))) stat.attacks.push(...attacks(match[1], "ranged"));
    else if (/^Space\s/i.test(line)) {
      const space = /Space\s+([^;]+)/i.exec(line);
      const reach = /Reach\s+(.+)$/i.exec(line);
      stat.space = space ? space[1].trim() : "";
      stat.reach = reach ? reach[1].trim() : "";
    } else if ((match = /^Special Attacks\s+(.+)$/i.exec(line))) stat.specialAttacks = match[1];
    else if (/^(Spell-Like Abilities|[A-Za-z ]*Spells (Prepared|Known))/i.test(line)) stat.spells.push({ title: line, lines: [] });
    else if (section === "offense" && stat.spells.length && /^(\d+(st|nd|rd|th)|0|At will|Constant|\d+\/day|[A-Z]? ?Domains?)/i.test(line)) stat.spells[stat.spells.length - 1].lines.push(line);
    else if (/^Str\s/i.test(line)) {
      for (const ability of ["str", "dex", "con", "int", "wis", "cha"]) {
        const found = new RegExp(ability + "\\s+(-|\\d+)", "i").exec(line);
        if (found) stat.abilities[ability] = found[1] === "-" ? null : Number(found[1]);
      }
    } else if (/^Base Atk/i.test(line)) {
      stat.bab = number(/Base Atk\s*([+-]?\d+)/i.exec(line) && /Base Atk\s*([+-]?\d+)/i.exec(line)[1]);
      const cmb = /CMB\s*([+-]?\d+)/i.exec(line);
      const cmd = /CMD\s*(\d+)\s*(\([^)]*\))?/i.exec(line);
      if (cmb) stat.cmb = Number(cmb[1]);
      if (cmd) {
        stat.cmd = Number(cmd[1]);
        stat.cmdNotes = cmd[2] ? cmd[2].replace(/[()]/g, "") : "";
      }
    } else if ((match = /^Feats\s+(.+)$/i.exec(line))) stat.feats = splitOutside(match[1]);
    else if ((match = /^Skills\s+(.+)$/i.exec(line))) {
      for (const entry of splitOutside(match[1].split(/;\s*Racial Modifiers/i)[0])) {
        const skill = /^(.+?)\s+([+-]\d+)/.exec(entry);
        if (skill) stat.skills[skill[1].trim()] = Number(skill[2]);
      }
    } else if ((match = /^Languages\s+(.+)$/i.exec(line))) stat.languages = match[1];
    else if ((match = /^SQ\s+(.+)$/i.exec(line))) stat.sq = match[1];
    else if ((match = /^(Combat Gear|Gear|Other Gear)\s+(.+)$/i.exec(line))) stat.gear += (stat.gear ? "; " : "") + match[2];
    else if ((match = /^Environment\s+(.+)$/i.exec(line))) stat.environment = match[1];
    else if ((match = /^Organization\s+(.+)$/i.exec(line))) stat.organization = match[1];
    else if ((match = /^Treasure\s+(.+)$/i.exec(line))) stat.treasure = match[1];
    else if (section === "header" && index <= 3 && !stat.type) stat.description += (stat.description ? "\n" : "") + line;
  }
  if (!name) throw new Error("The stat block needs a name on its first line.");
  if (!seenAc || !seenHp) throw new Error("That does not look like a stat block: it needs at least an AC line and an hp line.");
  if (!SIZES.includes(size)) size = "medium";
  return { name, size, statblock: stat };
}

export function monsterEntry(source, extra = {}) {
  const parsed = parseStatblock(source);
  const stat = parsed.statblock;
  return { kind: "monster", name: parsed.name, size: parsed.size, cr: stat.cr, type: stat.type, statblock: stat, ...extra };
}
