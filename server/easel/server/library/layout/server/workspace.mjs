import {
  copy,
  list,
  number,
  record,
  key,
  unique,
  bounded,
  point,
} from "./support.mjs";
export default class WorkspaceTool {
  validate(value) {
    record(value);
    const windows = list(value.windows ?? []).map((w) => {
      record(w);
      key(w.id);
      point(w);
      number(w.width);
      number(w.height);
      if (w.width <= 0 || w.height <= 0)
        throw new RangeError("Window size must be positive");
      return copy(w);
    });
    unique(windows.map((w) => w.id));
    return { ...copy(value), windows };
  }
  fit(value, bounds) {
    const result = this.validate(value);
    number(bounds.width);
    number(bounds.height);
    if (bounds.width <= 0 || bounds.height <= 0)
      throw new RangeError("Invalid viewport");
    result.windows = result.windows.map((w) => ({
      ...w,
      width: Math.min(w.width, bounds.width),
      height: Math.min(w.height, bounds.height),
      x: bounded(w.x, 0, Math.max(0, bounds.width - w.width)),
      y: bounded(w.y, 0, Math.max(0, bounds.height - w.height)),
    }));
    return result;
  }
}
