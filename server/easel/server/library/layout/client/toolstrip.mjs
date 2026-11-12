import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

const DEFAULT_TOOLS = [
  { id: "select", label: "Select" },
  { id: "measure", label: "Measure" },
  { id: "template", label: "Template" },
  { id: "wall", label: "Wall", gmOnly: true },
  { id: "door", label: "Door", gmOnly: true },
  { id: "light", label: "Light", gmOnly: true },
  { id: "draw", label: "Draw" },
  { id: "calibrate", label: "Calibrate", gmOnly: true },
];

export default class Toolstrip extends Base {
  constructor() {
    super("easel.layout.toolstrip", ["subtools"]);
  }

  update(p) {
    this.begin(p);
    const list = el(
      "div",
      p.vertical !== false ? "kit-toolstrip-vertical" : "kit-toolstrip-horizontal",
    );
    list.style.display = "flex";
    list.style.flexDirection = p.vertical !== false ? "column" : "row";
    list.style.gap = "6px";
    list.style.padding = "6px";
    list.style.background = "var(--kit-surface, #20242bf0)";
    list.style.border = "1px solid var(--kit-border, #ffffff24)";
    list.style.borderRadius = "8px";
    list.style.boxShadow = "0 4px 16px #0008";

    const tools = Array.isArray(p.tools) && p.tools.length > 0 ? p.tools : DEFAULT_TOOLS;
    const active = p.activeTool || "select";

    for (const tool of tools) {
      if (tool.gmOnly && !p.gmMode) continue;
      const btn = this.button(tool.label || tool.id, "select", { tool: tool.id });
      btn.dataset.tool = tool.id;
      if (tool.id === active) {
        btn.setAttribute("aria-selected", "true");
        btn.style.borderColor = "var(--kit-accent, #d6ae65)";
        btn.style.boxShadow = "0 0 0 1px var(--kit-accent, #d6ae65)";
      }
      list.append(btn);
    }

    this.content.append(list);
    this.content.append(this.slots.subtools);
  }
}
