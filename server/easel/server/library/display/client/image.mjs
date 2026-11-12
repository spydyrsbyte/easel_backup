import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";
export default class Image extends Base {
  constructor() {
    super("easel.display.image", []);
  }
  update(p) {
    this.begin(p);
    const image = this.image(p.src, p.alt);
    image.style.objectFit = ["contain", "cover", "fill"].includes(p.fit)
      ? p.fit
      : "contain";
    if (p.aspect) image.style.aspectRatio = p.aspect;
    this.content.append(image);
    if (p.text) this.content.append(this.text(p.text, "figcaption"));
  }
}
