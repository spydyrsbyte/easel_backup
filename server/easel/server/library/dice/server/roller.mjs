import { copy, list, integer } from "./support.mjs";
import { random } from "./random.mjs";
export default class RollerTool {
  roll(sides = 6, count = 1, source) {
    const faces = Array.isArray(sides)
      ? list(sides)
      : Array.from({ length: integer(sides, 2, 10000) }, (_, i) => i + 1);
    if (faces.length < 2 || faces.length > 10000)
      throw new Error("Invalid die faces");
    integer(count, 0, 1000);
    const r = random(source);
    return Array.from({ length: count }, () =>
      copy(faces[integer(r.integer(0, faces.length), 0, faces.length - 1)]),
    );
  }
}
