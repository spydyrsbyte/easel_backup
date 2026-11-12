import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Skilllist extends Base {
  constructor() {
    super("easel.characters.skilllist", []);
  }
  update(p) {
    this.begin(p);
    const columns = p.columns.length
        ? p.columns
        : [
            { key: "label", label: "Name" },
            { key: "value", label: "Value" },
          ],
      table = el("table", "kit-table"),
      head = el("thead"),
      header = el("tr");
    for (const column of columns) {
      const th = el("th");
      th.append(
        this.button(column.label ?? column.key, "change", {
          value: { sort: column.key },
        }),
      );
      header.append(th);
    }
    head.append(header);
    table.append(head);
    const body = el("tbody");
    for (const item of p.items) {
      const row = el("tr");
      for (const column of columns) {
        const td = el("td");
        const v = String(column.path ?? column.key)
          .split(".")
          .reduce((v, k) => v?.[k], item);
        td.textContent = String(
          v ?? (column.key === "label" ? (item.name ?? item.id ?? "") : ""),
        );
        row.append(td);
      }
      row.tabIndex = 0;
      row.onclick = () => this.emit("select", { id: String(item.id ?? "") });
      body.append(row);
    }
    table.append(body);
    this.content.append(table);
  }
}
