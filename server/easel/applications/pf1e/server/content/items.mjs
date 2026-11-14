const c = (target, type, value) => ({ target, type, value });

const WEAPONS = `
Gauntlet|simple|L|2|1d3|x2|0|1|B|
Dagger|simple|L|2|1d4|19-20|10|1|P or S|
Punching dagger|simple|L|2|1d4|x3|0|1|P|
Spiked gauntlet|simple|L|5|1d4|x2|0|1|P|
Light mace|simple|L|5|1d6|x2|0|4|B|
Sickle|simple|L|6|1d6|x2|0|2|S|trip
Club|simple|1|0|1d6|x2|10|3|B|
Heavy mace|simple|1|12|1d8|x2|0|8|B|
Morningstar|simple|1|8|1d8|x2|0|6|B and P|
Shortspear|simple|1|1|1d6|x2|20|3|P|
Longspear|simple|2|5|1d8|x3|0|9|P|brace,reach
Quarterstaff|simple|2|0|1d6|x2|0|4|B|double,monk
Spear|simple|2|2|1d8|x3|20|6|P|brace
Blowgun|simple|R|2|1d2|x2|20|1|P|
Heavy crossbow|simple|R|50|1d10|19-20|120|8|P|crossbow
Light crossbow|simple|R|35|1d8|19-20|80|4|P|crossbow
Dart|simple|R|0.5|1d4|x2|20|0.5|P|thrown
Javelin|simple|R|1|1d6|x2|30|2|P|thrown
Sling|simple|R|0|1d4|x2|50|0|B|sling
Throwing axe|martial|L|8|1d6|x2|10|2|S|
Light hammer|martial|L|1|1d4|x2|20|2|B|
Handaxe|martial|L|6|1d6|x3|0|3|S|
Kukri|martial|L|8|1d4|18-20|0|2|S|
Light pick|martial|L|4|1d4|x4|0|3|P|
Sap|martial|L|1|1d6|x2|0|2|B|nonlethal
Short sword|martial|L|10|1d6|19-20|0|2|P|
Starknife|martial|L|24|1d4|x3|20|3|P|
Battleaxe|martial|1|10|1d8|x3|0|6|S|
Flail|martial|1|8|1d8|x2|0|5|B|disarm,trip
Longsword|martial|1|15|1d8|19-20|0|4|S|
Heavy pick|martial|1|8|1d6|x4|0|6|P|
Rapier|martial|1|20|1d6|18-20|0|2|P|finesse
Scimitar|martial|1|15|1d6|18-20|0|4|S|
Trident|martial|1|15|1d8|x2|10|4|P|brace
Warhammer|martial|1|12|1d8|x3|0|5|B|
Falchion|martial|2|75|2d4|18-20|0|8|S|
Glaive|martial|2|8|1d10|x3|0|10|S|reach
Greataxe|martial|2|20|1d12|x3|0|12|S|
Greatclub|martial|2|5|1d10|x2|0|8|B|
Heavy flail|martial|2|15|1d10|19-20|0|10|B|disarm,trip
Greatsword|martial|2|50|2d6|19-20|0|8|S|
Guisarme|martial|2|9|2d4|x3|0|12|S|reach,trip
Halberd|martial|2|10|1d10|x3|0|12|P or S|brace,trip
Lance|martial|2|10|1d8|x3|0|10|P|reach
Ranseur|martial|2|10|2d4|x3|0|12|P|disarm,reach
Scythe|martial|2|18|2d4|x4|0|10|P or S|trip
Longbow|martial|R|75|1d8|x3|100|3|P|bow
Composite longbow|martial|R|100|1d8|x3|110|3|P|composite
Shortbow|martial|R|30|1d6|x3|60|2|P|bow
Composite shortbow|martial|R|75|1d6|x3|70|2|P|composite
Kama|exotic|L|2|1d6|x2|0|2|S|monk,trip
Nunchaku|exotic|L|2|1d6|x2|0|2|B|disarm,monk
Sai|exotic|L|1|1d4|x2|0|1|B|disarm,monk
Siangham|exotic|L|3|1d6|x2|0|1|P|monk
Bastard sword|exotic|1|35|1d10|19-20|0|6|S|
Dwarven waraxe|exotic|1|30|1d10|x3|0|8|S|
Whip|exotic|1|1|1d3|x2|0|2|S|disarm,nonlethal,reach,trip,finesse
Elven curve blade|exotic|2|80|1d10|18-20|0|7|S|finesse
Spiked chain|exotic|2|25|2d4|x2|0|10|P|disarm,trip,finesse
Dire flail|exotic|2|90|1d8|x2|0|10|B|disarm,double,trip
Dwarven urgrosh|exotic|2|50|1d8|x3|0|12|P or S|brace,double
Gnome hooked hammer|exotic|2|20|1d8|x3|0|6|B or P|double,trip
Orc double axe|exotic|2|60|1d8|x3|0|15|S|double
Two-bladed sword|exotic|2|100|1d8|19-20|0|10|S|double
Bolas|exotic|R|5|1d4|x2|10|2|B|nonlethal,trip,thrown
Hand crossbow|exotic|R|100|1d4|19-20|30|2|P|crossbow
Halfling sling staff|exotic|R|20|1d8|x3|80|3|B|sling
Repeating heavy crossbow|exotic|R|400|1d10|19-20|120|12|P|crossbow
Repeating light crossbow|exotic|R|250|1d8|19-20|80|6|P|crossbow
Shuriken|exotic|R|0.2|1d2|x2|10|0.1|P|monk,thrown
`;

const ARMOR = `
Padded|light|5|1|8|0|5|10
Leather|light|10|2|6|0|10|15
Studded leather|light|25|3|5|-1|15|20
Chain shirt|light|100|4|4|-2|20|25
Hide|medium|15|4|4|-3|20|25
Scale mail|medium|50|5|3|-4|25|30
Chainmail|medium|150|6|2|-5|30|40
Breastplate|medium|200|6|3|-4|25|30
Splint mail|heavy|200|7|0|-7|40|45
Banded mail|heavy|250|7|1|-6|35|35
Half-plate|heavy|600|8|0|-7|40|50
Full plate|heavy|1500|9|1|-6|35|50
Buckler|shield|5|1|-|-1|5|5
Light wooden shield|shield|3|1|-|-1|5|5
Light steel shield|shield|9|1|-|-1|5|6
Heavy wooden shield|shield|7|2|-|-2|15|10
Heavy steel shield|shield|20|2|-|-2|15|15
Tower shield|tower|30|4|2|-10|50|45
`;

const GEAR = `
Backpack|2|2|Holds about 2 cubic feet of gear.
Bedroll|0.1|5|
Blanket, winter|0.5|3|
Caltrops|1|2|Scattered across a 5-foot square; creatures entering may be slowed.
Candle|0.01|0|Sheds dim light in a 5-foot radius for an hour.
Chalk|0.01|0|
Climber's kit|80|5|+2 circumstance bonus on Climb checks.
Crowbar|2|5|+2 circumstance bonus on Strength checks to force things open.
Disguise kit|50|8|+2 circumstance bonus on Disguise checks; ten uses.
Flint and steel|1|0|
Grappling hook|1|4|
Hammer|0.5|2|
Healer's kit|50|1|+2 circumstance bonus on Heal checks; ten uses.
Holy symbol, wooden|1|0|A divine focus.
Holy symbol, silver|25|1|A divine focus.
Ink and pen|8.1|0|
Lantern, bullseye|12|3|Bright light in a 60-foot cone; burns a pint of oil in six hours.
Lantern, hooded|7|2|Bright light in a 30-foot radius; burns a pint of oil in six hours.
Manacles|15|2|
Mirror, small steel|10|0.5|
Musical instrument|5|3|
Oil, pint|0.1|1|
Pitons (5)|0.5|2.5|
Pouch, belt|1|0.5|
Rations, trail (per day)|0.5|1|
Rope, hemp (50 ft.)|1|10|
Rope, silk (50 ft.)|10|5|
Sack|0.1|0.5|
Scroll case|1|0.5|
Signal whistle|0.8|0|
Spell component pouch|5|2|Holds the material components and focuses for spells that have no listed cost.
Spellbook|15|3|One hundred pages; each spell takes a page per level.
Tent|10|20|
Thieves' tools|30|1|Needed for Disable Device checks.
Thieves' tools, masterwork|100|2|+2 circumstance bonus on Disable Device checks.
Tindertwig|1|0|Lights a fire as a standard action.
Torch|0.01|1|Bright light in a 20-foot radius for an hour.
Waterskin|1|4|
Antitoxin|50|0|+5 alchemical bonus on Fortitude saves against poison for an hour.
Smokestick|20|0.5|Fills a 10-foot cube with smoke for a round.
Sunrod|2|1|Bright light in a 30-foot radius for six hours.
Tanglefoot bag|50|4|Ranged touch attack: the target is entangled and may be glued to the floor (Reflex DC 15).
Thunderstone|30|1|Creatures within 10 feet must make a Fortitude save (DC 15) or be deafened for an hour.
`;

const AMMO = [
  ["Arrows (20)", 1, 3],
  ["Crossbow bolts (10)", 1, 1],
  ["Sling bullets (10)", 0.1, 5],
  ["Blowgun darts (10)", 0.5, 0],
];

const USABLE = [
  { name: "Potion of cure light wounds", price: 50, use: { formula: "1d8+1", healing: true }, description: "Drunk as a standard action; heals 1d8+1 hit points." },
  { name: "Potion of cure moderate wounds", price: 300, use: { formula: "2d8+3", healing: true }, description: "Drunk as a standard action; heals 2d8+3 hit points." },
  { name: "Potion of cure serious wounds", price: 750, use: { formula: "3d8+5", healing: true }, description: "Drunk as a standard action; heals 3d8+5 hit points." },
  { name: "Acid flask", price: 10, weight: 1, use: { formula: "1d6", type: "acid" }, description: "A thrown splash weapon (ranged touch, 10 ft. increment): 1d6 acid damage, 1 point of splash." },
  { name: "Alchemist's fire", price: 20, weight: 1, use: { formula: "1d6", type: "fire" }, description: "A thrown splash weapon (ranged touch, 10 ft. increment): 1d6 fire damage, 1 point of splash, and the target burns for 1d6 more next round." },
  { name: "Holy water", price: 25, weight: 1, use: { formula: "2d4", type: "positive" }, description: "A thrown splash weapon against undead and evil outsiders: 2d4 damage, 1 point of splash." },
  { name: "Wand of cure light wounds", price: 750, uses: { max: 50, used: 0, per: "charges" }, use: { formula: "1d8+1", healing: true }, description: "Fifty charges; each heals 1d8+1 hit points with a touch." },
  { name: "Wand of magic missile", price: 750, uses: { max: 50, used: 0, per: "charges" }, use: { formula: "1d4+1", type: "force" }, description: "Fifty charges; each fires one missile that strikes unerringly for 1d4+1 force damage." },
];

const ABILITY_ITEMS = [
  ["Belt of giant strength", "str", "belt"],
  ["Belt of incredible dexterity", "dex", "belt"],
  ["Belt of mighty constitution", "con", "belt"],
  ["Headband of vast intelligence", "int", "headband"],
  ["Headband of inspired wisdom", "wis", "headband"],
  ["Headband of alluring charisma", "cha", "headband"],
];

function weapons() {
  return WEAPONS.trim().split("\n").map((row) => {
    const [name, category, hand, price, damage, crit, range, weight, type, props] = row.split("|");
    const tags = props ? props.split(",") : [];
    const critRange = /(\d+)-20/.exec(crit);
    const critMult = /x(\d)/.exec(crit);
    const ranged = hand === "R";
    const weapon = {
      base: name.toLowerCase(),
      category,
      group: ranged ? "ranged" : "melee",
      handed: ranged ? "ranged" : hand === "L" ? "light" : hand === "1" ? "one" : "two",
      damage,
      damageType: type,
      critRange: critRange ? Number(critRange[1]) : 20,
      critMult: critMult ? Number(critMult[1]) : 2,
      range: Number(range),
      properties: tags.filter((tag) => !["bow", "composite", "crossbow", "sling", "thrown", "finesse", "nonlethal", "monk", "reach"].includes(tag)),
    };
    if (!ranged && Number(range) > 0) weapon.thrown = true;
    if (ranged) weapon.strDamage = tags.includes("thrown") || tags.includes("sling") ? "full" : tags.includes("bow") ? "penalty" : tags.includes("composite") ? "composite" : "none";
    if (tags.includes("composite")) weapon.strRating = 0;
    if (tags.includes("thrown")) weapon.thrown = true;
    if (tags.includes("finesse")) weapon.finesse = true;
    if (tags.includes("nonlethal")) weapon.nonlethal = true;
    if (tags.includes("monk")) weapon.monk = true;
    if (tags.includes("reach")) weapon.reach = true;
    return { kind: "item", type: "weapon", name, price: Number(price), weight: Number(weight), weapon, description: category[0].toUpperCase() + category.slice(1) + " " + (ranged ? "ranged" : hand === "L" ? "light melee" : hand === "1" ? "one-handed melee" : "two-handed melee") + " weapon." + (tags.length ? " " + tags.join(", ") + "." : "") };
  });
}

function armor() {
  return ARMOR.trim().split("\n").map((row) => {
    const [name, category, price, bonus, maxDex, acp, failure, weight] = row.split("|");
    const shield = category === "shield" || category === "tower";
    return {
      kind: "item",
      type: shield ? "shield" : "armor",
      name,
      price: Number(price),
      weight: Number(weight),
      slot: shield ? "shield" : "armor",
      armor: { category, bonus: Number(bonus), maxDex: maxDex === "-" ? null : Number(maxDex), acp: Number(acp), spellFailure: Number(failure) },
      description: (shield ? "Shield" : category[0].toUpperCase() + category.slice(1) + " armor") + ": +" + bonus + " to AC" + (maxDex === "-" ? "" : ", maximum Dexterity bonus +" + maxDex) + ", armor check penalty " + acp + ", arcane spell failure " + failure + "%.",
    };
  });
}

function gear() {
  const entries = GEAR.trim().split("\n").map((row) => {
    const [name, price, weight, description] = row.split("|");
    return { kind: "item", type: "gear", name, price: Number(price), weight: Number(weight), description: description || "" };
  });
  for (const [name, price, weight] of AMMO) entries.push({ kind: "item", type: "ammo", name, price, weight, description: "Ammunition." });
  for (const item of USABLE) entries.push({ kind: "item", type: "consumable", weight: 0, ...item });
  return entries;
}

function magic() {
  const entries = [];
  for (let bonus = 1; bonus <= 5; bonus++) {
    entries.push({ kind: "item", type: "magic", name: "Cloak of resistance +" + bonus, slot: "shoulders", price: 1000 * bonus * bonus, weight: 1, changes: [c("saves", "resistance", bonus)], description: "+" + bonus + " resistance bonus on all saving throws." });
    entries.push({ kind: "item", type: "magic", name: "Ring of protection +" + bonus, slot: "ring", price: 2000 * bonus * bonus, weight: 0, changes: [c("ac", "deflection", bonus)], description: "+" + bonus + " deflection bonus to AC." });
    entries.push({ kind: "item", type: "magic", name: "Amulet of natural armor +" + bonus, slot: "neck", price: 2000 * bonus * bonus, weight: 0, changes: [c("ac", "naturalEnhancement", bonus)], description: "+" + bonus + " enhancement bonus to natural armor." });
  }
  for (let bonus = 1; bonus <= 8; bonus++) entries.push({ kind: "item", type: "magic", name: "Bracers of armor +" + bonus, slot: "wrists", price: 1000 * bonus * bonus, weight: 1, changes: [c("ac", "armor", bonus)], description: "+" + bonus + " armor bonus to AC, as if wearing armor." });
  for (const [name, ability, slot] of ABILITY_ITEMS) for (const bonus of [2, 4, 6]) entries.push({ kind: "item", type: "magic", name: name + " +" + bonus, slot, price: 1000 * bonus * bonus, weight: 1, changes: [c(ability, "enhancement", bonus)], description: "+" + bonus + " enhancement bonus to " + { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }[ability] + "." });
  entries.push({ kind: "item", type: "magic", name: "Boots of elvenkind", slot: "feet", price: 2500, weight: 1, changes: [c("skill.acr", "competence", 5)], description: "+5 competence bonus on Acrobatics checks." });
  entries.push({ kind: "item", type: "magic", name: "Cloak of elvenkind", slot: "shoulders", price: 2500, weight: 1, changes: [c("skill.ste", "competence", 5)], description: "+5 competence bonus on Stealth checks with the hood up." });
  entries.push({ kind: "item", type: "magic", name: "Eyes of the eagle", slot: "eyes", price: 2500, weight: 0, changes: [c("skill.per", "competence", 5)], description: "+5 competence bonus on Perception checks." });
  entries.push({ kind: "item", type: "magic", name: "Boots of striding and springing", slot: "feet", price: 5500, weight: 1, changes: [c("speed", "enhancement", 10), c("skill.acr", "competence", 5)], description: "+10 feet enhancement bonus to speed and +5 competence on Acrobatics checks made to jump." });
  entries.push({ kind: "item", type: "magic", name: "Ioun stone, dusty rose prism", slot: "", price: 5000, weight: 0, changes: [c("ac", "insight", 1)], description: "+1 insight bonus to AC." });
  entries.push({ kind: "item", type: "magic", name: "Bag of holding, type I", slot: "", price: 2500, weight: 15, description: "Holds up to 250 pounds or 30 cubic feet while always weighing 15 pounds." });
  entries.push({ kind: "item", type: "magic", name: "Handy haversack", slot: "", price: 2000, weight: 5, description: "Holds up to 120 pounds while always weighing 5 pounds; the wanted item is always on top." });
  entries.push({ kind: "item", type: "magic", name: "Pearl of power, 1st level", slot: "", price: 1000, weight: 0, uses: { max: 1, used: 0, per: "day" }, description: "Once per day, recalls one prepared 1st-level spell that has already been cast." });
  entries.push({ kind: "item", type: "magic", name: "Everburning torch", slot: "", price: 110, weight: 1, description: "Sheds light as a torch, without heat, forever." });
  return entries;
}

export default [...weapons(), ...armor(), ...gear(), ...magic()];
