export default class ExampleContent {
  packs(system) {
    if (system !== "pf1e") return [];
    return [
      {
        id: "pf1ehomebrew.example",
        name: "Example house content",
        source: "House rules",
        entries: [
          { kind: "item", type: "consumable", name: "Healing salve", price: 25, weight: 0.5, use: { formula: "1d6", healing: true }, description: "A jar of herbal paste. Rubbed into a wound over one minute, it heals 1d6 hit points." },
          { kind: "item", type: "magic", name: "Sailor's charm", slot: "neck", price: 400, weight: 0, changes: [{ target: "skill.sai", type: "competence", value: 2 }, { target: "skill.swm", type: "competence", value: 2 }], description: "+2 competence bonus on Sailing and Swim checks." },
          { kind: "feat", name: "Sea Legs", type: "General", prerequisites: "", benefit: "+2 on Acrobatics and Sailing checks.", changes: [{ target: "skill.acr", type: "untyped", value: 2 }, { target: "skill.sai", type: "untyped", value: 2 }] },
          { kind: "spell", name: "Spark", school: "evocation", levels: { wizard: 0, druid: 0 }, level: 0, castingTime: "1 standard action", components: "V, S", range: "Close (25 ft. + 5 ft./2 levels)", duration: "Instantaneous", save: "", description: "A ranged touch attack throws a spark that deals 1d3 electricity damage and lights unattended flammable objects.", roll: { count: "1", die: 3, type: "electricity", save: "" }, attack: "ranged touch" },
          { kind: "buff", name: "Wind at Your Back", group: "House", text: "+10 feet of speed and +1 on Sailing checks while the weather holds.", changes: [{ target: "speed", type: "circumstance", value: 10 }, { target: "skill.sai", type: "circumstance", value: 1 }] },
        ],
      },
    ];
  }
}
