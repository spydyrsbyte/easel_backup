const LEVEL = "@classes.kineticist.level";
const HALF = "ceil(" + LEVEL + " / 2)";
const OVERFLOW = "min(@resources.burn, floor(@class.level / 3))";
const f = (level, name, text, extra = {}) => ({ level, name, id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"), text, ...extra });
const burn = (amount) => [{ resource: "burn", amount: "max(0, " + amount + " - @toggles.gatherPower)" }];

const energy = (element, name, type) => ({
  kind: "talent",
  group: "Simple blast",
  element,
  name,
  text: "A ranged touch attack out to 30 feet that deals 1d6 " + type + " damage per two kineticist levels, plus half the Constitution modifier.",
  attacks: [{ id: "blast", name, kind: "ranged", ability: "dex", touch: true, range: 30, tags: ["blast"], damage: { count: HALF, die: 6, bonus: "floor(@con.mod / 2)", type } }],
});

const physical = (element, name, type) => ({
  kind: "talent",
  group: "Simple blast",
  element,
  name,
  text: "A ranged attack out to 30 feet that deals 1d6+1 " + type + " damage per two kineticist levels, plus the Constitution modifier.",
  attacks: [{ id: "blast", name, kind: "ranged", ability: "dex", range: 30, tags: ["blast"], damage: { count: HALF, die: 6, bonus: HALF + " + @con.mod", type } }],
});

const infusion = (name, cost, text, extra = {}) => ({ kind: "talent", group: "Infusion", name, burn: cost, text, use: { cost: burn(cost) }, ...extra });
const utility = (name, cost, text, extra = {}) => ({ kind: "talent", group: "Utility", name, burn: cost, text, ...(cost ? { use: { cost: burn(cost) } } : {}), ...extra });

const kineticist = {
  kind: "class",
  id: "class:kineticist",
  name: "Kineticist",
  hd: 8,
  bab: "medium",
  saves: { fort: "good", ref: "good", will: "poor" },
  ranks: 4,
  classSkills: ["acr", "crf", "hea", "itm", "per", "pro", "ste", "umd"],
  weapons: ["simple"],
  armors: ["light"],
  description: "A living channel for elemental matter and energy, who shapes it into kinetic blasts and pays for greater feats with burn.",
  resources: [{ id: "burn", name: "Burn", max: "3 + @con.mod", counts: "up", recover: { rest: "all" }, text: "Each point of burn deals nonlethal damage equal to character level. It cannot be healed until a full night's rest removes the burn." }],
  changes: [{ target: "hp.nonlethal", type: "untyped", formula: "@resources.burn * @level" }],
  features: [
    f(1, "Elemental Focus", "Chooses one element. Add that element's simple blast on the Kineticist page."),
    f(1, "Kinetic Blast", "A spell-like attack with the chosen element's simple blast, usable at will. It counts as a magic weapon and uses Dexterity to hit."),
    f(1, "Burn", "Pushing past normal limits costs burn. A kineticist can accept burn up to 3 + Constitution modifier, and no more than 1 point a round at first."),
    f(1, "Gather Power", "A move action spent gathering power lowers the burn cost of the next blast talent by 1; a full round lowers it by 2.", { toggles: [{ id: "gatherPower", label: "Gathering power" }] }),
    f(1, "Infusions", "Gains an infusion at 1st, 3rd, 5th level and every two levels after. An infusion changes a kinetic blast and usually costs burn."),
    f(2, "Elemental Defense", "Gains the chosen element's defense talent. Add it on the Kineticist page."),
    f(2, "Utility Wild Talents", "Gains a utility wild talent at 2nd level and every two levels after."),
    f(3, "Elemental Overflow", "While carrying burn, gains a bonus on blast attack rolls equal to the burn, up to one per three kineticist levels, and twice that on blast damage.", {
      changes: [
        { target: "attack.blast", type: "untyped", formula: OVERFLOW },
        { target: "damage.blast", type: "untyped", formula: "2 * " + OVERFLOW },
      ],
    }),
    f(5, "Infusion Specialization", "Lowers the combined burn cost of infusions on one blast by 1, and by 1 more every three levels. Lower the cost by hand when it applies."),
    f(5, "Metakinesis", "Can accept 1 burn to empower a blast, with stronger options at higher levels."),
    f(6, "Internal Buffer", "Can store a point of burn to spend later in place of accepting it."),
    f(7, "Expanded Element", "Chooses a second element, or deepens the first, and gains a composite blast."),
    f(11, "Supercharge", "Gather power lowers burn by 2 as a move action and 3 as a full round."),
    f(16, "Composite Specialization", "Lowers the burn cost of composite blasts by 1."),
    f(19, "Metakinetic Master", "Lowers the burn cost of one metakinesis option by 1."),
    f(20, "Omnikinesis", "Gains access to every element's talents for a short time by accepting burn."),
  ],
};

const entries = [
  kineticist,
  physical("Air", "Air Blast", "bludgeoning"),
  energy("Air", "Electric Blast", "electricity"),
  physical("Earth", "Earth Blast", "bludgeoning"),
  energy("Fire", "Fire Blast", "fire"),
  physical("Aether", "Telekinetic Blast", "bludgeoning"),
  energy("Water", "Cold Blast", "cold"),
  physical("Water", "Water Blast", "bludgeoning"),
  infusion("Extended Range", 1, "The blast reaches 120 feet."),
  infusion("Extreme Range", 2, "The blast reaches 480 feet."),
  infusion("Kinetic Blade", 1, "Shapes the blast into a melee weapon for the round; attacks with it use the blast's damage."),
  infusion("Pushing Infusion", 1, "A physical blast also attempts a bull rush against the target, using Constitution in place of Strength."),
  infusion("Burning Infusion", 1, "A fire blast sets the target alight for 1d6 fire damage each round until it puts the flames out.", { element: "Fire" }),
  infusion("Entangling Infusion", 2, "The target is entangled for 1 minute (Reflex negates, DC 10 + half level + Constitution).", { use: { cost: burn(2), save: { id: "ref", name: "Reflex", dc: "10 + floor(" + LEVEL + " / 2) + @con.mod" } } }),
  infusion("Bowling Infusion", 2, "An earth blast also attempts a trip against the target.", { element: "Earth" }),
  infusion("Thundering Infusion", 1, "An electric blast deafens the target (Fortitude negates).", { element: "Air", use: { cost: burn(1), save: { id: "fort", name: "Fortitude", dc: "10 + floor(" + LEVEL + " / 2) + @con.mod" } } }),
  utility("Kinetic Healer", 1, "A touch heals as much as a kinetic blast would deal. The healed creature, or the kineticist, takes 1 point of burn.", { use: { cost: burn(1), roll: { count: HALF, die: 6, bonus: HALF + " + @con.mod", healing: true, label: "Kinetic healer" } } }),
  utility("Basic Pyrokinesis", 0, "Creates small flames, light and warmth at will, as a handful of fire cantrips.", { element: "Fire" }),
  utility("Basic Geokinesis", 0, "Moves and shapes small amounts of earth and stone at will.", { element: "Earth" }),
  utility("Basic Hydrokinesis", 0, "Creates and moves small amounts of water at will.", { element: "Water" }),
  utility("Basic Aerokinesis", 0, "Moves air to carry sounds, clear smoke or keep off a light rain.", { element: "Air" }),
  utility("Basic Telekinesis", 0, "Moves light objects at a distance, as mage hand, at will.", { element: "Aether" }),
  utility("Flesh of Stone", 0, "Earth's defense: damage reduction 1/adamantine, rising with level.", { element: "Earth", defenses: { dr: [{ amount: 1, bypass: "adamantine" }] } }),
  utility("Searing Flesh", 0, "Fire's defense: creatures that strike with natural or unarmed attacks take fire damage.", { element: "Fire" }),
  utility("Shroud of Water", 0, "Water's defense: a +4 armor bonus or a +2 shield bonus to AC, chosen each round. Shown here as armor.", { element: "Water", changes: [{ target: "ac", type: "armor", value: 4 }] }),
  utility("Enveloping Winds", 0, "Air's defense: ranged attacks against the kineticist have a miss chance.", { element: "Air" }),
  utility("Force Ward", 0, "Aether's defense: temporary hit points that renew each minute.", { element: "Aether" }),
];

export default class KineticistContent {
  packs(system) {
    return system === "pf1e" ? [{ id: "pf1ekineticist.class", name: "Kineticist", source: "Kineticist", entries }] : [];
  }
}
