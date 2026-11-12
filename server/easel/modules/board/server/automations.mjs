const v = (name) => ({ var: name });
const a = (name) => ({ arg: name });
const principal = { context: "principal" };
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
const set = (target, value) => ({ op: "set", target, value });
const letValue = (name, value) => ({ op: "let", name, value });
const check = (condition, message) => ({ op: "check", condition, message });
const branch = (condition, then, otherwise = []) => ({
  op: "if",
  condition,
  then,
  else: otherwise,
});
const ret = (value) => ({ op: "return", value });
const call = (name, args, as) => ({ op: "call", name, args, as });
const each = (value, item, steps, index) => ({
  op: "each",
  value,
  item,
  steps,
  ...(index ? { index } : {}),
});
const load = { op: "load", type: "easel.board.Match", id: a("match"), as: "state" };
const save = { op: "save", record: "state" };
const changed = {
  op: "emit",
  name: "easel.board.changed",
  value: { revision: p("state", "revision") },
};
const finish = [save, changed, ret(v("state"))];
const white = eq(p("state", "turn"), "white");
const occupied = (piece) => ne(p(piece, "side"), "");
const inside = (x, y) => and(le(0, x), lt(x, 8), le(0, y), lt(y, 8));
const dimensions = [
  letValue("source", p("state", "squares", a("from"))),
  letValue("target", p("state", "squares", a("to"))),
  letValue("dx", sub(p("target", "x"), p("source", "x"))),
  letValue("dy", sub(p("target", "y"), p("source", "y"))),
  letValue("ax", v("dx")),
  letValue("ay", v("dy")),
  branch(lt(v("ax"), 0), [set(v("ax"), mul(v("ax"), -1))]),
  branch(lt(v("ay"), 0), [set(v("ay"), mul(v("ay"), -1))]),
];

export function definitions() {
  const reset = {
    name: "easel.board.Reset",
    parameters: ["match", "squares"],
    steps: [
      load,
      set(p("state", "squares"), a("squares")),
      set(p("state", "turn"), "white"),
      set(p("state", "history"), []),
      set(p("state", "chain"), -1),
      set(p("state", "winner"), ""),
      set(p("state", "result"), ""),
      set(p("state", "drawOffer"), ""),
      set(p("state", "captured"), []),
      set(p("state", "clock"), { white: 0, black: 0 }),
      set(p("state", "turnStarted"), 0),
      set(p("state", "seats"), { white: "", black: "" }),
      set(p("state", "names"), { white: "", black: "" }),
      { op: "delta", target: p("state", "revision"), value: 1 },
      ...finish,
    ],
  };
  const mobility = {
    name: "easel.board.Mobility",
    parameters: ["squares", "side"],
    steps: [
      each(
        a("squares"),
        "piece",
        [
          branch(eq(p("piece", "side"), a("side")), [
            call("easel.board.Jumps", [a("squares"), v("index")], "jumps"),
            branch(lt(0, e("length", v("jumps"))), [ret(true)]),
            each(
              [
                { x: -1, y: -1 },
                { x: 1, y: -1 },
                { x: -1, y: 1 },
                { x: 1, y: 1 },
              ],
              "direction",
              [
                letValue("x", add(p("piece", "x"), p("direction", "x"))),
                letValue("y", add(p("piece", "y"), p("direction", "y"))),
                branch(inside(v("x"), v("y")), [
                  branch(
                    and(
                      eq(p("squares", add(mul(v("y"), 8), v("x")), "side"), ""),
                      or(
                        eq(p("piece", "kind"), "king"),
                        and(
                          eq(a("side"), "white"),
                          eq(p("direction", "y"), -1),
                        ),
                        and(eq(a("side"), "black"), eq(p("direction", "y"), 1)),
                      ),
                    ),
                    [ret(true)],
                  ),
                ]),
              ],
            ),
          ]),
        ],
        "index",
      ),
      ret(false),
    ],
  };
  const seat = {
    name: "easel.board.Seat",
    parameters: ["match", "name", "side"],
    steps: [
      load,
      check(
        or(eq(a("side"), "white"), eq(a("side"), "black")),
        "Choose a side.",
      ),
      check(
        or(
          eq(p("state", "seats", a("side")), ""),
          eq(p("state", "seats", a("side")), principal),
        ),
        "That seat is occupied.",
      ),
      check(
        and(
          ne(p("state", "seats", "white"), principal),
          ne(p("state", "seats", "black"), principal),
        ),
        "You already have a seat.",
      ),
      set(p("state", "seats", a("side")), principal),
      set(p("state", "names", a("side")), a("name")),
      { op: "delta", target: p("state", "revision"), value: 1 },
      ...finish,
    ],
  };
  const jumps = {
    name: "easel.board.Jumps",
    parameters: ["squares", "from"],
    steps: [
      letValue("piece", p("squares", a("from"))),
      letValue("result", []),
      each(
        [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: -1, y: 1 },
          { x: 1, y: 1 },
        ],
        "direction",
        [
          letValue("x", add(p("piece", "x"), mul(p("direction", "x"), 2))),
          letValue("y", add(p("piece", "y"), mul(p("direction", "y"), 2))),
          branch(and(occupied("piece"), inside(v("x"), v("y"))), [
            letValue("landing", add(mul(v("y"), 8), v("x"))),
            letValue(
              "middle",
              p(
                "squares",
                add(
                  mul(add(p("piece", "y"), p("direction", "y")), 8),
                  add(p("piece", "x"), p("direction", "x")),
                ),
              ),
            ),
            branch(
              and(
                eq(p("squares", v("landing"), "side"), ""),
                occupied("middle"),
                ne(p("middle", "side"), p("piece", "side")),
                or(
                  eq(p("piece", "kind"), "king"),
                  and(
                    eq(p("piece", "side"), "white"),
                    eq(p("direction", "y"), -1),
                  ),
                  and(
                    eq(p("piece", "side"), "black"),
                    eq(p("direction", "y"), 1),
                  ),
                ),
              ),
              [{ op: "append", target: v("result"), value: v("landing") }],
            ),
          ]),
        ],
      ),
      ret(v("result")),
    ],
  };
  const move = {
    name: "easel.board.Move",
    parameters: ["match", "from", "to", "revision"],
    steps: [
      load,
      check(
        eq(p("state", "revision"), a("revision")),
        "The board changed. Try again.",
      ),
      check(eq(p("state", "winner"), ""), "This game has finished."),
      check(
        and(
          ne(p("state", "seats", "white"), ""),
          ne(p("state", "seats", "black"), ""),
        ),
        "Both players must take a seat.",
      ),
      check(
        eq(p("state", "seats", p("state", "turn")), principal),
        "It is not your turn.",
      ),
      check(
        and(
          le(0, a("from")),
          lt(a("from"), 64),
          le(0, a("to")),
          lt(a("to"), 64),
          ne(a("from"), a("to")),
        ),
        "Choose two board squares.",
      ),
      ...dimensions,
      check(
        eq(p("source", "side"), p("state", "turn")),
        "Choose one of your pieces.",
      ),
      check(
        ne(p("target", "side"), p("source", "side")),
        "You cannot capture your own piece.",
      ),
      letValue("capture", -1),
      letValue("mover", p("source", "kind")),
      letValue("taken", p("target", "kind")),
      letValue("promoted", false),
      letValue("continued", false),
      letValue("crowned", false),
      branch(
        eq(p("state", "game"), "chess"),
        [
          letValue("legal", false),
          branch(eq(p("source", "kind"), "knight"), [
            set(
              v("legal"),
              or(
                and(eq(v("ax"), 1), eq(v("ay"), 2)),
                and(eq(v("ax"), 2), eq(v("ay"), 1)),
              ),
            ),
          ]),
          branch(eq(p("source", "kind"), "king"), [
            set(v("legal"), and(le(v("ax"), 1), le(v("ay"), 1))),
          ]),
          branch(eq(p("source", "kind"), "rook"), [
            set(v("legal"), or(eq(v("dx"), 0), eq(v("dy"), 0))),
          ]),
          branch(eq(p("source", "kind"), "bishop"), [
            set(v("legal"), eq(v("ax"), v("ay"))),
          ]),
          branch(eq(p("source", "kind"), "queen"), [
            set(
              v("legal"),
              or(eq(v("dx"), 0), eq(v("dy"), 0), eq(v("ax"), v("ay"))),
            ),
          ]),
          letValue("forward", 1),
          branch(white, [set(v("forward"), -1)]),
          branch(eq(p("source", "kind"), "pawn"), [
            set(
              v("legal"),
              or(
                and(
                  eq(v("dx"), 0),
                  eq(p("target", "side"), ""),
                  or(
                    eq(v("dy"), v("forward")),
                    and(
                      eq(v("dy"), mul(v("forward"), 2)),
                      or(
                        and(white, eq(p("source", "y"), 6)),
                        and(e("not", white), eq(p("source", "y"), 1)),
                      ),
                    ),
                  ),
                ),
                and(
                  eq(v("ax"), 1),
                  eq(v("dy"), v("forward")),
                  occupied("target"),
                ),
              ),
            ),
          ]),
          check(v("legal"), "That piece cannot move there."),
          branch(ne(p("source", "kind"), "knight"), [
            each(
              p("state", "squares"),
              "square",
              [
                branch(
                  and(
                    occupied("square"),
                    ne(v("index"), a("from")),
                    ne(v("index"), a("to")),
                    le(p("square", "x"), e("add", p("source", "x"), v("ax"))),
                    eq(
                      mul(sub(p("square", "x"), p("source", "x")), v("dy")),
                      mul(sub(p("square", "y"), p("source", "y")), v("dx")),
                    ),
                    lt(
                      add(
                        mul(sub(p("square", "x"), p("source", "x")), v("dx")),
                        mul(sub(p("square", "y"), p("source", "y")), v("dy")),
                      ),
                      add(mul(v("dx"), v("dx")), mul(v("dy"), v("dy"))),
                    ),
                    lt(
                      0,
                      add(
                        mul(sub(p("square", "x"), p("source", "x")), v("dx")),
                        mul(sub(p("square", "y"), p("source", "y")), v("dy")),
                      ),
                    ),
                  ),
                  [check(false, "Another piece blocks the path.")],
                ),
              ],
              "index",
            ),
          ]),
        ],
        [
          check(
            eq(p("target", "side"), ""),
            "Checkers must land on an empty square.",
          ),
          check(
            or(eq(p("state", "chain"), -1), eq(p("state", "chain"), a("from"))),
            "Continue jumping with the same piece.",
          ),
          call("easel.board.Jumps", [p("state", "squares"), a("from")], "jumps"),
          branch(
            e("contains", v("jumps"), a("to")),
            [set(v("capture"), e("divide", add(a("from"), a("to")), 2))],
            [
              check(
                eq(p("state", "chain"), -1),
                "You must continue the capture.",
              ),
              check(
                and(
                  eq(v("ax"), 1),
                  eq(v("ay"), 1),
                  or(
                    eq(p("source", "kind"), "king"),
                    and(white, eq(v("dy"), -1)),
                    and(e("not", white), eq(v("dy"), 1)),
                  ),
                ),
                "That checker cannot move there.",
              ),
              each(
                p("state", "squares"),
                "piece",
                [
                  branch(eq(p("piece", "side"), p("state", "turn")), [
                    call(
                      "easel.board.Jumps",
                      [p("state", "squares"), v("index")],
                      "available",
                    ),
                    check(
                      eq(e("length", v("available")), 0),
                      "A capture is available and must be taken.",
                    ),
                  ]),
                ],
                "index",
              ),
            ],
          ),
        ],
      ),
      set(p("state", "squares", a("to"), "side"), p("source", "side")),
      set(p("state", "squares", a("to"), "kind"), p("source", "kind")),
      set(p("state", "squares", a("from"), "side"), ""),
      set(p("state", "squares", a("from"), "kind"), ""),
      branch(ne(v("capture"), -1), [
        set(v("taken"), p("state", "squares", v("capture"), "kind")),
        set(p("state", "squares", v("capture"), "side"), ""),
        set(p("state", "squares", v("capture"), "kind"), ""),
      ]),
      set(p("state", "chain"), -1),
      set(p("state", "drawOffer"), ""),
      branch(ne(v("taken"), ""), [
        branch(
          white,
          [{ op: "append", target: p("state", "captured"), value: { side: "black", kind: v("taken") } }],
          [{ op: "append", target: p("state", "captured"), value: { side: "white", kind: v("taken") } }],
        ),
      ]),
      branch(eq(p("state", "game"), "chess"), [
        branch(
          and(
            eq(v("mover"), "pawn"),
            or(eq(p("target", "y"), 0), eq(p("target", "y"), 7)),
          ),
          [
            set(p("state", "squares", a("to"), "kind"), "queen"),
            set(v("promoted"), true),
          ],
        ),
        branch(eq(v("taken"), "king"), [
          set(p("state", "winner"), p("state", "turn")),
          set(p("state", "result"), "capture"),
        ]),
      ]),
      branch(eq(p("state", "game"), "checkers"), [
        branch(
          and(
            ne(p("state", "squares", a("to"), "kind"), "king"),
            or(
              and(white, eq(p("target", "y"), 0)),
              and(e("not", white), eq(p("target", "y"), 7)),
            ),
          ),
          [
            set(p("state", "squares", a("to"), "kind"), "king"),
            set(v("crowned"), true),
          ],
        ),
        branch(and(ne(v("capture"), -1), e("not", v("crowned"))), [
          call("easel.board.Jumps", [p("state", "squares"), a("to")], "nextJumps"),
          branch(lt(0, e("length", v("nextJumps"))), [
            set(v("continued"), true),
            set(p("state", "chain"), a("to")),
          ]),
        ]),
        letValue("opponents", 0),
        each(p("state", "squares"), "piece", [
          branch(
            and(occupied("piece"), ne(p("piece", "side"), p("state", "turn"))),
            [{ op: "delta", target: v("opponents"), value: 1 }],
          ),
        ]),
        branch(eq(v("opponents"), 0), [
          set(p("state", "winner"), p("state", "turn")),
        ]),
      ]),
      {
        op: "append",
        target: p("state", "history"),
        value: {
          from: a("from"),
          to: a("to"),
          side: p("state", "turn"),
          piece: v("mover"),
          taken: v("taken"),
          promoted: or(v("promoted"), v("crowned")),
        },
      },
      branch(e("not", v("continued")), [
        branch(
          white,
          [set(p("state", "turn"), "black")],
          [set(p("state", "turn"), "white")],
        ),
      ]),
      branch(
        and(
          eq(p("state", "game"), "checkers"),
          eq(p("state", "winner"), ""),
          e("not", v("continued")),
        ),
        [
          call(
            "easel.board.Mobility",
            [p("state", "squares"), p("state", "turn")],
            "mobile",
          ),
          branch(e("not", v("mobile")), [
            branch(
              white,
              [set(p("state", "winner"), "black")],
              [set(p("state", "winner"), "white")],
            ),
          ]),
        ],
      ),
      { op: "delta", target: p("state", "revision"), value: 1 },
      ...finish,
    ],
  };
  return [seat, jumps, mobility, move, reset];
}
