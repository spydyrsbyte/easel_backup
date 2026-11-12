import { Component, h, icon, keyed, safeUrl, clamp } from "./ui.mjs";

const FILES = "abcdefghijklmnopqrstuvwxyz";

export default class GameBoard extends Component {
  constructor() {
    super("easel.surfaces.gameboard", "div");
    this.squares = h("div", { class: "ez-gb-squares", role: "grid" });
    this.pieces = h("div", { class: "ez-gb-pieces", "aria-hidden": "true" });
    this.frame = h("div", { class: "ez-gb-frame" }, this.squares, this.pieces);
    this.element.append(this.frame);
    this.cells = [];
    this.on(this.frame, "pointerdown", (event) => this.down(event));
    this.on(this.squares, "keydown", (event) => this.key(event));
  }

  get columns() {
    return clamp(Math.round(Number(this.props.columns) || 8), 1, 26);
  }

  get rows() {
    return clamp(Math.round(Number(this.props.rows) || 8), 1, 26);
  }

  place(x, y) {
    return this.props.flipped ? { x: this.columns - 1 - x, y: this.rows - 1 - y } : { x, y };
  }

  squareName(index) {
    return FILES[index % this.columns] + (this.rows - Math.floor(index / this.columns));
  }

  indexAt(event) {
    const bounds = this.squares.getBoundingClientRect();
    const column = Math.floor(((event.clientX - bounds.left) / bounds.width) * this.columns);
    const row = Math.floor(((event.clientY - bounds.top) / bounds.height) * this.rows);
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return -1;
    const spot = this.place(column, row);
    return spot.y * this.columns + spot.x;
  }

  down(event) {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    if (!this.props.interactive || this.props.disabled) return;
    const from = this.indexAt(event);
    if (from < 0) return;
    const piece = (this.props.pieces || []).find((entry) => entry.y * this.columns + entry.x === from);
    const node = piece && piece.movable !== false ? this.pieces.querySelector('[data-key="' + CSS.escape(String(piece.id)) + '"]') : null;
    const origin = { x: event.clientX, y: event.clientY };
    let dragging = false;
    const move = (next) => {
      if (!node) return;
      const dx = next.clientX - origin.x;
      const dy = next.clientY - origin.y;
      if (!dragging && Math.hypot(dx, dy) < 6) return;
      if (!dragging) {
        dragging = true;
        node.dataset.dragging = "true";
        this.emit("pick", { index: from });
      }
      node.style.translate = dx + "px " + dy + "px";
      const over = this.indexAt(next);
      for (const cell of this.cells) cell.dataset.over = String(dragging && Number(cell.dataset.index) === over && over !== from);
    };
    const up = (next) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      for (const cell of this.cells) cell.dataset.over = "false";
      if (node) {
        node.style.translate = "";
        delete node.dataset.dragging;
      }
      const to = this.indexAt(next);
      if (dragging) {
        if (to >= 0 && to !== from) this.emit("move", { from, to });
      } else if (to === from) this.emit("square", { index: from, name: this.squareName(from) });
    };
    const cancel = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      for (const cell of this.cells) cell.dataset.over = "false";
      if (node) {
        node.style.translate = "";
        delete node.dataset.dragging;
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  }

  key(event) {
    const cell = event.target.closest?.(".ez-gb-square");
    if (!cell) return;
    const index = Number(cell.dataset.index);
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (this.props.interactive) this.emit("square", { index, name: this.squareName(index) });
      return;
    }
    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!step) return;
    event.preventDefault();
    const turn = this.props.flipped ? -1 : 1;
    const x = clamp((index % this.columns) + step[0] * turn, 0, this.columns - 1);
    const y = clamp(Math.floor(index / this.columns) + step[1] * turn, 0, this.rows - 1);
    this.focusIndex = y * this.columns + x;
    for (const entry of this.cells) entry.tabIndex = Number(entry.dataset.index) === this.focusIndex ? 0 : -1;
    this.cells.find((entry) => Number(entry.dataset.index) === this.focusIndex)?.focus();
  }

  render(props) {
    const columns = clamp(Math.round(Number(props.columns) || 8), 1, 26);
    const rows = clamp(Math.round(Number(props.rows) || 8), 1, 26);
    const flipped = !!props.flipped;
    this.element.dataset.theme = props.theme || "walnut";
    this.element.dataset.interactive = String(!!props.interactive);
    this.element.style.setProperty("--ez-gb-columns", columns);
    this.element.style.setProperty("--ez-gb-rows", rows);
    const layout = columns + "x" + rows + (flipped ? "f" : "") + (props.coordinates === false ? "n" : "") + (props.pattern || "checker");
    if (layout !== this.layout) {
      this.layout = layout;
      this.cells = [];
      const nodes = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const x = flipped ? columns - 1 - column : column;
          const y = flipped ? rows - 1 - row : row;
          const index = y * columns + x;
          const cell = h("button", { type: "button", class: "ez-gb-square", role: "gridcell", tabIndex: -1, dataset: { index: String(index), shade: props.pattern === "plain" ? "plain" : (x + y) % 2 ? "dark" : "light" } });
          if (props.coordinates !== false) {
            if (column === 0) cell.append(h("span", { class: "ez-gb-rank", text: rows - y }));
            if (row === rows - 1) cell.append(h("span", { class: "ez-gb-file", text: FILES[x] }));
          }
          cell.append(h("span", { class: "ez-gb-mark" }));
          this.cells.push(cell);
          nodes.push(cell);
        }
      }
      this.squares.replaceChildren(...nodes);
      if (this.focusIndex === undefined || this.focusIndex >= columns * rows) this.focusIndex = flipped ? 0 : columns * (rows - 1);
    }
    const pieces = (props.pieces || []).filter((piece) => piece && piece.x >= 0 && piece.y >= 0 && piece.x < columns && piece.y < rows);
    const at = new Map(pieces.map((piece) => [piece.y * columns + piece.x, piece]));
    const targets = new Set((props.targets || []).map(Number));
    const last = new Set((props.last || []).map(Number));
    const marks = new Map((props.marks || []).map((mark) => [Number(mark.index), mark.kind || "mark"]));
    for (const cell of this.cells) {
      const index = Number(cell.dataset.index);
      const piece = at.get(index);
      cell.dataset.selected = String(Number(props.selected) === index && props.selected !== null && props.selected >= 0);
      cell.dataset.target = targets.has(index) ? (piece ? "capture" : "move") : "";
      cell.dataset.last = String(last.has(index));
      cell.dataset.kind = marks.get(index) || "";
      cell.tabIndex = index === this.focusIndex ? 0 : -1;
      cell.setAttribute("aria-label", this.nameFor(index, columns, rows) + " " + (piece ? piece.label || "piece" : "empty") + (targets.has(index) ? ", can move here" : ""));
      cell.setAttribute("aria-selected", cell.dataset.selected);
    }
    keyed(
      this.pieces,
      pieces,
      (piece) => piece.id,
      () => h("div", { class: "ez-gb-piece" }),
      (node, piece) => {
        const spot = flipped ? { x: columns - 1 - piece.x, y: rows - 1 - piece.y } : piece;
        node.style.left = (spot.x * 100) / columns + "%";
        node.style.top = (spot.y * 100) / rows + "%";
        const signature = JSON.stringify([piece.image, piece.glyph, piece.shape, piece.tone, piece.crowned, piece.color]);
        if (node.dataset.signature === signature) return;
        node.dataset.signature = signature;
        node.dataset.shape = piece.shape || (piece.image ? "figure" : "disc");
        node.dataset.tone = piece.tone || "light";
        node.dataset.crowned = String(!!piece.crowned);
        const url = safeUrl(piece.image);
        node.replaceChildren(url ? h("img", { alt: "", src: url, draggable: false }) : h("span", { class: "ez-gb-token", style: piece.color ? { background: piece.color } : undefined }, piece.crowned ? icon("crown", 22) : piece.glyph ? h("span", { text: piece.glyph }) : null));
      },
    );
  }

  nameFor(index, columns, rows) {
    return FILES[index % columns] + (rows - Math.floor(index / columns));
  }
}
