import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Sheet extends Base {
  constructor() {
    super("easel.layout.sheet", ["body"]);
  }
  update(p) {
    this.begin(p);
    for (const field of p.fields) {
      const id = String(field.id ?? field.path),
        v = p.data[id] ?? field.value ?? "";
      if (p.editable && field.readOnly !== true && field.type === "select") {
        const row = el("label", "kit-field");
        row.append(el("span", "", field.label ?? id));
        const select = el("select");
        select.disabled = Boolean(p.disabled);
        for (const option of field.options || []) {
          const node = el("option", "", option.label ?? option.value);
          node.value = String(option.value);
          node.selected = node.value === String(v);
          select.append(node);
        }
        select.onchange = () => this.emit("change", { value: { id, value: select.value } });
        row.append(select);
        this.content.append(row);
      } else if (p.editable && field.readOnly !== true) {
        const row = this.field(field.label ?? id, v, id, field.type ?? "text");
        this.content.append(row);
      } else
        this.content.append(this.text((field.label ?? id) + ": " + String(v)));
    }
    this.content.append(this.slots.body);
  }
}
