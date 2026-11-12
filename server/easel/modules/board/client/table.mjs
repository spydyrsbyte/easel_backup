const element = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const glyphs = {
  king: "♚",
  queen: "♛",
  rook: "♜",
  bishop: "♝",
  knight: "♞",
  pawn: "♟",
};

let Implementation;
export { Implementation as default };

export function initialize({ Easel }) {
  const {
    Application: PixiApplication,
    Container,
    Graphics,
    Text,
  } = Easel.Interfaces.create("easel.graphics.pixi@1");
  class Table {
    constructor() {
      this.element = element("section", "game-table");
      this.heading = element("h1");
      this.status = element("p", "game-turn");
      this.status.setAttribute("aria-live", "polite");
      this.error = element("p", "lobby-error");
      this.error.setAttribute("role", "alert");
      this.canvasHost = element("div", "board-canvas");
      this.canvasHost.setAttribute("aria-label", "Game board");
      this.sidebar = element("aside", "game-sidebar");
      this.seats = element("div", "game-seats");
      this.history = element("ol", "game-history");
      this.instructions = element("p", "muted");
      this.accessible = element("div", "board-accessible");
      this.accessible.setAttribute("role", "group");
      this.accessible.setAttribute("aria-label", "Board squares");
      this.flip = element("button", "", "Flip board");
      this.flip.type = "button";
      this.flip.addEventListener("click", () => {
        this.flipped = !this.flipped;
        this.render();
      });
      this.refresh = element("button", "", "Refresh");
      this.refresh.type = "button";
      this.refresh.addEventListener("click", () =>
        this.onEvent?.("refresh", {}),
      );
      const controls = element("div", "lobby-actions");
      controls.append(this.flip, this.refresh);
      this.reset = element("button", "", "Reset match");
      this.reset.type = "button";
      this.reset.addEventListener("click", () => {
        if (confirm("Reset the board, moves and player seats?"))
          this.onEvent?.("reset", {});
      });
      controls.append(this.reset);
      this.sidebar.append(
        element("h2", "", "Players"),
        this.seats,
        this.instructions,
        controls,
        element("h2", "", "Moves"),
        this.history,
      );
      const layout = element("div", "game-layout");
      const board = element("div", "board-frame");
      board.append(this.canvasHost, this.accessible);
      layout.append(board, this.sidebar);
      this.element.append(this.heading, this.status, this.error, layout);
      this.selected = null;
      this.flipped = false;
      this.app = new PixiApplication();
      this.boot = this.app
        .init({
          width: 640,
          height: 640,
          backgroundAlpha: 0,
          antialias: true,
          autoStart: false,
          preference: ["webgl"],
          failIfMajorPerformanceCaveat: false,
        })
        .then(() => {
          if (this.dead) {
            this.app.destroy(true, { children: true });
            return;
          }
          this.canvasHost.append(this.app.canvas);
          this.app.canvas.setAttribute("aria-hidden", "true");
          this.initialized = true;
          this.render();
        })
        .catch((error) => {
          this.rendererError =
            "The board renderer could not start: " + error.message;
          if (!this.dead) this.error.textContent = this.rendererError;
        });
    }
    choose(index) {
      const p = this.props,
        match = p.match;
      if (p.busy || !p.canPlay || !match.squares || match.winner) return;
      if (match.seats[match.turn] !== p.user) {
        this.error.textContent = "Wait for your turn and take a seat to play.";
        return;
      }
      if (this.selected === null || match.squares[index].side === match.turn) {
        this.selected = this.selected === index ? null : index;
        this.render();
      } else {
        const from = this.selected;
        this.selected = null;
        this.onEvent?.("move", { from, to: index, revision: match.revision });
        this.render();
      }
    }
    update(props) {
      const previous = this.props?.match;
      this.props = props;
      if (previous?.revision !== props.match.revision) this.selected = null;
      if (!this.oriented && props.match.seats?.black === props.user) {
        this.flipped = true;
        this.oriented = true;
      }
      this.heading.textContent = props.title;
      this.error.textContent = props.error || this.rendererError || "";
      this.refresh.disabled = props.busy;
      this.reset.hidden = !props.canManage;
      this.reset.disabled = props.busy;
      const m = props.match;
      if (!m.squares) {
        this.status.textContent = "Loading board…";
        return;
      }
      this.status.textContent = m.winner
        ? `${m.winner === "white" ? "White" : "Black"} wins`
        : !m.seats.white || !m.seats.black
          ? "Waiting for both players to take a seat"
          : `${m.turn === "white" ? "White" : "Black"} to move${m.chain >= 0 ? " — continue the capture" : ""}`;
      this.seats.replaceChildren(
        ...["white", "black"].map((side) => {
          const row = element("div", "game-seat");
          row.append(
            element("strong", "", side === "white" ? "White" : "Black"),
            element("span", "muted", m.names[side] || "Open seat"),
          );
          if (
            !m.seats[side] &&
            props.canPlay &&
            !Object.values(m.seats).includes(props.user)
          ) {
            const button = element("button", "", "Play " + side);
            button.type = "button";
            button.disabled = props.busy;
            button.addEventListener("click", () =>
              this.onEvent?.("seat", { side }),
            );
            row.append(button);
          }
          if (m.seats[side] === props.user)
            row.append(element("small", "", "You"));
          return row;
        }),
      );
      this.instructions.textContent =
        m.game === "chess"
          ? "Select a piece, then its destination. Piece movement and turns only; check, checkmate and special moves are not enforced."
          : "Select a checker, then its destination. Captures are mandatory; continue multiple jumps. Reach the far edge to become a king.";
      if (!props.canPlay)
        this.instructions.textContent += " You are watching as a spectator.";
      const square = (index) =>
        "abcdefgh"[index % 8] + (8 - Math.floor(index / 8));
      this.history.replaceChildren(
        ...m.history
          .slice(-30)
          .map((move) =>
            element(
              "li",
              "",
              `${move.side}: ${square(move.from)} → ${square(move.to)}`,
            ),
          ),
      );
      this.history.start = Math.max(1, m.history.length - 29);
      this.accessible.replaceChildren(
        ...m.squares.map((piece, index) => {
          const button = element(
            "button",
            "",
            `${square(index)} ${piece.side ? piece.side + " " + piece.kind : "empty"}`,
          );
          button.type = "button";
          button.dataset.square = index;
          button.setAttribute("aria-pressed", String(this.selected === index));
          button.disabled = props.busy || !props.canPlay;
          button.addEventListener("click", () => this.choose(index));
          return button;
        }),
      );
      this.render();
    }
    render() {
      if (!this.initialized || !this.props?.match.squares || this.dead) return;
      for (const child of this.app.stage.removeChildren())
        child.destroy({ children: true });
      const match = this.props.match;
      for (let index = 0; index < 64; index++) {
        const piece = match.squares[index];
        const x = (this.flipped ? 7 - piece.x : piece.x) * 80;
        const y = (this.flipped ? 7 - piece.y : piece.y) * 80;
        const cell = new Container();
        cell.position.set(x, y);
        cell.addChild(
          new Graphics()
            .rect(0, 0, 80, 80)
            .fill(
              this.selected === index
                ? 0x8b9dff
                : (piece.x + piece.y) % 2
                  ? 0x46536d
                  : 0xc5cbd7,
            ),
        );
        if (piece.side) {
          const light = piece.side === "white";
          if (match.game === "checkers") {
            cell.addChild(
              new Graphics()
                .circle(40, 40, 28)
                .fill(light ? 0xf0e6ce : 0x202738)
                .stroke({ color: light ? 0x81765f : 0x9caccb, width: 3 }),
            );
          }
          if (match.game === "chess" || piece.kind === "king") {
            const text = new Text({
              text: match.game === "chess" ? glyphs[piece.kind] : "♛",
              style: {
                fontFamily: "Segoe UI Symbol, Arial Unicode MS, serif",
                fontSize: match.game === "chess" ? 61 : 36,
                fill: light ? 0xfff6e0 : 0x141b2a,
                stroke: { color: light ? 0x383c46 : 0xd4dbea, width: 1.5 },
              },
            });
            text.anchor.set(0.5);
            text.position.set(40, 40);
            cell.addChild(text);
          }
        }
        if (
          piece.x === (this.flipped ? 7 : 0) ||
          piece.y === (this.flipped ? 0 : 7)
        ) {
          const label = new Text({
            text:
              (piece.x === (this.flipped ? 7 : 0) ? 8 - piece.y : "") +
              (piece.y === (this.flipped ? 0 : 7) ? "abcdefgh"[piece.x] : ""),
            style: { fontFamily: "Segoe UI", fontSize: 12, fill: 0x10131c },
          });
          label.position.set(3, 2);
          cell.addChild(label);
        }
        cell.eventMode = "static";
        cell.cursor = this.props.canPlay ? "pointer" : "default";
        cell.on("pointertap", () => this.choose(index));
        this.app.stage.addChild(cell);
      }
      this.app.render();
    }
    destroy() {
      this.dead = true;
      if (this.initialized) this.app.destroy(true, { children: true });
    }
  }
  Implementation = Table;
}
