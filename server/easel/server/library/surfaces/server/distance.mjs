import { point } from "./support.mjs";
import { distance } from "./spatial.mjs";
export default class DistanceTool {
  measure(a, b, kind = "euclidean") {
    point(a);
    point(b);
    const x = Math.abs(a.x - b.x),
      y = Math.abs(a.y - b.y);
    if (kind === "euclidean") return Math.hypot(x, y);
    if (kind === "manhattan") return x + y;
    if (kind === "chebyshev") return Math.max(x, y);
    if (kind === "hex") return (x + y + Math.abs(a.x + a.y - b.x - b.y)) / 2;
    throw new Error("Unknown distance metric");
  }
  neighbors(pointValue, kind = "square") {
    point(pointValue);
    const offsets =
      kind === "hex"
        ? [
            [1, 0],
            [0, 1],
            [-1, 1],
            [-1, 0],
            [0, -1],
            [1, -1],
          ]
        : kind === "square"
          ? [
              [1, 0],
              [0, 1],
              [-1, 0],
              [0, -1],
            ]
          : null;
    if (!offsets) throw new Error("Unknown neighborhood");
    return offsets.map(([x, y]) => ({
      x: x + pointValue.x,
      y: y + pointValue.y,
    }));
  }
}
