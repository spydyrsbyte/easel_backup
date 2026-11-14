const IS_KINETICIST = "@classes.kineticist.level >= 1";
const tab = { tab: "kineticist", tabLabel: "Kineticist", when: IS_KINETICIST };

export default class Kineticist {
  constructor() {
    this.name = "Kineticist";
    this.systems = ["pf1e"];
  }

  install(game) {
    game.kinds.set("talent", {
      id: "talent",
      label: "Wild talents",
      singular: "wild talent",
      icon: "bolt",
      describe: (entry) => [entry.group || "", entry.element || "", entry.burn ? entry.burn + " burn" : ""].filter(Boolean).join(" · "),
      group: (entry) => entry.group || "",
    });

    game.sections.set("kineticist.burn", { ...tab, title: "Burn", type: "resource", resource: "burn" });
    game.sections.set("kineticist.numbers", {
      ...tab,
      title: "",
      type: "values",
      rows: [
        { label: "Nonlethal damage from burn, healed only by rest", value: "@resources.burn * @level" },
        { label: "Elemental overflow: bonus on blast attacks", value: "min(@resources.burn, floor(@classes.kineticist.level / 3))" },
        { label: "Elemental overflow: bonus on blast damage", value: "2 * min(@resources.burn, floor(@classes.kineticist.level / 3))" },
      ],
    });
    game.sections.set("kineticist.gather", { ...tab, title: "Gather power", type: "toggles", ids: ["gatherPower"], text: "Spend a move action gathering power to lower the burn cost of the next blast talent by 1. It switches off when a blast is made." });
    game.sections.set("kineticist.blasts", { ...tab, title: "Kinetic blasts", type: "attacks", tag: "blast" });
    game.sections.set("kineticist.simple", { ...tab, title: "Simple blasts known", type: "list", kind: "talent", group: "Simple blast", addLabel: "Add a simple blast", emptyText: "Choose an element's simple blast to gain its kinetic blast attack." });
    game.sections.set("kineticist.infusions", { ...tab, title: "Infusions", type: "list", kind: "talent", group: "Infusion", addLabel: "Add an infusion", useLabel: "Accept burn", emptyText: "No infusions known yet." });
    game.sections.set("kineticist.utility", { ...tab, title: "Utility and defense talents", type: "list", kind: "talent", group: "Utility", addLabel: "Add a utility talent", emptyText: "No utility talents known yet." });

    game.rolls.wrap("attack", (original, context) => {
      const card = original(context);
      const attack = context.sheet.derived.attacks.find((entry) => entry.id === context.id);
      if (attack && (attack.tags || []).includes("blast") && context.sheet.doc.toggles.gatherPower)
        game.edit(context.record, (doc) => {
          doc.toggles.gatherPower = false;
        });
      return card;
    });
  }
}
