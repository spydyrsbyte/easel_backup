export default class ExampleHouseRules {
  constructor() {
    this.name = "Example house rules";
    this.systems = ["pf1e"];
  }

  install(rules) {
    rules.options.hitPoints = "max";

    rules.system.skills.sai = { name: "Sailing", ability: "wis" };

    rules.system.conditions.inspired = {
      name: "Inspired",
      text: "A reward for a memorable moment: +1 on attack rolls, saving throws and skill checks until the end of the scene.",
      changes: [
        { target: "attack", type: "untyped", value: 1 },
        { target: "saves", type: "untyped", value: 1 },
        { target: "skills", type: "untyped", value: 1 },
      ],
    };

    rules.on("derived", (sheet) => {
      const constitution = sheet.abilities.con.score;
      if (sheet.hp.status === "dead" && constitution !== null && sheet.hp.current > -(constitution + sheet.level)) sheet.hp.status = "dying";
    });

    rules.on("check", (roll) => {
      if (roll.natural !== 20 || roll.take) return undefined;
      const total = roll.total + 10;
      return { ...roll, total, success: roll.dc === null ? null : total >= roll.dc };
    });
  }
}
