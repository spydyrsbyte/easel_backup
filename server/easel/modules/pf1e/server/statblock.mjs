function skillKeyFromName(name) {
  const n = String(name).trim().toLowerCase();
  if (n.startsWith("knowledge") || n.startsWith("k.")) {
    if (n.includes("arcana")) return "kar";
    if (n.includes("dungeon")) return "kdu";
    if (n.includes("engineer")) return "ken";
    if (n.includes("geograph")) return "kge";
    if (n.includes("histor")) return "khi";
    if (n.includes("local")) return "klo";
    if (n.includes("natur")) return "kna";
    if (n.includes("nobil")) return "kno";
    if (n.includes("plane")) return "kpl";
    if (n.includes("relig")) return "kre";
    return "kar";
  }
  if (n.startsWith("acrobatics")) return "acr";
  if (n.startsWith("appraise")) return "apr";
  if (n.startsWith("artistry")) return "art";
  if (n.startsWith("bluff")) return "blf";
  if (n.startsWith("climb")) return "clm";
  if (n.startsWith("craft")) return "crf";
  if (n.startsWith("diplomacy")) return "dip";
  if (n.startsWith("disable device")) return "dev";
  if (n.startsWith("disguise")) return "dis";
  if (n.startsWith("escape artist")) return "esc";
  if (n.startsWith("fly")) return "fly";
  if (n.startsWith("handle animal")) return "han";
  if (n.startsWith("heal")) return "hea";
  if (n.startsWith("intimidate")) return "int";
  if (n.startsWith("linguistics")) return "lin";
  if (n.startsWith("lore")) return "lor";
  if (n.startsWith("perception")) return "per";
  if (n.startsWith("perform")) return "prf";
  if (n.startsWith("profession")) return "pro";
  if (n.startsWith("ride")) return "rid";
  if (n.startsWith("sense motive")) return "sen";
  if (n.startsWith("sleight of hand")) return "slt";
  if (n.startsWith("spellcraft")) return "spl";
  if (n.startsWith("stealth")) return "ste";
  if (n.startsWith("survival")) return "sur";
  if (n.startsWith("swim")) return "swm";
  if (n.startsWith("use magic device")) return "umd";
  return n.slice(0, 3);
}

export default class StatblockImporter {
  parse(text) {
    if (typeof text !== "string" || !text.trim()) {
      throw new TypeError("Expected a non-empty statblock string.");
    }

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const npc = {
      name: "",
      cr: 1,
      xpAward: 400,
      alignment: "n",
      size: "medium",
      creatureType: "humanoid",
      subtypes: [],
      abilities: {
        str: { base: 10, damage: 0, drain: 0, penalty: 0 },
        dex: { base: 10, damage: 0, drain: 0, penalty: 0 },
        con: { base: 10, damage: 0, drain: 0, penalty: 0 },
        int: { base: 10, damage: 0, drain: 0, penalty: 0 },
        wis: { base: 10, damage: 0, drain: 0, penalty: 0 },
        cha: { base: 10, damage: 0, drain: 0, penalty: 0 }
      },
      health: {
        hp: 10,
        maxHp: 10,
        tempHp: 0,
        nonlethal: 0,
        fastHealing: 0,
        regeneration: 0
      },
      speeds: {
        land: 30,
        burrow: 0,
        climb: 0,
        fly: 0,
        flyManeuverability: "average",
        swim: 0
      },
      senses: {
        visionPreset: "normal",
        darkvisionFeet: 0,
        lowLight: false,
        blindsenseFeet: 0,
        blindsightFeet: 0,
        tremorsenseFeet: 0,
        scent: false,
        seeInvisibility: false,
        trueSeeingFeet: 0,
        customSenses: ""
      },
      defenses: {
        naturalAC: 0,
        cmdNotes: "",
        srFormula: "",
        drEntries: [],
        energyResistances: [],
        immunities: [],
        vulnerabilities: [],
        conditionImmunities: []
      },
      conditions: {},
      skills: {},
      notes: {
        biography: "",
        description: "",
        gmNotes: ""
      },
      racialHDFormula: "",
      environment: "",
      organization: "",
      treasure: "",
      statblockSource: text
    };

    const features = [];
    const spellbooks = [];
    const spells = [];
    const actions = [];
    const items = [];

    const alignments = {
      lg: "lg", ng: "ng", cg: "cg",
      ln: "ln", n: "n", cn: "cn",
      le: "le", ne: "ne", ce: "ce"
    };

    const sizes = [
      "fine", "diminutive", "tiny", "small", "medium",
      "large", "huge", "gargantuan", "colossal"
    ];

    let currentSection = "header";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const upper = line.toUpperCase();

      if (upper === "DEFENSE") {
        currentSection = "defense";
        continue;
      }
      if (upper === "OFFENSE") {
        currentSection = "offense";
        continue;
      }
      if (upper === "STATISTICS") {
        currentSection = "statistics";
        continue;
      }
      if (upper === "SPECIAL ABILITIES") {
        currentSection = "special_abilities";
        continue;
      }
      if (upper === "ECOLOGY") {
        currentSection = "ecology";
        continue;
      }

      if (currentSection === "header") {
        const crMatch = line.match(/^(.*?)\s+CR\s+(\d+\/\d+|\d+)/i);
        if (crMatch) {
          npc.name = crMatch[1].trim();
          const crRaw = crMatch[2];
          if (crRaw.includes("/")) {
            const [num, den] = crRaw.split("/");
            npc.cr = parseFloat((Number(num) / Number(den)).toFixed(2));
          } else {
            npc.cr = Number(crRaw);
          }
          continue;
        }

        const xpMatch = line.match(/^XP\s+([\d,]+)/i);
        if (xpMatch) {
          npc.xpAward = Number(xpMatch[1].replace(/,/g, ""));
          continue;
        }

        const alignMatch = line.match(
          /^(LG|NG|CG|LN|N|CN|LE|NE|CE)\s+(Fine|Diminutive|Tiny|Small|Medium|Large|Huge|Gargantuan|Colossal)\s+([a-zA-Z\s]+)(?:\((.*?)\))?/i
        );
        if (alignMatch) {
          npc.alignment = alignments[alignMatch[1].toLowerCase()] ?? "n";
          npc.size = alignMatch[2].toLowerCase();
          npc.creatureType = alignMatch[3].trim().toLowerCase();
          if (alignMatch[4]) {
            npc.subtypes = alignMatch[4].split(/,\s*/).map((s) => s.trim().toLowerCase());
          }
          continue;
        }

        const initMatch = line.match(/Init\s+([+-]?\d+)/i);
        if (initMatch) {
          npc.initBonus = Number(initMatch[1]);
        }

        const sensesMatch = line.match(/Senses\s+(.*?)(?:;|$)/i);
        if (sensesMatch) {
          const sensesText = sensesMatch[1].toLowerCase();
          if (sensesText.includes("darkvision")) {
            const dv = sensesText.match(/darkvision\s+(\d+)\s*ft/);
            npc.senses.darkvisionFeet = dv ? Number(dv[1]) : 60;
            npc.senses.visionPreset = npc.senses.darkvisionFeet > 60 ? "darkvision120" : "darkvision";
          }
          if (sensesText.includes("low-light")) {
            npc.senses.lowLight = true;
          }
          if (sensesText.includes("blindsense")) {
            const bs = sensesText.match(/blindsense\s+(\d+)\s*ft/);
            npc.senses.blindsenseFeet = bs ? Number(bs[1]) : 30;
          }
          if (sensesText.includes("blindsight")) {
            const bs = sensesText.match(/blindsight\s+(\d+)\s*ft/);
            npc.senses.blindsightFeet = bs ? Number(bs[1]) : 30;
          }
          if (sensesText.includes("scent")) {
            npc.senses.scent = true;
          }
          if (sensesText.includes("see invisibility")) {
            npc.senses.seeInvisibility = true;
          }
          if (sensesText.includes("true seeing")) {
            npc.senses.trueSeeingFeet = 120;
          }
        }

        const percMatch = line.match(/Perception\s+([+-]?\d+)/i);
        if (percMatch) {
          npc.skills.per = { ranks: 1, total: Number(percMatch[1]) };
        }
      } else if (currentSection === "defense") {
        const acMatch = line.match(/AC\s+(\d+),\s*touch\s+(\d+),\s*flat-footed\s+(\d+)(?:\s*\((.*?)\))?/i);
        if (acMatch) {
          npc.acTotal = Number(acMatch[1]);
          npc.acTouch = Number(acMatch[2]);
          npc.acFlatFooted = Number(acMatch[3]);
          if (acMatch[4]) {
            const natMatch = acMatch[4].match(/([+-]?\d+)\s*natural/i);
            if (natMatch) {
              npc.defenses.naturalAC = Number(natMatch[1]);
            }
          }
          continue;
        }

        const hpMatch = line.match(/hp\s+(\d+)(?:\s*\((.*?)\))?/i);
        if (hpMatch) {
          npc.health.hp = Number(hpMatch[1]);
          npc.health.maxHp = Number(hpMatch[1]);
          if (hpMatch[2]) {
            npc.racialHDFormula = hpMatch[2].trim();
          }
          const fhMatch = line.match(/fast healing\s+(\d+)/i);
          if (fhMatch) npc.health.fastHealing = Number(fhMatch[1]);
          const regMatch = line.match(/regeneration\s+(\d+)/i);
          if (regMatch) npc.health.regeneration = Number(regMatch[1]);
          continue;
        }

        const savesMatch = line.match(/Fort\s+([+-]?\d+),\s*Ref\s+([+-]?\d+),\s*Will\s+([+-]?\d+)/i);
        if (savesMatch) {
          npc.saveFortBase = Number(savesMatch[1]);
          npc.saveRefBase = Number(savesMatch[2]);
          npc.saveWillBase = Number(savesMatch[3]);
          continue;
        }

        const drMatch = line.match(/DR\s+([^\s;]+)/i);
        if (drMatch) {
          const parts = drMatch[1].split("/");
          npc.defenses.drEntries.push({
            amount: Number(parts[0]),
            bypass: parts[1] ?? "-"
          });
        }

        const immMatch = line.match(/Immune\s+(.*?)(?:;|$)/i);
        if (immMatch) {
          npc.defenses.immunities = immMatch[1].split(/,\s*/).map((s) => s.trim().toLowerCase());
        }

        const resMatch = line.match(/Resist\s+(.*?)(?:;|$)/i);
        if (resMatch) {
          const resEntries = resMatch[1].split(/,\s*/);
          for (const re of resEntries) {
            const m = re.match(/([a-zA-Z]+)\s+(\d+)/);
            if (m) {
              npc.defenses.energyResistances.push({
                type: m[1].toLowerCase(),
                amount: Number(m[2])
              });
            }
          }
        }

        const srMatch = line.match(/SR\s+(\d+)/i);
        if (srMatch) {
          npc.defenses.srFormula = srMatch[1];
        }

        const weakMatch = line.match(/(?:Weaknesses|Vulnerable)\s+(.*?)(?:;|$)/i);
        if (weakMatch) {
          npc.defenses.vulnerabilities = weakMatch[1].split(/,\s*/).map((s) => s.trim().toLowerCase());
        }
      } else if (currentSection === "offense") {
        const speedMatch = line.match(/^Speed\s+(.*)/i);
        if (speedMatch) {
          const parts = speedMatch[1].split(/,\s*/);
          for (const p of parts) {
            const landM = p.match(/^(\d+)\s*ft\.?/i);
            if (landM && !p.includes("fly") && !p.includes("swim") && !p.includes("climb") && !p.includes("burrow")) {
              npc.speeds.land = Number(landM[1]);
            }
            const flyM = p.match(/fly\s+(\d+)\s*ft\.?(?:\s*\((.*?)\))?/i);
            if (flyM) {
              npc.speeds.fly = Number(flyM[1]);
              if (flyM[2]) npc.speeds.flyManeuverability = flyM[2].trim().toLowerCase();
            }
            const swimM = p.match(/swim\s+(\d+)\s*ft\.?/i);
            if (swimM) npc.speeds.swim = Number(swimM[1]);
            const climbM = p.match(/climb\s+(\d+)\s*ft\.?/i);
            if (climbM) npc.speeds.climb = Number(climbM[1]);
            const burrowM = p.match(/burrow\s+(\d+)\s*ft\.?/i);
            if (burrowM) npc.speeds.burrow = Number(burrowM[1]);
          }
          continue;
        }

        const meleeMatch = line.match(/^Melee\s+(.*)/i);
        if (meleeMatch) {
          const attackClauses = meleeMatch[1].split(/(?:,\s*or\s*|,\s*(?=\d+\s+[a-zA-Z]+|[a-zA-Z]+\s+[+-]))/i);
          for (const clause of attackClauses) {
            const atkM = clause.match(/^(?:(\d+)\s+)?([a-zA-Z\s]+?)\s+([+-]\d+)(?:\s*\((.*?)\))?/);
            if (atkM) {
              const count = atkM[1] ? Number(atkM[1]) : 1;
              const name = atkM[2].trim();
              const bonus = Number(atkM[3]);
              const damageStr = atkM[4] ?? "1d6";
              actions.push({
                name: count > 1 ? `${count} ${name}` : name,
                actionType: "mwak",
                attackBonusFormula: String(bonus),
                damageParts: [{ formula: damageStr, type: "physical" }],
                primaryAttack: true
              });
            }
          }
          continue;
        }

        const rangedMatch = line.match(/^Ranged\s+(.*)/i);
        if (rangedMatch) {
          const atkM = rangedMatch[1].match(/^([a-zA-Z\s]+?)\s+([+-]\d+)(?:\s*\((.*?)\))?/);
          if (atkM) {
            const name = atkM[1].trim();
            const bonus = Number(atkM[2]);
            const damageStr = atkM[3] ?? "1d6";
            actions.push({
              name,
              actionType: "rwak",
              attackBonusFormula: String(bonus),
              damageParts: [{ formula: damageStr, type: "physical" }],
              primaryAttack: true
            });
            items.push({
              name,
              quantity: 1,
              equipped: true,
              slot: "weapon"
            });
          }
          continue;
        }

        const saMatch = line.match(/^Special Attacks\s+(.*)/i);
        if (saMatch) {
          const saList = saMatch[1].split(/,\s*/);
          for (const sa of saList) {
            features.push({
              name: sa.trim(),
              abilityType: "ex",
              enabled: true
            });
          }
          continue;
        }

        const spellsMatch = line.match(/^(?:Spells Known|Spells Prepared|Spell-Like Abilities)\s*(?:\((.*?)\))?/i);
        if (spellsMatch) {
          let cl = 1;
          if (spellsMatch[1]) {
            const clM = spellsMatch[1].match(/CL\s+(\d+)/i);
            if (clM) cl = Number(clM[1]);
          }
          spellbooks.push({
            name: line.split("(")[0].trim(),
            castingType: line.toLowerCase().includes("known") ? "spontaneous" : "prepared",
            casterLevelFormula: String(cl)
          });
          continue;
        }

        const spellLevelMatch = line.match(/^(\d+)(?:st|nd|rd|th)?\s*(?:\((.*?)\))?—\s*(.*)/i);
        if (spellLevelMatch) {
          const lvl = Number(spellLevelMatch[1]);
          const spellNames = spellLevelMatch[3].split(/,\s*/);
          for (const spName of spellNames) {
            const cleanName = spName.replace(/\s*\(.*?\)/, "").trim();
            spells.push({
              name: cleanName,
              level: lvl,
              school: "evo"
            });
          }
        }
      } else if (currentSection === "statistics") {
        const statsMatch = line.match(/Str\s+(\d+|—|-),\s*Dex\s+(\d+|—|-),\s*Con\s+(\d+|—|-),\s*Int\s+(\d+|—|-),\s*Wis\s+(\d+|—|-),\s*Cha\s+(\d+|—|-)/i);
        if (statsMatch) {
          const parseScore = (v) => (v === "—" || v === "-" ? null : Number(v));
          npc.abilities.str.base = parseScore(statsMatch[1]) ?? 10;
          npc.abilities.dex.base = parseScore(statsMatch[2]) ?? 10;
          npc.abilities.con.base = parseScore(statsMatch[3]) ?? 10;
          npc.abilities.int.base = parseScore(statsMatch[4]) ?? 10;
          npc.abilities.wis.base = parseScore(statsMatch[5]) ?? 10;
          npc.abilities.cha.base = parseScore(statsMatch[6]) ?? 10;
          continue;
        }

        const babMatch = line.match(/Base Atk\s+([+-]?\d+);\s*CMB\s+([+-]?\d+);\s*CMD\s+(\d+)/i);
        if (babMatch) {
          npc.baseAtk = Number(babMatch[1]);
          npc.cmb = Number(babMatch[2]);
          npc.cmd = Number(babMatch[3]);
          continue;
        }

        const featsMatch = line.match(/^Feats\s+(.*)/i);
        if (featsMatch) {
          const featNames = featsMatch[1].split(/,\s*/);
          for (const fn of featNames) {
            features.push({
              name: fn.trim(),
              abilityType: "na",
              enabled: true
            });
          }
          continue;
        }

        const skillsMatch = line.match(/^Skills\s+(.*)/i);
        if (skillsMatch) {
          const skillEntries = skillsMatch[1].split(/,\s*/);
          for (const se of skillEntries) {
            const sm = se.match(/^([a-zA-Z\s()]+)\s+([+-]?\d+)/);
            if (sm) {
              const skillName = sm[1].trim();
              const bonus = Number(sm[2]);
              const key = skillKeyFromName(skillName);
              npc.skills[key] = { name: skillName, ranks: 1, total: bonus };
            }
          }
          continue;
        }

        const sqMatch = line.match(/^SQ\s+(.*)/i);
        if (sqMatch) {
          const sqList = sqMatch[1].split(/,\s*/);
          for (const sq of sqList) {
            features.push({
              name: sq.trim(),
              abilityType: "ex",
              enabled: true
            });
          }
        }
      } else if (currentSection === "ecology") {
        const envMatch = line.match(/^Environment\s+(.*)/i);
        if (envMatch) npc.environment = envMatch[1].trim();
        const orgMatch = line.match(/^Organization\s+(.*)/i);
        if (orgMatch) npc.organization = orgMatch[1].trim();
        const trMatch = line.match(/^Treasure\s+(.*)/i);
        if (trMatch) npc.treasure = trMatch[1].trim();
      } else if (currentSection === "special_abilities") {
        const saMatch = line.match(/^([a-zA-Z\s]+?)\s*\(([A-Za-z]+)\)\s*:?\s*(.*)/i);
        if (saMatch) {
          features.push({
            name: saMatch[1].trim(),
            abilityType: saMatch[2].toLowerCase(),
            description: saMatch[3].trim(),
            enabled: true
          });
        }
      }
    }

    if (!npc.name && lines[0]) {
      npc.name = lines[0].split(/\s+CR/)[0].trim();
    }

    return {
      npc,
      features,
      spellbooks,
      spells,
      actions,
      items
    };
  }
}
