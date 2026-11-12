import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Network extends Base {
  constructor() {
    super("easel.networks.network", []);
  }
  update(p) {
    this.begin(p);
    const svg = this.svg("svg", { viewBox: "0 0 " + p.width + " " + p.height }),
      nodes = p.nodes.length ? p.nodes : p.items,
      placed = new Map(
        nodes.map((n, i) => [
          String(n.id),
          {
            ...n,
            x: Number(
              n.x ??
                p.width / 2 +
                  Math.cos((i / Math.max(1, nodes.length)) * Math.PI * 2) *
                    p.width *
                    0.35,
            ),
            y: Number(
              n.y ??
                p.height / 2 +
                  Math.sin((i / Math.max(1, nodes.length)) * Math.PI * 2) *
                    p.height *
                    0.35,
            ),
          },
        ]),
      );
    for (const edge of p.edges) {
      const a = placed.get(String(edge.from)),
        b = placed.get(String(edge.to));
      if (!a || !b) continue;
      svg.append(
        this.svg("line", {
          x1: a.x,
          y1: a.y,
          x2: b.x,
          y2: b.y,
          class: "kit-edge",
        }),
      );
    }
    for (const n of placed.values()) {
      const group = this.svg("g");
      group.setAttribute("role", "button");
      group.setAttribute("tabindex", "0");
      group.setAttribute("aria-label", n.label ?? n.name ?? n.id);
      group.append(
        this.svg("circle", { cx: n.x, cy: n.y, r: 22, class: "kit-node" }),
      );
      const label = this.svg("text", {
        x: n.x,
        y: n.y + 4,
        fill: "#eee",
        "text-anchor": "middle",
        "font-size": 12,
      });
      label.textContent = n.label ?? n.name ?? n.id;
      group.append(label);
      group.onclick = (e) => {
        this.emit("select", { id: String(n.id) });
        if (e.shiftKey && this.connectFrom && this.connectFrom !== n.id)
          this.emit("request", {
            action: "connect",
            value: { from: this.connectFrom, to: n.id },
          });
        this.connectFrom = n.id;
      };
      group.onkeydown = (e) => {
        if (e.key === "Enter") this.emit("select", { id: String(n.id) });
      };
      svg.append(group);
    }
    this.content.append(svg);
  }
}
