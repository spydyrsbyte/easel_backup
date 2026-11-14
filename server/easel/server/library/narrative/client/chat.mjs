import { Component, h, icon, iconButton, avatar, timeLabel, keyed, menu } from "./ui.mjs";

const MODES = [
  { id: "public", label: "Everyone", icon: "users" },
  { id: "gm", label: "To the GM", icon: "eye" },
  { id: "blind", label: "Blind roll", icon: "eyeOff" },
  { id: "self", label: "Only me", icon: "lock" },
];

export default class Chat extends Component {
  constructor() {
    super("easel.narrative.chat", "div");
    this.log = h("div", { class: "ez-chat-log", role: "log", "aria-live": "polite" });
    this.input = h("textarea", { rows: 1, placeholder: "Message, or /r 2d6+3 to roll", "aria-label": "Message" });
    this.send = iconButton("send", "Send", () => this.submit());
    this.modeButton = h("button", { type: "button", class: "ez-chip" });
    this.modeButton.addEventListener("click", () => {
      const bounds = this.modeButton.getBoundingClientRect();
      menu(
        MODES.filter((mode) => (this.props.modes || MODES.map((entry) => entry.id)).includes(mode.id)).map((mode) => ({ ...mode, checked: mode.id === this.props.mode })),
        { x: bounds.left, y: bounds.bottom + 4, anchorTop: bounds.top - 4 },
        (id) => this.emit("mode", { mode: id }),
      );
    });
    this.dice = h("div", { class: "ez-dicetray" });
    this.jump = h("button", { type: "button", class: "ez-btn ez-btn-small", hidden: true, style: { position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: "8px" } }, icon("chevronDown", 14), h("span", { text: "New messages" }));
    this.jump.addEventListener("click", () => this.bottom(true));
    const wrap = h("div", { style: { position: "relative", flex: "1 1 auto", minHeight: "0", display: "flex", flexDirection: "column" } }, this.log, this.jump);
    this.element.append(wrap, h("div", { class: "ez-chat-compose" }, this.dice, h("div", { class: "ez-chat-modes" }, this.modeButton), h("div", { class: "ez-chat-box" }, this.input, this.send)));
    this.history = [];
    this.cursor = -1;
    this.pinned = true;
    this.on(this.log, "scroll", () => {
      this.pinned = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
      if (this.pinned) this.jump.hidden = true;
    });
    this.on(this.input, "input", () => this.grow());
    this.on(this.input, "keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.submit();
      } else if (event.key === "ArrowUp" && !this.input.value.includes("\n") && this.history.length && this.input.selectionStart === 0) {
        event.preventDefault();
        this.cursor = Math.min(this.history.length - 1, this.cursor + 1);
        this.input.value = this.history[this.history.length - 1 - this.cursor];
        this.grow();
      } else if (event.key === "ArrowDown" && this.cursor >= 0) {
        event.preventDefault();
        this.cursor -= 1;
        this.input.value = this.cursor < 0 ? "" : this.history[this.history.length - 1 - this.cursor];
        this.grow();
      }
    });
  }

  grow() {
    this.input.style.height = "auto";
    this.input.style.height = Math.min(140, this.input.scrollHeight) + "px";
  }

  submit(text = this.input.value) {
    const value = String(text).trim();
    if (!value) return;
    this.emit("send", { text: value, mode: this.props.mode || "public" });
    if (text === this.input.value) {
      this.history.push(value);
      if (this.history.length > 50) this.history.shift();
      this.cursor = -1;
      this.input.value = "";
      this.grow();
    }
  }

  bottom(smooth) {
    this.log.scrollTo({ top: this.log.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    this.jump.hidden = true;
    this.pinned = true;
  }

  roll(part, node) {
    if (part.formula) node.append(h("div", { class: "ez-roll-formula", text: part.formula }));
    const dice = Array.isArray(part.dice) ? part.dice : [];
    if (dice.length || (part.total !== undefined && part.total !== null)) {
      const row = h("div", { class: "ez-roll-dice" });
      for (const die of dice.slice(0, 40)) {
        const sides = Number(die.sides) || 0;
        row.append(h("span", { class: "ez-die", title: sides ? "d" + sides : "", dataset: { crit: sides > 1 && die.value === sides ? "high" : sides > 1 && die.value === 1 ? "low" : "", dropped: String(!!die.dropped) }, text: die.label ?? die.value }));
      }
      node.append(h("div", { class: "ez-roll-line" }, row, part.total !== undefined && part.total !== null ? h("div", { class: "ez-roll-total", text: part.total }) : null));
    }
    if (part.note) node.append(h("div", { class: "ez-roll-note", text: part.note }));
  }

  card(message) {
    const card = message.card || {};
    const node = h("div", { class: "ez-roll" });
    if (card.title) node.append(h("div", { class: "ez-roll-title" }, h("span", { text: card.title }), card.subtitle ? h("span", { class: "ez-roll-subtitle", text: card.subtitle }) : null));
    this.roll(card, node);
    for (const section of (Array.isArray(card.sections) ? card.sections : []).slice(0, 16)) {
      const block = h("div", { class: "ez-roll-section", dataset: { tone: section.tone || "" } });
      if (section.title) block.append(h("div", { class: "ez-eyebrow", text: section.title }));
      this.roll(section, block);
      node.append(block);
    }
    if (card.text) node.append(h("div", { class: "ez-msg-text ez-roll-text", text: card.text }));
    if (Array.isArray(card.rows) && card.rows.length) {
      const list = h("div", { class: "ez-rows", style: { marginTop: "8px" } });
      for (const row of card.rows.slice(0, 20)) list.append(h("div", { class: "ez-row" }, h("span", { class: "ez-row-main", text: row.label }), h("strong", { text: row.value })));
      node.append(list);
    }
    if (card.detail) node.append(h("div", { class: "ez-roll-detail", text: card.detail }));
    if (Array.isArray(card.actions) && card.actions.length) {
      const actions = h("div", { class: "ez-roll-actions" });
      for (const action of card.actions.slice(0, 12)) {
        const button = h("button", { type: "button", class: "ez-btn ez-btn-small", text: action.label || action.id });
        button.addEventListener("click", () => this.emit("cardAction", { messageId: String(message.id), action: String(action.id), payload: action.payload || {} }));
        actions.append(button);
      }
      node.append(actions);
    }
    return node;
  }

  render(props, previous) {
    const mode = MODES.find((entry) => entry.id === props.mode) || MODES[0];
    this.modeButton.parentElement.hidden = (props.modes || MODES).length < 2;
    this.input.placeholder = props.placeholder || "Message, or /r 2d6+3 to roll";
    this.modeButton.replaceChildren(icon(mode.icon, 13), h("span", { text: mode.label }), icon("chevronUp", 12));
    this.modeButton.classList.toggle("ez-chip-primary", mode.id !== "public");
    if (this.changed(props, "quickDice")) {
      this.dice.hidden = !(props.quickDice || []).length;
      this.dice.replaceChildren(
        ...(props.quickDice || []).map((formula) => {
          const button = h("button", { type: "button", class: "ez-btn ez-btn-small ez-btn-ghost", text: formula, title: "Roll " + formula });
          button.addEventListener("click", (event) => this.submit("/r " + (event.shiftKey ? "2" + formula.replace(/^1/, "") + "kh1" : formula)));
          return button;
        }),
      );
    }
    const messages = props.messages || [];
    const names = Object.fromEntries((props.members || []).map((member) => [member.id, member]));
    const wasPinned = this.pinned;
    const last = previous.messages?.[previous.messages.length - 1]?.id;
    keyed(
      this.log,
      messages,
      (message) => message.id,
      (message) => h("article", { class: "ez-msg" }),
      (node, message, index) => {
        const before = messages[index - 1];
        const speaker = message.speaker?.name || names[message.userId]?.name || "Someone";
        const follow = !!before && before.userId === message.userId && (before.speaker?.name || "") === (message.speaker?.name || "") && message.timestamp - before.timestamp < 120000 && !message.system && !before.system && before.rollMode === message.rollMode;
        const signature = JSON.stringify([message.text, message.card, message.concealed, follow, speaker, message.rollMode, (message.whisperUserIds || []).length]);
        if (node.dataset.signature === signature) return;
        node.dataset.signature = signature;
        node.dataset.follow = String(follow);
        node.dataset.mode = message.rollMode || "public";
        node.dataset.whisper = String((message.whisperUserIds || []).length > 0);
        node.dataset.system = String(!!message.system);
        const body = h("div", { class: "ez-msg-body" });
        if (!message.system) {
          const head = h("div", { class: "ez-msg-head" }, h("span", { class: "ez-msg-name", text: speaker }), h("span", { class: "ez-msg-time", text: timeLabel(message.timestamp) }));
          if (message.rollMode && message.rollMode !== "public") head.append(h("span", { class: "ez-chip ez-chip-primary", text: MODES.find((entry) => entry.id === message.rollMode)?.label || message.rollMode }));
          if ((message.whisperUserIds || []).length) head.append(h("span", { class: "ez-chip ez-chip-primary", text: "Whisper" }));
          body.append(head);
        }
        if (message.concealed) body.append(h("div", { class: "ez-msg-text", style: { fontStyle: "italic", opacity: "0.7" }, text: "Rolled in secret." }));
        if (message.text) body.append(h("div", { class: "ez-msg-text", text: message.text }));
        if (message.card && Object.keys(message.card).length) body.append(this.card(message));
        node.replaceChildren(message.system ? "" : avatar(speaker, message.speaker?.image || names[message.userId]?.image, 30, names[message.userId]?.color), body);
      },
    );
    if (!messages.length && !this.log.querySelector(".ez-empty")) this.log.append(h("div", { class: "ez-empty", style: { margin: "auto" } }, icon("chat", 30), h("strong", { text: "No messages yet" }), h("span", { text: props.emptyText || "Say hello, or roll some dice." })));
    else if (messages.length) this.log.querySelector(".ez-empty")?.remove();
    const latest = messages[messages.length - 1]?.id;
    if (latest !== last) {
      if (wasPinned || messages[messages.length - 1]?.userId === props.userId) queueMicrotask(() => this.bottom(!!previous.messages));
      else this.jump.hidden = false;
    }
    this.input.disabled = !!props.readOnly;
    this.send.disabled = !!props.readOnly;
  }
}
