import { targets, notation, VALUES } from "./rules.mjs";

const REQUIRED = ["easel.layout.gametable@1", "easel.layout.sidebar@1", "easel.surfaces.gameboard@1", "easel.display.seat@1", "easel.display.movelist@1", "easel.narrative.chat@1"];
const SIDES = { white: "White", black: "Black" };
const other = (side) => (side === "white" ? "black" : "white");
const pieceImage = (side, kind) => new URL("./pieces/" + side + "-" + kind + ".svg", import.meta.url).href;

export default class Controller {
  static get requires() {
    return REQUIRED;
  }

  async mount(title, options = {}) {
    this.Easel = options.Easel || globalThis.Easel;
    this.Application = options.Application || globalThis.Application;
    this.title = title;
    this.state = null;
    this.selected = -1;
    this.flipped = null;
    this.tab = "moves";
    this.unread = 0;
    this.toasts = [];
    this.ids = [];
    this.confirming = "";
    this.skew = 0;
    const E = this.Easel;
    await Promise.all(REQUIRED.map((name) => E.Interfaces.load(name)));
    const make = (name, props = {}, id) => E.Components.create(name, id ? { id, props } : { props });
    this.frame = make("easel.layout.gametable@1", {}, "board");
    this.board = make("easel.surfaces.gameboard@1");
    this.top = make("easel.display.seat@1");
    this.bottom = make("easel.display.seat@1");
    this.side = make("easel.layout.sidebar@1");
    this.moves = make("easel.display.movelist@1", { emptyText: "Moves appear here as the game is played." });
    this.chat = make("easel.narrative.chat@1", { modes: ["public"], placeholder: "Message the table", emptyText: "Say hello to the table." });
    this.board.attach(this.frame, "board");
    this.top.attach(this.frame, "top");
    this.bottom.attach(this.frame, "bottom");
    this.side.attach(this.frame, "sidebar");
    this.moves.attach(this.side, "panels");
    this.chat.attach(this.side, "panels");
    this.board.on("square", ({ index }) => this.choose(index, true));
    this.board.on("pick", ({ index }) => this.choose(index, false));
    this.board.on("move", ({ from, to }) => this.move(from, to));
    this.top.on("sit", () => this.send("seat", { side: this.sides().top }));
    this.bottom.on("sit", () => this.send("seat", { side: this.sides().bottom }));
    this.top.on("leave", () => this.send("leave"));
    this.bottom.on("leave", () => this.send("leave"));
    this.side.on("select", ({ id }) => {
      this.tab = id;
      if (id === "chat") this.unread = 0;
      this.render();
    });
    this.chat.on("send", ({ text }) => this.send("chat", { text }));
    this.frame.on("action", ({ id }) => this.action(id));
    this.frame.on("resultAction", ({ id }) => this.action(id));
    this.frame.on("toastDismiss", ({ id }) => {
      this.toasts = this.toasts.filter((toast) => toast.id !== id);
      this.frame.setProps({ toasts: this.toasts });
    });
    E.Components.mountRoot(this.frame);
    const A = this.Application;
    A.events.on("easel.board.state", (state) => this.receive(state));
    A.events.on("easel.board.error", ({ message }) => this.toast(message.replace(/^.*check failed: /, ""), "error"));
    A.events.on("easel.board.changed", () => this.refresh());
    A.events.on("Users.Changed", () => this.refresh());
    A.onReady(() => this.refresh());
    this.render();
    return this;
  }

  refresh() {
    return this.Application.events.emit("easel.board.refresh", {}).catch((error) => this.toast(error.message, "error"));
  }

  send(name, payload = {}) {
    return this.Application.events.emit("easel.board." + name, payload).catch((error) => this.toast(error.message, "error"));
  }

  toast(message, kind = "info") {
    this.toasts = [...this.toasts.slice(-2), { id: "t" + Math.random().toString(36).slice(2, 9), message: String(message), kind }];
    this.frame.setProps({ toasts: this.toasts });
  }

  get match() {
    return this.state?.match || null;
  }

  get seat() {
    const match = this.match;
    if (!match?.seats) return "";
    return match.seats.white === this.state.user ? "white" : match.seats.black === this.state.user ? "black" : "";
  }

  sides() {
    const bottom = (this.flipped ?? this.seat === "black") ? "black" : "white";
    return { bottom, top: other(bottom) };
  }

  receive(state) {
    const before = this.match;
    this.skew = Date.now() - (Number(state.now) || Date.now());
    const match = state.match;
    if (match.squares) {
      const grown = before?.squares && match.history.length === before.history.length + 1 && this.ids.length === 64;
      if (grown) {
        const move = match.history[match.history.length - 1];
        const ids = [...this.ids];
        ids[move.to] = ids[move.from];
        ids[move.from] = "";
        this.ids = match.squares.map((piece, index) => (piece.side ? ids[index] || "p" + index + "r" + match.revision : ""));
      } else if (!before?.squares || match.history.length !== before.history.length) {
        this.ids = match.squares.map((piece, index) => (piece.side ? "p" + index + "r" + match.revision : ""));
      } else {
        this.ids = match.squares.map((piece, index) => (piece.side ? this.ids[index] || "p" + index + "r" + match.revision : ""));
      }
    }
    if (before && before.revision !== match.revision) this.selected = -1;
    if (before?.chat && match.chat.length > before.chat.length && this.tab !== "chat") this.unread += match.chat.length - before.chat.length;
    if (before && !before.drawOffer && match.drawOffer && this.seat && match.drawOffer !== this.seat) this.toast((match.names[match.drawOffer] || SIDES[match.drawOffer]) + " offers a draw.");
    this.state = state;
    this.render();
  }

  myTurn() {
    const match = this.match;
    return !!match && !match.winner && !!this.seat && match.turn === this.seat && !!match.seats.white && !!match.seats.black;
  }

  choose(index, toggle) {
    const match = this.match;
    if (!match?.squares || match.winner) return;
    if (!this.seat) {
      if (this.state.canPlay && (!match.seats.white || !match.seats.black)) this.toast("Take a seat to play.");
      return;
    }
    if (!match.seats.white || !match.seats.black) return this.toast("Waiting for an opponent to take the other seat.");
    if (match.turn !== this.seat) return;
    if (this.selected >= 0 && this.selected !== index && targets(match, this.selected).includes(index)) return this.move(this.selected, index);
    if (match.squares[index].side === this.seat) this.selected = toggle && this.selected === index ? -1 : index;
    else this.selected = -1;
    this.render();
  }

  move(from, to) {
    const match = this.match;
    if (!this.myTurn() || match.squares[from]?.side !== this.seat) return;
    this.selected = -1;
    this.render();
    this.send("move", { from, to, revision: match.revision });
  }

  action(id) {
    if (id === "flip") {
      this.flipped = !(this.flipped ?? this.seat === "black");
      return this.render();
    }
    if (id === "resign" || id === "reset") {
      if (this.confirming !== id) {
        this.confirming = id;
        clearTimeout(this.confirmTimer);
        this.confirmTimer = setTimeout(() => {
          this.confirming = "";
          this.render();
        }, 3500);
        return this.render();
      }
      this.confirming = "";
      this.send(id);
      return this.render();
    }
    if (id === "offer" || id === "accept" || id === "decline" || id === "withdraw") return this.send("draw", { action: id });
    if (id === "rematch") return this.send("rematch");
  }

  captured(side) {
    const match = this.match;
    const taken = (match.captured || []).filter((piece) => piece.side !== side);
    if (match.game !== "chess") return { pieces: taken.map((piece) => ({ label: SIDES[piece.side] + " checker", color: piece.side === "white" ? "#e6d6b4" : "#2b2f3c" })), advantage: taken.length ? "×" + taken.length : "" };
    const sorted = [...taken].sort((a, b) => (VALUES[b.kind] || 0) - (VALUES[a.kind] || 0));
    const total = (list) => list.reduce((sum, piece) => sum + (VALUES[piece.kind] || 0), 0);
    const lead = total(taken) - total((match.captured || []).filter((piece) => piece.side === side));
    return { pieces: sorted.map((piece) => ({ image: pieceImage(piece.side, piece.kind), label: SIDES[piece.side] + " " + piece.kind })), advantage: lead > 0 ? "+" + lead : "" };
  }

  seatProps(side) {
    const match = this.match;
    const seated = this.seat;
    const open = !match.seats[side];
    const taken = this.captured(side);
    const running = !!match.turnStarted && !match.winner && match.turn === side;
    return {
      name: match.names[side] || "",
      label: SIDES[side],
      swatch: side === "white" ? "#f4ecd8" : "#23262f",
      open,
      you: match.seats[side] === this.state.user,
      turn: !match.winner && match.turn === side && !!match.seats.white && !!match.seats.black,
      canSit: open && this.state.canPlay && !seated,
      sitLabel: "Play " + side,
      canLeave: match.seats[side] === this.state.user && (!match.history.length || !!match.winner || !match.seats[other(side)]),
      status: match.winner === side ? "Winner" : match.drawOffer === side && !match.winner ? "Offers a draw" : "",
      elapsed: Number(match.clock?.[side]) || 0,
      running,
      startedAt: running ? Number(match.turnStarted) + this.skew : 0,
      captured: taken.pieces,
      advantage: taken.advantage,
    };
  }

  status() {
    const match = this.match;
    const name = (side) => match.names[side] || SIDES[side];
    if (match.winner === "draw") return { status: "Draw", detail: "The players agreed to a draw.", statusIcon: "flag", statusTone: "win" };
    if (match.winner) {
      const loser = other(match.winner);
      const detail = match.result === "resignation" ? name(loser) + " resigned." : match.result === "capture" ? "The king was captured." : match.game === "checkers" ? name(loser) + " has no moves left." : "";
      return { status: (match.seats[match.winner] === this.state.user ? "You win" : name(match.winner) + " wins") + (match.seats[match.winner] === this.state.user ? "!" : ""), detail, statusIcon: "trophy", statusTone: "win" };
    }
    if (!match.seats.white || !match.seats.black) return { status: "Waiting for players", detail: this.seat ? "Waiting for an opponent to take the other seat." : this.state.canPlay ? "Take a seat to begin." : "You are watching.", statusIcon: "users", statusTone: "wait" };
    const mine = match.turn === this.seat;
    const detail = match.chain >= 0 ? "Continue the capture with the same piece." : match.drawOffer ? name(match.drawOffer) + " offers a draw." : !this.seat ? (this.state.canPlay ? "You are watching this game." : "You are watching as a spectator.") : mine ? "Select a piece, then where it goes." : "";
    return { status: mine ? "Your move" : name(match.turn) + " to move", detail, statusIcon: mine ? "pointer" : "clock", statusTone: mine ? "" : "wait" };
  }

  render() {
    const match = this.match;
    if (!match?.squares) {
      this.frame.setProps({ status: this.title, detail: "Setting up the board…", statusIcon: "clock", statusTone: "wait" });
      return;
    }
    const sides = this.sides();
    const chess = match.game === "chess";
    const pieces = [];
    match.squares.forEach((piece, index) => {
      if (!piece.side) return;
      const label = SIDES[piece.side] + " " + (chess ? piece.kind : piece.kind === "king" ? "king" : "checker");
      pieces.push(chess ? { id: this.ids[index] || "p" + index, x: piece.x, y: piece.y, image: pieceImage(piece.side, piece.kind), label, movable: piece.side === this.seat } : { id: this.ids[index] || "p" + index, x: piece.x, y: piece.y, shape: "disc", tone: piece.side === "white" ? "light" : "dark", crowned: piece.kind === "king", label, movable: piece.side === this.seat });
    });
    const last = match.history[match.history.length - 1];
    const turn = this.myTurn();
    this.board.setProps({
      theme: chess ? "walnut" : "felt",
      pieces,
      flipped: sides.bottom === "black",
      interactive: !!this.seat && !match.winner,
      selected: turn ? this.selected : -1,
      targets: turn && this.selected >= 0 ? targets(match, this.selected) : [],
      last: last ? [last.from, last.to] : [],
      marks: turn && match.chain >= 0 ? [{ index: match.chain, kind: "hint" }] : [],
    });
    this.top.setProps(this.seatProps(sides.top));
    this.bottom.setProps(this.seatProps(sides.bottom));
    const record = notation(match).map((move) => (chess && move.piece ? { ...move, icon: pieceImage(move.side, move.piece) } : move));
    this.moves.setProps({ moves: record });
    this.chat.setProps({ messages: (match.chat || []).map((message) => ({ id: message.id, userId: message.userId, speaker: { name: message.name }, text: message.text, timestamp: message.timestamp })), userId: this.state.user, readOnly: !this.state.canPlay });
    this.side.setProps({
      tabs: [
        { id: "moves", label: "Moves", icon: "scroll", panel: this.moves.id },
        { id: "chat", label: "Chat", icon: "chat", panel: this.chat.id, badge: this.unread ? String(Math.min(99, this.unread)) : "" },
      ],
      active: this.tab,
    });
    const live = !!this.seat && !match.winner && !!match.seats.white && !!match.seats.black;
    const offered = match.drawOffer;
    const actions = [
      { id: "flip", label: "Flip board", icon: "flip" },
      { id: "accept", label: "Accept draw", icon: "check", primary: true, hidden: !(live && offered && offered !== this.seat) },
      { id: "decline", label: "Decline", icon: "close", hidden: !(live && offered && offered !== this.seat) },
      { id: "withdraw", label: "Withdraw offer", icon: "close", hidden: !(live && offered === this.seat) },
      { id: "offer", label: "Offer draw", icon: "flag", hidden: !(live && !offered && match.history.length > 0) },
      { id: "resign", label: this.confirming === "resign" ? "Confirm resign" : "Resign", icon: "resign", danger: true, hidden: !live },
      { id: "rematch", label: "Play again", icon: "play", primary: true, hidden: !(match.winner && (this.seat || this.state.canManage)) },
      { id: "reset", label: this.confirming === "reset" ? "Confirm reset" : "Reset match", icon: "undo", danger: this.confirming === "reset", hidden: !this.state.canManage, title: "Clear the board, the moves and both seats" },
    ];
    const status = this.status();
    const result = match.winner ? { key: "r" + match.revision, icon: match.winner === "draw" ? "flag" : "trophy", eyebrow: this.title, title: status.status, text: status.detail, actions: this.seat || this.state.canManage ? [{ id: "rematch", label: "Play again", icon: "play", primary: true }] : [] } : {};
    this.frame.setProps({ ...status, actions, result, toasts: this.toasts });
  }
}
