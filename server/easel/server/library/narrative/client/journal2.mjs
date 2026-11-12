import { Component, h, icon, button } from "./ui.mjs";

function formatted(text) {
  const nodes = [];
  for (const line of String(text || "").split("\n")) {
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      nodes.push(h("h" + heading[1].length, { text: heading[2] }));
      continue;
    }
    const row = h("div", { style: { minHeight: "1.2em" } });
    let rest = line.replace(/^[-*]\s+/, "•  ");
    const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/;
    while (rest) {
      const match = pattern.exec(rest);
      if (!match) {
        row.append(rest);
        break;
      }
      if (match.index) row.append(rest.slice(0, match.index));
      row.append(h(match[1] !== undefined ? "strong" : "em", { text: match[1] ?? match[2] }));
      rest = rest.slice(match.index + match[0].length);
    }
    nodes.push(row);
  }
  return nodes;
}

export default class Journal extends Component {
  constructor() {
    super("easel.narrative.journal", "article");
    this.editing = false;
  }

  render(props, previous) {
    this.props = props;
    const entry = props.entry || {};
    if (entry.id !== (previous.entry || {}).id) this.editing = !!props.canEdit && !entry.content;
    const title = h("input", { type: "text", class: "ez-journal-title", value: entry.name || "", disabled: !props.canEdit, "aria-label": "Title" });
    title.addEventListener("change", () => this.emit("save", { name: title.value, content: String(this.area?.value ?? entry.content ?? ""), playerVisible: !!entry.playerVisible }));
    const head = h("header", { class: "ez-journal-head" }, title);
    if (props.canEdit) {
      const share = button(entry.playerVisible ? "Shared" : "Private", { kind: "small" + (entry.playerVisible ? " ez-btn-primary" : ""), iconName: entry.playerVisible ? "eye" : "eyeOff", title: entry.playerVisible ? "Players can read this" : "Only you can read this", onClick: () => this.emit("save", { name: title.value, content: String(this.area?.value ?? entry.content ?? ""), playerVisible: !entry.playerVisible }) });
      const toggle = button(this.editing ? "Done" : "Edit", {
        kind: "small",
        iconName: this.editing ? "check" : "edit",
        onClick: () => {
          if (this.editing) this.emit("save", { name: title.value, content: this.area.value, playerVisible: !!entry.playerVisible });
          this.editing = !this.editing;
          this.render(this.props, this.props);
        },
      });
      head.append(share, toggle);
    }
    const body = h("div", { class: "ez-journal-body" });
    this.area = null;
    if (this.editing) {
      this.area = h("textarea", { "aria-label": "Text", placeholder: "Write here. Start a line with # for a heading, wrap words in ** for bold." });
      this.area.value = entry.content || "";
      this.area.addEventListener("change", () => this.emit("save", { name: title.value, content: this.area.value, playerVisible: !!entry.playerVisible }));
      body.append(this.area);
    } else if (entry.content) body.append(...formatted(entry.content));
    else body.append(h("div", { class: "ez-empty" }, icon("book", 28), h("span", { text: "This page is blank." })));
    this.element.classList.add("ez-journal");
    this.element.replaceChildren(head, body);
  }
}
