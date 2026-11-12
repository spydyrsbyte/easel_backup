import { copy, list, key, unique } from "./support.mjs";
export default class PriorityTool {
  create(order, holder = order[0]) {
    unique(list(order).map(key));
    if (!order.includes(holder)) throw new Error("Unknown priority holder");
    return { order: copy(order), holder, passed: [] };
  }
  pass(state, actor) {
    if (actor !== state.holder) throw new Error("Actor does not hold priority");
    const passed = [...new Set([...state.passed, actor])];
    const complete = state.order.every((id) => passed.includes(id));
    const at = state.order.indexOf(actor);
    return {
      ...copy(state),
      passed,
      holder: complete ? null : state.order[(at + 1) % state.order.length],
      complete,
    };
  }
  claim(state, actor) {
    if (!list(state.order).includes(actor))
      throw new Error("Unknown priority actor");
    return { ...copy(state), holder: actor, passed: [], complete: false };
  }
}
