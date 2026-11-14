const skill = (name, ability, extra = {}) => ({ name, ability, ...extra });
const change = (target, type, value, extra = {}) => ({ target, type, ...(typeof value === "number" ? { value } : { formula: value }), ...extra });
const note = (target, text) => ({ target, note: text });

const SKILLS = {
  acr: skill("Acrobatics", "dex", { acp: true }),
  apr: skill("Appraise", "int"),
  blf: skill("Bluff", "cha"),
  clm: skill("Climb", "str", { acp: true }),
  crf: skill("Craft", "int", { group: true }),
  dip: skill("Diplomacy", "cha"),
  dev: skill("Disable Device", "dex", { acp: true, trained: true }),
  dis: skill("Disguise", "cha"),
  esc: skill("Escape Artist", "dex", { acp: true }),
  fly: skill("Fly", "dex", { acp: true, size: "fly" }),
  han: skill("Handle Animal", "cha", { trained: true }),
  hea: skill("Heal", "wis"),
  itm: skill("Intimidate", "cha"),
  kar: skill("Knowledge (arcana)", "int", { trained: true }),
  kdu: skill("Knowledge (dungeoneering)", "int", { trained: true }),
  ken: skill("Knowledge (engineering)", "int", { trained: true }),
  kge: skill("Knowledge (geography)", "int", { trained: true }),
  khi: skill("Knowledge (history)", "int", { trained: true }),
  klo: skill("Knowledge (local)", "int", { trained: true }),
  kna: skill("Knowledge (nature)", "int", { trained: true }),
  kno: skill("Knowledge (nobility)", "int", { trained: true }),
  kpl: skill("Knowledge (planes)", "int", { trained: true }),
  kre: skill("Knowledge (religion)", "int", { trained: true }),
  lin: skill("Linguistics", "int", { trained: true }),
  per: skill("Perception", "wis"),
  prf: skill("Perform", "cha", { group: true }),
  pro: skill("Profession", "wis", { group: true, trained: true }),
  rid: skill("Ride", "dex", { acp: true }),
  sen: skill("Sense Motive", "wis"),
  slt: skill("Sleight of Hand", "dex", { acp: true, trained: true }),
  spl: skill("Spellcraft", "int", { trained: true }),
  ste: skill("Stealth", "dex", { acp: true, size: "stealth" }),
  sur: skill("Survival", "wis"),
  swm: skill("Swim", "str", { acp: true }),
  umd: skill("Use Magic Device", "cha", { trained: true }),
};

const fear = (name, text, flags = {}) => ({ name, text, flags, changes: [change("attack", "untyped", -2), change("saves", "untyped", -2), change("skills", "untyped", -2)] });

const CONDITIONS = {
  blinded: { name: "Blinded", text: "Cannot see. –2 AC, loses Dexterity bonus to AC, –4 on most Strength- and Dexterity-based skill checks and on opposed Perception checks. All foes have total concealment.", flags: { loseDex: true }, changes: [change("ac", "untyped", -2), change("skills.str", "untyped", -4), change("skills.dex", "untyped", -4), change("skill.per", "untyped", -4)] },
  confused: { name: "Confused", text: "Acts randomly each round: roll d% to see what it does.", changes: [] },
  cowering: { name: "Cowering", text: "Frozen in fear and can take no actions. –2 AC and loses Dexterity bonus to AC.", flags: { loseDex: true }, changes: [change("ac", "untyped", -2)] },
  dazed: { name: "Dazed", text: "Can take no actions, but takes no penalty to AC.", changes: [] },
  dazzled: { name: "Dazzled", text: "–1 on attack rolls and sight-based Perception checks.", changes: [change("attack", "untyped", -1), change("skill.per", "untyped", -1)] },
  deafened: { name: "Deafened", text: "Cannot hear. –4 initiative, automatically fails hearing-based Perception checks, –4 on opposed Perception checks, 20% spell failure for verbal spells.", changes: [change("init", "untyped", -4), change("skill.per", "untyped", -4)] },
  entangled: { name: "Entangled", text: "Moves at half speed, cannot run or charge, –2 on attack rolls and –4 Dexterity. Casting needs a concentration check (DC 15 + spell level).", flags: { halfSpeed: true }, changes: [change("attack", "untyped", -2), change("dex", "untyped", -4)] },
  exhausted: { name: "Exhausted", text: "Moves at half speed, cannot run or charge, –6 Strength and Dexterity. An hour of rest makes it fatigued.", flags: { halfSpeed: true }, changes: [change("str", "untyped", -6), change("dex", "untyped", -6)] },
  fascinated: { name: "Fascinated", text: "Stands or sits quietly, taking no actions. –4 on skill checks made as reactions, such as Perception.", changes: [change("skill.per", "untyped", -4)] },
  fatigued: { name: "Fatigued", text: "Cannot run or charge, –2 Strength and Dexterity. Eight hours of rest removes it.", changes: [change("str", "untyped", -2), change("dex", "untyped", -2)] },
  flatfooted: { name: "Flat-footed", text: "Has not yet acted in combat: loses Dexterity bonus to AC and cannot make attacks of opportunity.", flags: { loseDex: true }, changes: [] },
  frightened: fear("Frightened", "Flees from the source of its fear as best it can. –2 on attack rolls, saving throws, skill checks and ability checks."),
  grappled: { name: "Grappled", text: "Cannot move, –4 Dexterity, –2 on attack rolls and combat maneuver checks except to grapple or escape. Cannot take actions needing two hands.", flags: { immobile: true }, changes: [change("dex", "untyped", -4), change("attack", "untyped", -2), note("cmb", "–2 except to grapple or escape")] },
  helpless: { name: "Helpless", text: "Paralyzed, held, bound, sleeping or unconscious: Dexterity counts as 0, and melee attackers get +4 to hit.", flags: { loseDex: true, immobile: true }, changes: [change("ac", "untyped", -5), note("ac", "Melee attackers get +4; open to coup de grace")] },
  invisible: { name: "Invisible", text: "+2 on attack rolls against sighted foes, and ignores their Dexterity bonus to AC. +20 Stealth while moving, +40 while still.", changes: [change("attack", "untyped", 2), change("skill.ste", "untyped", 20)] },
  nauseated: { name: "Nauseated", text: "Cannot attack, cast spells or concentrate. Can take only a single move action each turn.", changes: [] },
  panicked: fear("Panicked", "Drops what it holds and flees at top speed. –2 on saving throws, skill checks and ability checks. Cowers if cornered."),
  paralyzed: { name: "Paralyzed", text: "Frozen in place and helpless: Strength and Dexterity count as 0. Can take only purely mental actions.", flags: { loseDex: true, immobile: true }, changes: [change("ac", "untyped", -5), note("ac", "Melee attackers get +4; open to coup de grace")] },
  pinned: { name: "Pinned", text: "Tightly bound: cannot move, flat-footed, –4 AC. Can only try to escape or take verbal and mental actions.", flags: { loseDex: true, immobile: true }, changes: [change("ac", "untyped", -4)] },
  prone: { name: "Prone", text: "Lying on the ground: –4 on melee attack rolls, cannot use most ranged weapons. +4 AC against ranged attacks, –4 AC against melee attacks.", changes: [change("attack.melee", "untyped", -4), note("ac", "+4 against ranged attacks, –4 against melee attacks")] },
  shaken: fear("Shaken", "–2 on attack rolls, saving throws, skill checks and ability checks."),
  sickened: { name: "Sickened", text: "–2 on attack rolls, weapon damage rolls, saving throws, skill checks and ability checks.", changes: [change("attack", "untyped", -2), change("damage", "untyped", -2), change("saves", "untyped", -2), change("skills", "untyped", -2)] },
  staggered: { name: "Staggered", text: "Can take a single move action or standard action each round, not both.", changes: [] },
  stunned: { name: "Stunned", text: "Drops everything held, can take no actions, –2 AC and loses Dexterity bonus to AC.", flags: { loseDex: true }, changes: [change("ac", "untyped", -2)] },
  unconscious: { name: "Unconscious", text: "Knocked out and helpless.", flags: { loseDex: true, immobile: true }, changes: [change("ac", "untyped", -5)] },
};

const CMD_TYPES = ["circumstance", "deflection", "dodge", "insight", "luck", "morale", "profane", "sacred", "untyped"];

function maneuvers(derived, ctx) {
  if (derived.mode === "statblock") return;
  const tables = ctx.engine.tables;
  const size = tables.SIZES[ctx.doc.size];
  const str = derived.abilities.str.mod;
  const dex = derived.abilities.dex.mod;
  const useDex = size.step <= -2 || ctx.flags.agileManeuvers;
  const cmb = ctx.total(["cmb"]);
  const attackPenalties = ctx.evaluate(["attack"]).filter((mod) => mod.value < 0);
  const penalty = ctx.stack(attackPenalties).total;
  const ac = ctx.evaluate(["ac"]).filter((mod) => CMD_TYPES.includes(mod.key));
  const cmd = ctx.evaluate(["cmd"]);
  const loseDex = !!ctx.flags.loseDex;
  const full = ctx.stack([...(loseDex ? ac.filter((mod) => mod.key !== "dodge") : ac), ...cmd]);
  const flat = ctx.stack([...ac.filter((mod) => mod.key !== "dodge"), ...cmd]);
  const dexToCmd = loseDex ? Math.min(0, dex) : dex;
  derived.maneuvers = {
    cmb: derived.bab + (useDex ? dex : str) + size.maneuver + cmb.total + penalty,
    cmd: 10 + derived.bab + str + dexToCmd + size.maneuver + full.total,
    cmdFlat: 10 + derived.bab + str + Math.min(0, dex) + size.maneuver + flat.total,
    cmbParts: [{ label: "Base attack", value: derived.bab }, { label: useDex ? "Dexterity" : "Strength", value: useDex ? dex : str }, ...(size.maneuver ? [{ label: "Size", value: size.maneuver }] : []), ...cmb.parts],
    cmdNotes: "",
  };
}

const XP_MEDIUM = [0, 2000, 5000, 9000, 15000, 23000, 35000, 51000, 75000, 105000, 155000, 220000, 315000, 445000, 635000, 890000, 1300000, 1800000, 2550000, 3600000];
const XP_SLOW = [0, 3000, 7500, 14000, 23000, 35000, 53000, 77000, 115000, 160000, 235000, 330000, 475000, 665000, 955000, 1350000, 1900000, 2700000, 3850000, 5350000];
const XP_FAST = [0, 1300, 3300, 6000, 10000, 15000, 23000, 34000, 50000, 71000, 105000, 145000, 210000, 295000, 425000, 600000, 850000, 1200000, 1700000, 2400000];

export const CR_XP = { "1/8": 50, "1/6": 65, "1/4": 100, "1/3": 135, "1/2": 200, 1: 400, 2: 600, 3: 800, 4: 1200, 5: 1600, 6: 2400, 7: 3200, 8: 4800, 9: 6400, 10: 9600, 11: 12800, 12: 19200, 13: 25600, 14: 38400, 15: 51200, 16: 76800, 17: 102400, 18: 153600, 19: 204800, 20: 307200, 21: 409600, 22: 614400, 23: 819200, 24: 1228800, 25: 1638400 };

export function pathfinder() {
  return {
    id: "pf1e",
    name: "Pathfinder Roleplaying Game, first edition",
    maxLevel: 20,
    classSkillBonus: 3,
    saves: { fort: { name: "Fortitude", ability: "con" }, ref: { name: "Reflex", ability: "dex" }, will: { name: "Will", ability: "wis" } },
    skills: SKILLS,
    conditions: CONDITIONS,
    steps: [["maneuvers", maneuvers, { after: "attacks" }]],
    alignments: ["LG", "NG", "CG", "LN", "N", "CN", "LE", "NE", "CE"],
    experience: { slow: XP_SLOW, medium: XP_MEDIUM, fast: XP_FAST },
    options: { hitPoints: "average", maxFirstHitDie: true, experienceTrack: "medium", criticalConfirmation: true },
  };
}
