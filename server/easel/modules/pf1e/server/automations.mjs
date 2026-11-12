const v = (name) => ({ var: name });
const a = (name) => ({ arg: name });
const p = (...path) => ({ path });
const e = (expr, ...args) => ({ expr, args });
const eq = (x, y) => e("equals", x, y);
const ne = (x, y) => e("notEquals", x, y);
const and = (...args) => e("and", ...args);
const or = (...args) => e("or", ...args);
const add = (x, y) => e("add", x, y);
const sub = (x, y) => e("subtract", x, y);
const mul = (x, y) => e("multiply", x, y);
const lt = (x, y) => e("lessThan", x, y);
const le = (x, y) => e("lessOrEqual", x, y);
const gt = (x, y) => e("greaterThan", x, y);
const ge = (x, y) => e("greaterOrEqual", x, y);
const set = (target, value) => ({ op: "set", target, value });
const letValue = (name, value) => ({ op: "let", name, value });
const check = (condition, message) => ({ op: "check", condition, message });
const branch = (condition, then, otherwise = []) => ({
  op: "if",
  condition,
  then,
  else: otherwise
});
const ret = (value) => ({ op: "return", value });
const emit = (name, value) => ({ op: "emit", name, value });

export function definitions() {
  const applyDamage = {
    name: "pf1e.ApplyDamage",
    parameters: ["actorId", "amount", "isNonlethal"],
    steps: [
      { op: "load", type: "easel.pf1e.Actor", id: a("actorId"), as: "target" },
      letValue("dmg", a("amount")),
      branch(
        a("isNonlethal"),
        [
          { op: "delta", target: p("target", "health", "nonlethal"), value: v("dmg") },
          branch(
            ge(p("target", "health", "nonlethal"), p("target", "health", "hp")),
            [set(p("target", "conditions", "staggered"), true)]
          )
        ],
        [
          letValue("temp", p("target", "health", "tempHp")),
          branch(
            and(gt(v("temp"), 0), gt(v("dmg"), 0)),
            [
              branch(
                ge(v("temp"), v("dmg")),
                [
                  set(p("target", "health", "tempHp"), sub(v("temp"), v("dmg"))),
                  set(v("dmg"), 0)
                ],
                [
                  set(p("target", "health", "tempHp"), 0),
                  set(v("dmg"), sub(v("dmg"), v("temp")))
                ]
              )
            ]
          ),
          branch(
            gt(v("dmg"), 0),
            [
              set(
                p("target", "health", "hp"),
                sub(p("target", "health", "hp"), v("dmg"))
              )
            ],
            [
              branch(
                lt(v("dmg"), 0),
                [
                  letValue("heal", sub(0, v("dmg"))),
                  branch(
                    gt(p("target", "health", "nonlethal"), 0),
                    [
                      branch(
                        ge(p("target", "health", "nonlethal"), v("heal")),
                        [set(p("target", "health", "nonlethal"), sub(p("target", "health", "nonlethal"), v("heal")))],
                        [set(p("target", "health", "nonlethal"), 0)]
                      )
                    ]
                  ),
                  letValue("healedHp", add(p("target", "health", "hp"), v("heal"))),
                  branch(
                    gt(v("healedHp"), p("target", "health", "maxHp")),
                    [set(p("target", "health", "hp"), p("target", "health", "maxHp"))],
                    [set(p("target", "health", "hp"), v("healedHp"))]
                  ),
                  branch(
                    gt(p("target", "health", "hp"), 0),
                    [
                      set(p("target", "conditions", "dying"), false),
                      set(p("target", "conditions", "disabled"), false),
                      set(p("target", "conditions", "unconscious"), false)
                    ]
                  )
                ]
              )
            ]
          ),
          letValue("conScore", p("target", "abilities", "con", "base")),
          letValue("deathThreshold", -10),
          branch(
            gt(v("conScore"), 0),
            [set(v("deathThreshold"), sub(0, v("conScore")))]
          ),
          branch(
            le(p("target", "health", "hp"), v("deathThreshold")),
            [
              set(p("target", "conditions", "dead"), true),
              set(p("target", "conditions", "dying"), false),
              set(p("target", "conditions", "disabled"), false),
              set(p("target", "conditions", "unconscious"), true)
            ],
            [
              branch(
                lt(p("target", "health", "hp"), 0),
                [
                  set(p("target", "conditions", "dying"), true),
                  set(p("target", "conditions", "disabled"), false),
                  set(p("target", "conditions", "unconscious"), true)
                ],
                [
                  branch(
                    eq(p("target", "health", "hp"), 0),
                    [
                      set(p("target", "conditions", "disabled"), true),
                      set(p("target", "conditions", "dying"), false)
                    ]
                  )
                ]
              )
            ]
          )
        ]
      ),
      { op: "save", record: "target" },
      emit("pf1e.damageApplied", {
        actorId: a("actorId"),
        hp: p("target", "health", "hp"),
        nonlethal: p("target", "health", "nonlethal")
      }),
      ret(p("target", "health"))
    ]
  };

  const spendActionUses = {
    name: "pf1e.SpendActionUses",
    parameters: ["recordType", "recordId", "usesCost"],
    steps: [
      branch(
        eq(a("recordType"), "Feature"),
        [
          { op: "load", type: "easel.pf1e.Feature", id: a("recordId"), as: "feature" },
          check(ge(p("feature", "charges", "value"), a("usesCost")), "Not enough charges."),
          set(p("feature", "charges", "value"), sub(p("feature", "charges", "value"), a("usesCost"))),
          { op: "save", record: "feature" }
        ]
      ),
      branch(
        eq(a("recordType"), "Item"),
        [
          { op: "load", type: "easel.pf1e.Item", id: a("recordId"), as: "item" },
          check(ge(p("item", "charges", "value"), a("usesCost")), "Not enough charges."),
          set(p("item", "charges", "value"), sub(p("item", "charges", "value"), a("usesCost"))),
          { op: "save", record: "item" }
        ]
      ),
      branch(
        eq(a("recordType"), "Spell"),
        [
          { op: "load", type: "easel.pf1e.Spell", id: a("recordId"), as: "spell" },
          check(ge(p("spell", "preparation", "preparedCount"), a("usesCost")), "Spell not prepared."),
          set(p("spell", "preparation", "preparedCount"), sub(p("spell", "preparation", "preparedCount"), a("usesCost"))),
          { op: "save", record: "spell" }
        ]
      ),
      emit("pf1e.usesSpent", {
        recordType: a("recordType"),
        recordId: a("recordId"),
        cost: a("usesCost")
      }),
      ret(true)
    ]
  };

  const rest = {
    name: "pf1e.Rest",
    parameters: ["actorId", "isFullBedrest", "hd"],
    steps: [
      { op: "load", type: "easel.pf1e.Actor", id: a("actorId"), as: "target" },
      letValue("mult", 1),
      letValue("abilityHeal", 1),
      branch(
        a("isFullBedrest"),
        [
          set(v("mult"), 2),
          set(v("abilityHeal"), 2)
        ]
      ),
      letValue("effectiveHd", 1),
      branch(
        gt(a("hd"), 0),
        [set(v("effectiveHd"), a("hd"))]
      ),
      letValue("healAmount", mul(v("mult"), v("effectiveHd"))),
      set(p("target", "health", "nonlethal"), 0),
      letValue("newHp", add(p("target", "health", "hp"), v("healAmount"))),
      branch(
        gt(v("newHp"), p("target", "health", "maxHp")),
        [set(p("target", "health", "hp"), p("target", "health", "maxHp"))],
        [set(p("target", "health", "hp"), v("newHp"))]
      ),
      branch(
        p("target", "conditions", "exhausted"),
        [
          set(p("target", "conditions", "exhausted"), false),
          set(p("target", "conditions", "fatigued"), true)
        ],
        [
          branch(
            p("target", "conditions", "fatigued"),
            [set(p("target", "conditions", "fatigued"), false)]
          )
        ]
      ),
      branch(
        gt(p("target", "abilities", "str", "damage"), 0),
        [
          branch(
            gt(p("target", "abilities", "str", "damage"), v("abilityHeal")),
            [set(p("target", "abilities", "str", "damage"), sub(p("target", "abilities", "str", "damage"), v("abilityHeal")))],
            [set(p("target", "abilities", "str", "damage"), 0)]
          )
        ]
      ),
      branch(
        gt(p("target", "abilities", "dex", "damage"), 0),
        [
          branch(
            gt(p("target", "abilities", "dex", "damage"), v("abilityHeal")),
            [set(p("target", "abilities", "dex", "damage"), sub(p("target", "abilities", "dex", "damage"), v("abilityHeal")))],
            [set(p("target", "abilities", "dex", "damage"), 0)]
          )
        ]
      ),
      branch(
        gt(p("target", "abilities", "con", "damage"), 0),
        [
          branch(
            gt(p("target", "abilities", "con", "damage"), v("abilityHeal")),
            [set(p("target", "abilities", "con", "damage"), sub(p("target", "abilities", "con", "damage"), v("abilityHeal")))],
            [set(p("target", "abilities", "con", "damage"), 0)]
          )
        ]
      ),
      branch(
        gt(p("target", "abilities", "int", "damage"), 0),
        [
          branch(
            gt(p("target", "abilities", "int", "damage"), v("abilityHeal")),
            [set(p("target", "abilities", "int", "damage"), sub(p("target", "abilities", "int", "damage"), v("abilityHeal")))],
            [set(p("target", "abilities", "int", "damage"), 0)]
          )
        ]
      ),
      branch(
        gt(p("target", "abilities", "wis", "damage"), 0),
        [
          branch(
            gt(p("target", "abilities", "wis", "damage"), v("abilityHeal")),
            [set(p("target", "abilities", "wis", "damage"), sub(p("target", "abilities", "wis", "damage"), v("abilityHeal")))],
            [set(p("target", "abilities", "wis", "damage"), 0)]
          )
        ]
      ),
      branch(
        gt(p("target", "abilities", "cha", "damage"), 0),
        [
          branch(
            gt(p("target", "abilities", "cha", "damage"), v("abilityHeal")),
            [set(p("target", "abilities", "cha", "damage"), sub(p("target", "abilities", "cha", "damage"), v("abilityHeal")))],
            [set(p("target", "abilities", "cha", "damage"), 0)]
          )
        ]
      ),
      { op: "save", record: "target" },
      emit("pf1e.restCompleted", {
        actorId: a("actorId"),
        isFullBedrest: a("isFullBedrest")
      }),
      ret(p("target", "health"))
    ]
  };

  const advanceTurn = {
    name: "pf1e.AdvanceTurn",
    parameters: ["actorId"],
    steps: [
      { op: "load", type: "easel.pf1e.Actor", id: a("actorId"), as: "target" },
      letValue("fh", p("target", "health", "fastHealing")),
      branch(
        gt(v("fh"), 0),
        [
          letValue("regHp", add(p("target", "health", "hp"), v("fh"))),
          branch(
            gt(v("regHp"), p("target", "health", "maxHp")),
            [set(p("target", "health", "hp"), p("target", "health", "maxHp"))],
            [set(p("target", "health", "hp"), v("regHp"))]
          )
        ]
      ),
      letValue("regen", p("target", "health", "regeneration")),
      branch(
        gt(v("regen"), 0),
        [
          letValue("regHp2", add(p("target", "health", "hp"), v("regen"))),
          branch(
            gt(v("regHp2"), p("target", "health", "maxHp")),
            [set(p("target", "health", "hp"), p("target", "health", "maxHp"))],
            [set(p("target", "health", "hp"), v("regHp2"))]
          )
        ]
      ),
      branch(
        p("target", "conditions", "bleeding"),
        [set(p("target", "health", "hp"), sub(p("target", "health", "hp"), 1))]
      ),
      { op: "save", record: "target" },
      emit("pf1e.turnAdvanced", { actorId: a("actorId") }),
      ret(p("target", "health"))
    ]
  };

  const transferItem = {
    name: "pf1e.TransferItem",
    parameters: ["itemId", "targetActorId", "targetContainerId"],
    steps: [
      { op: "load", type: "easel.pf1e.Item", id: a("itemId"), as: "item" },
      set(p("item", "actorId"), a("targetActorId")),
      set(p("item", "containerId"), a("targetContainerId")),
      set(p("item", "equipped"), false),
      { op: "save", record: "item" },
      emit("pf1e.itemTransferred", {
        itemId: a("itemId"),
        targetActorId: a("targetActorId"),
        targetContainerId: a("targetContainerId")
      }),
      ret(v("item"))
    ]
  };

  return [applyDamage, spendActionUses, rest, advanceTurn, transferItem];
}
