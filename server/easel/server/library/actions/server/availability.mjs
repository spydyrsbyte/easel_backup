import { copy, list, record, key, path } from "./support.mjs";
export default class AvailabilityTool {
  evaluate(actions, context = {}) {
    record(context);
    return list(actions).map((a) => {
      key(a.id);
      const unmet = list(a.requirements ?? []).filter(
        (r) => path(context, r.path) !== r.equals,
      );
      return {
        ...copy(a),
        available: a.enabled !== false && !unmet.length,
        reasons: unmet.map((r) => r.reason ?? r.path),
      };
    });
  }
}
