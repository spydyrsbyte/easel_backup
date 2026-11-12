import { copy, list, key, unique } from "./support.mjs";
export default class StepsTool {
  validate(steps) {
    unique(list(steps).map((s) => key(s.id)));
    const ids = new Set(steps.map((s) => s.id));
    for (const s of steps)
      for (const target of list(s.next ?? []))
        if (!ids.has(target)) throw new Error("Unknown transition");
    return copy(steps);
  }
  transition(steps, current, next) {
    this.validate(steps);
    const step = steps.find((s) => s.id === current);
    if (!step || !step.next?.includes(next))
      throw new Error("Transition not allowed");
    return copy(steps.find((s) => s.id === next));
  }
}
