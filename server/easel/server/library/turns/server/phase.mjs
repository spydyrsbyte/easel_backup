import { list, integer, key, unique } from "./support.mjs";
export default class PhaseTool {
  current(phases, index = 0) {
    unique(list(phases).map(key));
    integer(index, 0, phases.length - 1);
    return phases[index];
  }
  advance(phases, index, { loop = true } = {}) {
    this.current(phases, index);
    const next = index + 1;
    return {
      index: next < phases.length ? next : loop ? 0 : index,
      phase: phases[next < phases.length ? next : loop ? 0 : index],
      wrapped: next === phases.length,
      complete: next === phases.length && !loop,
    };
  }
}
