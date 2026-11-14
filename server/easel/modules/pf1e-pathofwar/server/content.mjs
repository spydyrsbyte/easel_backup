const c = (target, type, value, extra = {}) => ({ target, type, ...(typeof value === "number" ? { value } : { formula: value }), ...extra });
const f = (level, name, text, extra = {}) => ({ level, name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), text, ...extra });
const table = (first, steps) => Array.from({ length: 20 }, (_, index) => first + steps.filter((level) => level <= index + 1).length);
const slug = (name) => name.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-");

const EVERY = (from, gap) => Array.from({ length: 20 }, (_, index) => from + index * gap).filter((level) => level <= 20);
const KNOWN = EVERY(2, 1);
const STANCES = [2, 5, 9, 11, 14, 18];

const classes = [
  {
    name: "Stalker",
    hd: 8,
    bab: "medium",
    saves: { fort: "poor", ref: "good", will: "good" },
    ranks: 6,
    classSkills: ["acr", "blf", "clm", "crf", "dev", "dis", "esc", "hea", "itm", "kdu", "klo", "per", "pro", "rid", "sen", "slt", "ste", "sur", "swm"],
    weapons: ["simple", "martial"],
    armors: ["light"],
    description: "A mystic assassin who reads an enemy's weaknesses and strikes where it will end the fight.",
    initiating: { ability: "wis", known: table(6, KNOWN), readied: table(4, [4, 7, 10, 13, 15, 18, 20]), stances: table(1, STANCES), disciplines: ["Broken Blade", "Solar Wind", "Steel Serpent", "Thrashing Dragon", "Veiled Moon"], recovery: "Stalker: a full-round action recovers maneuvers equal to the Wisdom modifier (minimum 2) and grants a dodge bonus; a standard action recovers one." },
    resources: [{ id: "ki", name: "Ki", max: "max(1, floor(@class.level / 2) + @wis.mod)", recover: { rest: "all" }, text: "Spent on stalker arts and to push a strike further." }],
    features: [
      f(1, "Maneuvers", "Learns, readies and initiates martial maneuvers. Wisdom is the initiation modifier."),
      f(1, "Ki Pool", "A pool of ki points equal to half stalker level plus Wisdom modifier."),
      f(1, "Deadly Strike", "After a critical hit, or by spending ki, deals extra damage on attacks: 1d6, and 1d6 more every four levels. Switch it on while it lasts.", { changes: [{ target: "damage.dice", count: "1 + floor(@class.level / 4)", die: 6, damageType: "precision", toggle: "deadlyStrike", toggleLabel: "Deadly strike" }] }),
      f(2, "Stalker Arts", "Gains a stalker art at 2nd level and every four levels after. Record them as features."),
      f(3, "Combat Insight", "Adds Wisdom modifier to initiative.", { changes: [c("init", "insight", "max(0, @wis.mod)")] }),
      f(3, "Dodge Bonus", "+1 dodge bonus to AC in light or no armor, and +1 more every four levels.", { changes: [c("ac", "dodge", "1 + floor((@class.level - 3) / 4)", { when: "@armor.category < 2" })] }),
      f(6, "Blending", "Can use ki to hide in plain sight for a round."),
      f(9, "Dual Strike", "Once per encounter, initiates two strikes as one action."),
      f(20, "Retributive Kill", "A critical hit can slay the target outright (Fortitude negates)."),
    ],
  },
  {
    name: "Warder",
    hd: 12,
    bab: "full",
    saves: { fort: "good", ref: "poor", will: "good" },
    ranks: 4,
    classSkills: ["acr", "blf", "clm", "crf", "dip", "han", "itm", "ken", "khi", "klo", "per", "pro", "rid", "sen", "swm"],
    weapons: ["simple", "martial"],
    armors: ["light", "medium", "heavy", "shields", "tower"],
    description: "A defender who holds the line and makes it costly to attack anyone else.",
    initiating: { ability: "int", known: table(5, KNOWN), readied: table(3, [3, 5, 8, 10, 13, 15, 18, 20]), stances: table(1, STANCES), disciplines: ["Broken Blade", "Golden Lion", "Iron Tortoise", "Primal Fury"], recovery: "Warder: defensive focus, a full-round action, recovers maneuvers equal to the Intelligence modifier (minimum 2) and widens the threatened area; a standard action recovers one." },
    features: [
      f(1, "Maneuvers", "Learns, readies and initiates martial maneuvers. Intelligence is the initiation modifier."),
      f(1, "Defensive Focus", "A full-round action recovers maneuvers and lets the warder make extra attacks of opportunity over a wider area until the next turn."),
      f(1, "Aegis", "Allies within 10 feet gain a +1 morale bonus to AC and on Will saves, rising with level. Apply it to allies as an effect."),
      f(2, "Armiger's Mark", "A struck foe takes –4 on attacks against anyone but the warder.", { uses: { max: "3 + @int.mod", per: "day" } }),
      f(3, "Tactical Acumen", "Uses Intelligence in place of Dexterity for initiative and Reflex saves when it is higher.", { changes: [c("init", "untyped", "max(0, @int.mod - @dex.mod)"), c("ref", "untyped", "max(0, @int.mod - @dex.mod)")] }),
      f(4, "Extended Defense", "Once per day, uses a counter each round for several rounds without expending them."),
      f(7, "Clad in Steel", "Reduces armor check penalty by 1 and raises the maximum Dexterity bonus by 1.", { changes: [c("acp", "untyped", 1), c("armorMaxDex", "untyped", 1)] }),
      f(12, "Stalwart", "Takes no effect on a successful Fortitude or Will save against an effect with a partial result."),
      f(20, "Deathless Defenses", "Can keep fighting below 0 hit points while in defensive focus."),
    ],
  },
  {
    name: "Warlord",
    hd: 10,
    bab: "full",
    saves: { fort: "good", ref: "poor", will: "good" },
    ranks: 4,
    classSkills: ["acr", "blf", "clm", "crf", "dip", "han", "itm", "khi", "klo", "per", "prf", "pro", "rid", "sen", "swm"],
    weapons: ["simple", "martial"],
    armors: ["light", "medium", "shields"],
    description: "A bold commander who wins by daring and carries the whole party with them.",
    initiating: { ability: "cha", known: table(6, KNOWN), readied: table(4, [4, 7, 10, 13, 15, 18, 20]), stances: table(1, STANCES), disciplines: ["Golden Lion", "Primal Fury", "Scarlet Throne", "Solar Wind", "Thrashing Dragon"], recovery: "Warlord: succeeding at a gambit recovers maneuvers equal to the Charisma modifier (minimum 2); a standard action recovers one." },
    features: [
      f(1, "Maneuvers", "Learns, readies and initiates martial maneuvers. Charisma is the initiation modifier."),
      f(1, "Warlord's Gambit", "Takes a risk in battle, such as a charge or a called shot. Success recovers maneuvers and helps allies; failure brings a penalty for a round."),
      f(2, "Bonus Feats", "Gains a bonus combat or teamwork feat at 2nd level and every five levels after.", { changes: [c("feats", "untyped", "1 + floor((@class.level - 2) / 5)")] }),
      f(2, "Tactical Presence", "Allies within 30 feet gain a morale bonus that depends on the presence chosen. Apply it to allies as an effect."),
      f(3, "Warleader", "Shares teamwork feats with allies for a few rounds.", { uses: { max: "max(1, @cha.mod)", per: "day" } }),
      f(4, "Force of Personality", "Uses Charisma in place of Wisdom for Will saves when it is higher.", { changes: [c("will", "untyped", "max(0, @cha.mod - @wis.mod)")] }),
      f(6, "Dual Boost", "Initiates two boosts as one swift action.", { uses: { max: "1 + floor((@class.level - 6) / 5)", per: "day" } }),
      f(20, "Dual Strike", "Once per encounter, initiates two strikes as one action."),
    ],
  },
];

const m = (discipline, level, type, name, text, extra = {}) => ({ kind: "maneuver", name, discipline, level, type, text, ...extra });
const stance = (discipline, level, name, text, changes = []) => m(discipline, level, "stance", name, text, { toggle: "stance:" + slug(name), quiet: true, changes });
const strike = (discipline, level, name, text, data = {}, extra = {}) => m(discipline, level, "strike", name, text, { strike: data, ...extra });
const boost = (discipline, level, name, text, changes = [], extra = {}) => m(discipline, level, "boost", name, text, { ...(changes.length ? { effect: { rounds: 1, changes } } : {}), ...extra });
const counter = (discipline, level, name, text, extra = {}) => m(discipline, level, "counter", name, text, extra);
const fort = (effect) => ({ save: { id: "fort", name: "Fortitude", effect } });
const will = (effect) => ({ save: { id: "will", name: "Will", effect } });

const maneuvers = [
  stance("Broken Blade", 1, "Pugilist Stance", "Unarmed and discipline weapon attacks deal 1d6 extra damage.", [{ target: "damage.dice.melee", dice: "1d6" }]),
  strike("Broken Blade", 1, "Flurry Strike", "Makes two attacks against one target, each at –2.", { attacks: 2, attack: -2 }),
  strike("Broken Blade", 1, "Pommel Bash", "A sharp blow that deals 1d6 extra damage.", { dice: "1d6" }),
  counter("Broken Blade", 1, "Counter Charge", "Answers a foe's approach with an opposed check to knock it aside and end its movement."),
  strike("Broken Blade", 2, "Knuckle to the Blade", "The strike deals 2d6 extra damage and may disarm the target with a free combat maneuver.", { dice: "2d6" }),
  strike("Broken Blade", 3, "Bronze Knuckle", "The strike deals 4d6 extra damage and ignores the target's damage reduction.", { dice: "4d6" }),
  stance("Golden Lion", 1, "Pride Leader's Stance", "Allies within 30 feet gain a +2 morale bonus on Will saves; the initiator gains it too.", [c("will", "morale", 2)]),
  boost("Golden Lion", 1, "Encouraging Roar", "Allies within 30 feet gain a +2 morale bonus on attack and damage rolls for one round.", [c("attack", "morale", 2), c("damage", "morale", 2)]),
  strike("Golden Lion", 1, "Hunting Party", "After the strike, one adjacent ally may make an attack of opportunity against the target."),
  strike("Golden Lion", 1, "Tactical Strike", "The strike deals 2d6 extra damage and one ally within 30 feet may move 10 feet at once.", { dice: "2d6" }),
  counter("Golden Lion", 2, "Warning Roar", "An ally within 30 feet gains a +4 bonus to AC against one attack."),
  strike("Golden Lion", 3, "Charge of the Battle Cat", "Made at the end of a charge: 4d6 extra damage, and allies who can see it gain +2 on their next attack.", { dice: "4d6", attack: 2 }),
  stance("Iron Tortoise", 1, "Stance of the Defending Shell", "While using a shield, grants adjacent allies a +2 shield bonus to AC and the initiator +1.", [c("ac", "untyped", 1, { when: "@armor.shield == 1" })]),
  strike("Iron Tortoise", 1, "Snapping Strike", "A shield bash or weapon strike that deals 1d6 extra damage and leaves the target flat-footed against the next attack.", { dice: "1d6" }),
  strike("Iron Tortoise", 1, "Angering Smash", "The strike deals 1d6 extra damage and the target takes –4 on attacks against anyone else for a round.", { dice: "1d6" }, will("negates the penalty")),
  counter("Iron Tortoise", 1, "Iron Shell", "Makes an attack roll with the shield bonus added; if it beats the incoming attack roll, the attack is blocked."),
  counter("Iron Tortoise", 2, "Shield Slide", "Interposes the shield for an adjacent ally, granting them the shield's AC bonus against one attack."),
  strike("Iron Tortoise", 3, "Burnished Shell", "The strike deals 3d6 extra damage and grants damage reduction 5/— until the next turn.", { dice: "3d6" }),
  stance("Primal Fury", 1, "Stance of Aggression", "+1d6 damage on melee attacks and –2 AC.", [{ target: "damage.dice.melee", dice: "1d6" }, c("ac", "untyped", -2)]),
  strike("Primal Fury", 1, "Crushing Blow", "The strike deals 1d6 extra damage and the target takes –2 AC for a round.", { dice: "1d6" }),
  boost("Primal Fury", 1, "Primal Wrath", "+2 morale bonus on damage rolls and +10 feet of speed for one round.", [c("damage", "morale", 2), c("speed", "untyped", 10)]),
  strike("Primal Fury", 2, "Savage Drive", "The strike deals 2d6 extra damage and pushes the target back 5 feet.", { dice: "2d6" }),
  boost("Primal Fury", 2, "Bloody Riposte", "The next melee hit this round deals 2d6 extra damage.", [{ target: "damage.dice.melee", dice: "2d6" }]),
  strike("Primal Fury", 3, "Frenzy Strike", "Makes two attacks at the highest bonus against one target.", { attacks: 2 }),
  stance("Scarlet Throne", 1, "Unfettered Movement", "+10 feet of speed and +2 on Acrobatics checks.", [c("speed", "untyped", 10), c("skill.acr", "untyped", 2)]),
  stance("Scarlet Throne", 1, "Riddle of Iron", "With a one-handed weapon and nothing in the other hand, +2 on damage rolls and +1 dodge to AC.", [c("damage.melee", "untyped", 2), c("ac", "dodge", 1)]),
  strike("Scarlet Throne", 1, "Red Zephyr's Strike", "Moves up to 10 feet before the strike without provoking, and deals 1d6 extra damage.", { dice: "1d6" }),
  counter("Scarlet Throne", 1, "Sanguine Barrier", "A Sense Motive check replaces AC against one attack."),
  strike("Scarlet Throne", 2, "Garnet Lance", "A lunging strike that deals 2d6 extra damage to the target and continues to a second target behind it.", { dice: "2d6" }),
  strike("Scarlet Throne", 3, "Ruby Zenith Strike", "The strike deals 4d6 extra damage.", { dice: "4d6" }),
  stance("Solar Wind", 1, "Solar Wind Stance", "Ranged attacks within 30 feet deal 1d6 extra fire damage.", [{ target: "damage.dice.ranged", dice: "1d6", damageType: "fire" }]),
  strike("Solar Wind", 1, "Dazzling Solar Flare", "A ranged strike that deals 1d6 extra fire damage and dazzles the target.", { dice: "1d6", type: "fire" }, fort("negates the dazzle")),
  counter("Solar Wind", 1, "Intercepting Shot", "A ranged attack roll opposes a ranged attack against an ally; if higher, the attack is deflected."),
  boost("Solar Wind", 1, "Focused Solar Lens", "+2 on ranged attack rolls for one round.", [c("attack.ranged", "untyped", 2)]),
  strike("Solar Wind", 2, "Twin Suns Shot", "Fires two shots at one target at the highest bonus.", { attacks: 2 }),
  strike("Solar Wind", 3, "Solar Lance", "A ranged strike in a line that deals 4d6 extra fire damage.", { dice: "4d6", type: "fire" }),
  stance("Steel Serpent", 1, "Hooded Killer's Stance", "Attacks against one studied target deal 1d6 extra damage and bleed.", [{ target: "damage.dice", dice: "1d6" }]),
  strike("Steel Serpent", 1, "Dizzying Venom Prana", "The strike deals 1d6 extra damage and sickens the target for a round.", { dice: "1d6" }, fort("negates the sickness")),
  strike("Steel Serpent", 1, "Weakening Venom Prana", "The strike also deals 2 points of Strength damage.", {}, fort("negates the Strength damage")),
  boost("Steel Serpent", 1, "Sting of the Rattler", "Weapon attacks deal 2 extra damage and 1 point of bleed for one round.", [c("damage", "untyped", 2)]),
  strike("Steel Serpent", 2, "Sickening Venom Strike", "The strike deals 2d6 extra damage and nauseates the target for a round.", { dice: "2d6" }, fort("the target is sickened instead")),
  strike("Steel Serpent", 3, "Iron Fang", "The strike deals 4d6 extra damage and ignores hardness and damage reduction.", { dice: "4d6" }),
  stance("Thrashing Dragon", 1, "Inner Sphere Stance", "While wielding two weapons, +2 dodge bonus to AC and +1 on attack rolls.", [c("ac", "dodge", 2), c("attack", "untyped", 1)]),
  strike("Thrashing Dragon", 1, "Wyrmling's Fang", "Attacks once with each weapon at the highest bonus.", { attacks: 2 }),
  boost("Thrashing Dragon", 1, "Leaping Dragon", "+10 on Acrobatics checks to jump and +10 feet of speed for one round.", [c("skill.acr", "untyped", 10), c("speed", "untyped", 10)]),
  counter("Thrashing Dragon", 1, "Swift Claws", "Makes an immediate attack against a foe that misses the initiator in melee."),
  strike("Thrashing Dragon", 2, "Reaping Talons", "Attacks once with each weapon, each dealing 1d6 extra damage.", { attacks: 2, dice: "1d6" }),
  strike("Thrashing Dragon", 3, "Flick of the Wrist", "A sudden strike that leaves the target flat-footed and deals 3d6 extra damage.", { dice: "3d6" }),
  stance("Veiled Moon", 1, "Spirit Sensing Stance", "Senses the living and the dead nearby: +4 on Perception checks and no miss chance against incorporeal or invisible foes within 10 feet.", [c("skill.per", "untyped", 4)]),
  stance("Veiled Moon", 1, "Stance of the Ether Gate", "Once a round, teleports 10 feet as a move action."),
  strike("Veiled Moon", 1, "Dimensional Strike", "Steps through space as part of the strike: the target is flat-footed against it.", {}),
  strike("Veiled Moon", 1, "Disturbing Blow", "The strike deals 1d6 extra damage and shakes the target for a round.", { dice: "1d6" }, will("negates the fear")),
  counter("Veiled Moon", 2, "Ghost Step", "Becomes briefly incorporeal: one attack against the initiator has a 50% miss chance."),
  strike("Veiled Moon", 3, "Fading Strike", "The strike deals 3d6 extra damage, then the initiator teleports up to 30 feet.", { dice: "3d6" }),
];


export default class PathOfWarContent {
  packs(system) {
    if (system !== "pf1e") return [];
    return [{ id: "pathofwar.rules", name: "Path of War", source: "Path of War", entries: [...classes.map((entry) => ({ kind: "class", id: "class:" + entry.name.toLowerCase(), ...entry })), ...maneuvers] }];
  }
}
