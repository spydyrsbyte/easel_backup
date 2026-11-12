import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Shortcut extends Base {
  constructor() {
    super("easel.input.shortcut", []);
    document.addEventListener(
      "keydown",
      (e) => {
        if (
          !this.element.isConnected ||
          this.props.open === false ||
          this.props.disabled ||
          e.target?.closest("input,textarea,select,[contenteditable=true]")
        )
          return;
        const b = this.props.bindings?.find(
          (b) =>
            b.key === e.key &&
            !!b.ctrl === (e.ctrlKey || e.metaKey) &&
            !!b.alt === e.altKey &&
            !!b.shift === e.shiftKey,
        );
        if (b) {
          e.preventDefault();
          this.emit("action", { id: b.action });
        }
      },
      { signal: this.life.signal },
    );
  }
  update(p) {
    this.begin(p);
    const keys = new Set();
    for (const b of p.bindings) {
      const k = [b.key, !!b.ctrl, !!b.alt, !!b.shift].join(":");
      if (keys.has(k)) throw new Error("Conflicting keyboard shortcut");
      keys.add(k);
    }
    this.content.append(
      this.rows(
        p.bindings.map((b) => ({
          id: b.action,
          label: b.key,
          description: b.label ?? b.action,
        })),
      ),
    );
  }
}
