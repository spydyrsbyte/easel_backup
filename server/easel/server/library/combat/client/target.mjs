import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Target extends Base {
  constructor() {
    super("easel.combat.target", []);
  }
  update(p) {
    this.begin(p);
    this.content.append(
      this.rows(
        p.items.map((i) => ({
          ...i,
          description:
            "Range " +
            (i.distance ?? "?") +
            " / " +
            (i.cover ? "Cover" : "Clear"),
        })),
        { select: true },
      ),
    );
  }
}
