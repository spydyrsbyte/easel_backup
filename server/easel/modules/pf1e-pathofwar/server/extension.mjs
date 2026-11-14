const list = (value) => (Array.isArray(value) ? value : []);
const whole = (value) => Math.trunc(Number(value)) || 0;
const title = (text) => String(text || "").replace(/^./, (letter) => letter.toUpperCase());
const at = (table, level) => whole(list(table)[Math.min(level, list(table).length) - 1]);

function initiating(derived, ctx) {
  if (ctx.statblock) return;
  const classes = [];
  for (const entry of ctx.doc.levels) {
    const definition = ctx.engine.lookup(String(entry.classId || "")) || {};
    const rules = definition.initiating;
    const level = whole(entry.level);
    if (!rules || level < 1) continue;
    const ability = derived.abilities[rules.ability] || derived.abilities.wis;
    classes.push({ classId: entry.classId, name: entry.name || definition.name, level, initiatorLevel: level + Math.floor((derived.level - level) / 2), ability: rules.ability, mod: ability.mod, known: at(rules.known, level), readied: at(rules.readied, level), stances: at(rules.stances, level), disciplines: list(rules.disciplines), recovery: rules.recovery || "" });
  }
  if (!classes.length) return;
  const known = list(ctx.doc.lists.maneuver);
  const level = Math.max(...classes.map((entry) => entry.initiatorLevel));
  const mod = Math.max(...classes.map((entry) => entry.mod));
  derived.initiating = {
    level,
    mod,
    dc: 10 + mod,
    highest: Math.min(9, Math.ceil(level / 2)),
    known: classes.reduce((sum, entry) => sum + entry.known, 0),
    readied: classes.reduce((sum, entry) => sum + entry.readied, 0),
    stances: classes.reduce((sum, entry) => sum + entry.stances, 0),
    disciplines: [...new Set(classes.flatMap((entry) => entry.disciplines))],
    recovery: classes.map((entry) => entry.recovery).filter(Boolean),
    classes,
    count: { known: known.filter((entry) => entry.type !== "stance").length, stances: known.filter((entry) => entry.type === "stance").length, readied: known.filter((entry) => entry.readied).length, expended: known.filter((entry) => entry.expended).length },
  };
  ctx.data.initiating = { level, mod };
}

export default class PathOfWar {
  constructor() {
    this.name = "Path of War";
    this.systems = ["pf1e"];
  }

  install(game) {
    const { engine, cards, sheets } = game;
    game.step("initiating", initiating, { after: "skills" });

    const maneuver = (doc, uid) => {
      const found = list(doc.lists.maneuver).find((entry) => entry.uid === uid);
      if (!found) throw new Error("That maneuver is no longer known.");
      return found;
    };
    const initiator = (derived) => {
      if (!derived.initiating) throw new Error("This character has no levels in an initiator class.");
      return derived.initiating;
    };

    game.kinds.set("maneuver", {
      id: "maneuver",
      label: "Maneuvers",
      singular: "maneuver",
      icon: "swords",
      describe: (entry) => [entry.discipline, title(entry.type) + " " + entry.level].filter(Boolean).join(" · "),
      group: (entry) => entry.discipline || "",
      add: (doc, entry, options, derived) => {
        const state = initiator(derived);
        const stance = entry.type === "stance";
        if (whole(entry.level) > state.highest) throw new Error(entry.name + " is a level " + entry.level + " maneuver; this character can learn up to level " + state.highest + ".");
        if (stance && state.count.stances >= state.stances) throw new Error("No more stances can be learned at this level (" + state.stances + " known).");
        if (!stance && state.count.known >= state.known) throw new Error("No more maneuvers can be learned at this level (" + state.known + " known).");
        return sheets.addToList(doc, entry, options);
      },
    });

    const control = (run) => ({ needs: "control", run });
    game.actions.set("pow.ready", control((doc, derived, data) => {
      const state = initiator(derived);
      const entry = maneuver(doc, String(data.uid));
      if (entry.type === "stance") throw new Error("Stances are always available and are not readied.");
      if (data.on && !entry.readied && state.count.readied >= state.readied) throw new Error("Only " + state.readied + " maneuvers can be readied. Unready one first.");
      entry.readied = !!data.on;
      if (!entry.readied) entry.expended = false;
    }));
    game.actions.set("pow.recover", control((doc, derived, data) => {
      const state = initiator(derived);
      const expended = list(doc.lists.maneuver).filter((entry) => entry.expended);
      let count = expended.length;
      if (data.count === "one") count = 1;
      else if (data.count === "focus") count = Math.max(2, state.mod);
      const chosen = data.uid ? expended.filter((entry) => entry.uid === data.uid) : expended.slice(0, count);
      for (const entry of chosen) entry.expended = false;
    }));
    game.actions.set("pow.stance", control((doc, derived, data) => {
      initiator(derived);
      for (const entry of list(doc.lists.maneuver)) if (entry.type === "stance" && entry.toggle) doc.toggles[entry.toggle] = entry.uid === data.uid;
    }));

    game.rolls.set("maneuver", ({ record, sheet, id, options }) => {
      const state = initiator(sheet.derived);
      const entry = maneuver(sheet.doc, id);
      if (entry.type === "stance") throw new Error("Assume a stance from the Maneuvers page.");
      if (!entry.readied) throw new Error(entry.name + " is not readied.");
      if (entry.expended) throw new Error(entry.name + " has been expended. Recover it first.");
      const dc = 10 + whole(entry.level) + state.mod;
      const vars = { initiating: { level: state.level, mod: state.mod } };
      const rows = [{ label: "Maneuver", value: [entry.discipline, entry.type, "level " + entry.level].join(" · ") }, { label: "Action", value: entry.action || (entry.type === "strike" ? "Standard" : entry.type === "boost" ? "Swift" : "Immediate") }];
      let card;
      const strike = entry.strike;
      if (strike) {
        const attacks = sheet.derived.attacks;
        const base = attacks.find((attack) => attack.id === options.attack) || attacks[0];
        if (!base) throw new Error("There is no weapon to strike with.");
        const definition = JSON.parse(JSON.stringify(base));
        const times = Math.max(1, whole(strike.attacks) || 1);
        definition.bonuses = Array.from({ length: times }, () => definition.bonuses[0]);
        if (strike.dice || strike.count) {
          const count = strike.count !== undefined ? Math.max(0, Math.trunc(engine.evaluate(sheet.derived, strike.count, vars))) : 0;
          const formula = count > 0 ? count + "d" + (whole(strike.die) || 6) : String(strike.dice || "");
          if (formula) definition.damage.push({ formula, type: strike.type || "", crit: false });
        }
        const result = engine.attack(definition, { full: times > 1, bonus: Math.trunc(engine.evaluate(sheet.derived, strike.attack, vars)) + whole(options.bonus), damageBonus: Math.trunc(engine.evaluate(sheet.derived, strike.damage, vars)) });
        card = cards.attackCard(result, definition, { subtitle: entry.discipline + " strike" });
        card.title = entry.name + " (" + title(base.name) + ")";
        card.text = entry.text || "";
        card.rows.push(...rows);
      } else card = cards.textCard(entry.name, entry.discipline + " " + entry.type, entry.text || "", rows);
      if (entry.save) {
        card.rows.push({ label: "Save", value: title(entry.save.name || entry.save.id) + " DC " + dc + (entry.save.effect ? " " + entry.save.effect : "") });
        card.actions.push({ id: "save", label: title(entry.save.name || entry.save.id) + " save DC " + dc, payload: { save: entry.save.id, dc } });
      }
      game.edit(record, (doc) => {
        maneuver(doc, id).expended = true;
        if (entry.effect) {
          doc.buffs = doc.buffs.filter((buff) => buff.entryId !== entry.entryId);
          doc.buffs.push({ uid: sheets.uid(), entryId: entry.entryId, name: entry.name, active: true, rounds: whole(entry.effect.rounds) || 1, text: entry.text || "", level: state.level, changes: entry.effect.changes });
        }
      });
      if (entry.effect) card.rows.push({ label: "Effect", value: "On " + record.name + " for " + (whole(entry.effect.rounds) || 1) + " round" + ((whole(entry.effect.rounds) || 1) > 1 ? "s" : "") });
      return card;
    });

    game.on("rest", (result) => {
      for (const entry of list((result.doc.lists || {}).maneuver)) entry.expended = false;
    });

    game.sections.set("pathofwar.maneuvers", { tab: "maneuvers", tabLabel: "Maneuvers", title: "", type: "pathofwar.maneuvers", when: (sheet) => !!sheet.derived.initiating });
  }
}
