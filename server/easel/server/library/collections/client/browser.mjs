import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Browser extends Base {
  constructor() {
    super("easel.collections.browser", []);
  }
  update(p) {
    this.begin(p);
    const search = el("input");
    search.type = "search";
    search.setAttribute("aria-label", "Search entries");
    search.value = this.query ?? p.query;
    const results = el("div");
    const show = () => {
      this.query = search.value;
      results.replaceChildren(
        this.rows(
          p.items.filter((i) =>
            JSON.stringify(i).toLowerCase().includes(this.query.toLowerCase()),
          ),
          { select: true, actions: p.actions },
        ),
      );
    };
    search.oninput = show;
    show();
    this.content.append(search, results);
  }
}
