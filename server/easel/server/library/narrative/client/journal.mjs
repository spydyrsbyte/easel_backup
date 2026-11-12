import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Journal extends Base {
  constructor() {
    super("easel.narrative.journal", []);
  }
  update(p) {
    this.begin(p);
    if (p.editable)
      this.content.append(
        this.field("Journal", p.text || p.data.text || "", "text", "textarea"),
      );
    else {
      const article = el("article");
      for (const line of String(p.text || p.data.text || "").split("\n")) {
        const heading = line.match(/^(#{1,6}) +(.*)$/);
        if (heading)
          article.append(this.text(heading[2], "h" + heading[1].length));
        else article.append(this.text(line));
      }
      this.content.append(article);
    }
    if (p.data.author)
      this.content.append(this.text(p.data.author, "small", "kit-muted"));
  }
}
