import { Component, h, icon, safeUrl } from "./ui.mjs";

export default class MoveList extends Component {
  constructor() {
    super("easel.display.movelist", "div");
    this.list = h("div", { class: "ez-moves", role: "list" });
    this.empty = h("div", { class: "ez-empty" }, icon("scroll", 28), h("strong", { text: "No moves yet" }), h("span", {}));
    this.element.append(this.list, this.empty);
  }

  render(props, previous) {
    const moves = props.moves || [];
    const columns = Math.max(1, Math.min(4, Math.round(Number(props.columns) || 2)));
    this.list.style.gridTemplateColumns = "34px repeat(" + columns + ", 1fr)";
    this.empty.hidden = moves.length > 0;
    this.list.hidden = !moves.length;
    this.empty.lastElementChild.textContent = props.emptyText || "";
    const signature = JSON.stringify([moves, columns, props.current]);
    if (signature === this.signature) return;
    this.signature = signature;
    const nodes = [];
    const current = props.current || (moves.length ? String(moves[moves.length - 1].id) : "");
    let row = 0;
    let column = 0;
    for (const move of moves) {
      const wanted = Number.isInteger(move.column) ? Math.min(columns - 1, Math.max(0, move.column)) : column;
      if (wanted < column || column >= columns || (move.newRow && column > 0)) {
        for (; column < columns && column > 0; column++) nodes.push(h("span", {}));
        column = 0;
      }
      if (column === 0) {
        row += 1;
        nodes.push(h("span", { class: "ez-moves-number", text: row + "." }));
      }
      for (; column < wanted; column++) nodes.push(h("span", { class: "ez-move ez-move-skip", text: "…" }));
      const node = h("button", { type: "button", class: "ez-move", role: "listitem", title: move.title || "", dataset: { last: String(String(move.id) === current), id: String(move.id) } }, safeUrl(move.icon) ? h("img", { alt: "", src: safeUrl(move.icon), draggable: false }) : null, h("span", { text: move.text }));
      node.addEventListener("click", () => this.emit("select", { id: String(move.id) }));
      nodes.push(node);
      column += 1;
    }
    this.list.replaceChildren(...nodes);
    if (moves.length !== (previous.moves || []).length) queueMicrotask(() => this.list.scrollTo({ top: this.list.scrollHeight }));
  }
}
