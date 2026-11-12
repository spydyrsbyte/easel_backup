const SCOPES = ["self", "opponents", "all"];
const LIMITS = { definitions: 20, depth: 8, actions: 50 };
const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : [value]);
function fieldSpec(spec) {
  if (Array.isArray(spec)) return { kind: "values", values: spec };
  if (spec === "string" || spec === "boolean") return { kind: spec };
  if (!plain(spec)) return { kind: "unknown" };
  if (Array.isArray(spec.values)) return { ...spec, kind: "values" };
  if (spec.type === "string" || spec.type === "boolean")
    return { ...spec, kind: spec.type };
  return { ...spec, kind: "number", integer: spec.integer !== false };
}
function checkValue(raw, value, label) {
  const spec = fieldSpec(raw);
  if (spec.kind === "values") {
    if (!list(value).every((item) => spec.values.includes(item)))
      throw new TypeError(
        `${label} must be one of: ${spec.values.join(", ")}.`,
      );
    return value;
  }
  if (spec.kind === "string") {
    if (
      !list(value).every(
        (item) => typeof item === "string" && item.length <= 80,
      )
    )
      throw new TypeError(`${label} must be text.`);
    return value;
  }
  if (spec.kind === "boolean") {
    if (typeof value !== "boolean")
      throw new TypeError(`${label} must be true or false.`);
    return value;
  }
  if (spec.kind === "number") {
    const integer = spec.integer;
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      (integer && !Number.isInteger(value)) ||
      (Number.isFinite(spec.min) && value < spec.min) ||
      (Number.isFinite(spec.max) && value > spec.max)
    )
      throw new TypeError(
        `${label} must be a${integer ? "n integer" : " number"}${Number.isFinite(spec.min) ? " from " + spec.min : ""}${Number.isFinite(spec.max) ? " to " + spec.max : ""}.`,
      );
    return value;
  }
  throw new TypeError(`${label} is not configurable.`);
}
class PlayerEventVocabulary {
  constructor({ events = {}, responses = {} } = {}) {
    if (!plain(events) || !plain(responses))
      throw new TypeError("Describe player events and responses as objects.");
    this.events = events;
    this.responses = responses;
  }
  validate(definition) {
    if (!plain(definition))
      throw new TypeError("A player event must be an object.");
    const event = this.events[definition.event];
    if (!event) throw new TypeError(`Unknown event: ${definition.event}.`);
    const scope = definition.scope ?? "self";
    if (!SCOPES.includes(scope))
      throw new TypeError(`Scope must be one of: ${SCOPES.join(", ")}.`);
    const when = {};
    for (const [key, value] of Object.entries(definition.when ?? {})) {
      if (key === "this") when.this = checkValue("boolean", value, "when.this");
      else if (event.fields && Object.hasOwn(event.fields, key))
        when[key] = checkValue(event.fields[key], value, `when.${key}`);
      else
        throw new TypeError(`${definition.event} has no field named ${key}.`);
    }
    if (
      !plain(definition.response) ||
      Object.keys(definition.response).some((key) => key !== "self")
    )
      throw new TypeError("Responses can only act on self.");
    const actions = list(definition.response.self ?? []);
    if (!actions.length || actions.length > 5)
      throw new TypeError("Give between one and five responses.");
    const response = {
      self: actions.map((action, index) => {
        if (!plain(action))
          throw new TypeError("Each response must be an object.");
        const shape = this.responses[action.type];
        if (!shape) throw new TypeError(`Unknown response: ${action.type}.`);
        const clean = { type: action.type };
        for (const [key, spec] of Object.entries(shape.fields || {})) {
          if (action[key] === void 0) {
            if (shape.optional?.includes(key)) continue;
            throw new TypeError(`response ${index + 1} needs ${key}.`);
          }
          clean[key] = checkValue(
            spec,
            action[key],
            `response ${index + 1} ${key}`,
          );
        }
        const extra = Object.keys(action).find(
          (key) => key !== "type" && !Object.hasOwn(shape.fields || {}, key),
        );
        if (extra)
          throw new TypeError(`${action.type} has no field named ${extra}.`);
        return clean;
      }),
    };
    return { event: definition.event, scope, when, response };
  }
}
function matches(when, event, source) {
  for (const [key, expected] of Object.entries(when)) {
    if (key === "this") {
      if ((event.source === source) !== expected) return false;
      continue;
    }
    const actual = list(event.fields?.[key]);
    if (!list(expected).some((value) => actual.includes(value))) return false;
  }
  return true;
}
class PlayerEvents {
  constructor({ id, owner, vocabulary, execute, boardid, limits = {} } = {}) {
    if (!(vocabulary instanceof PlayerEventVocabulary))
      throw new TypeError("PlayerEvents needs a vocabulary.");
    if (typeof execute !== "function")
      throw new TypeError("PlayerEvents needs an execute function.");
    Object.assign(this, {
      id: id || "player-events-" + owner,
      boardid,
      owner,
      vocabulary,
      execute,
      limits: { ...LIMITS, ...limits },
    });
    this.sources = /* @__PURE__ */ new Map();
    this.depth = 0;
  }
  feed(source, definitions = []) {
    const checked = list(definitions)
      .slice(0, this.limits.definitions)
      .map((definition) => this.vocabulary.validate(definition));
    if (checked.length) this.sources.set(source, checked);
    else this.sources.delete(source);
    return checked;
  }
  unfeed(source) {
    this.sources.delete(source);
  }
  clear() {
    this.sources.clear();
  }
  inScope(scope, event) {
    if (scope === "all") return true;
    if (scope === "self") return event.player === this.owner;
    return event.player != null && event.player !== this.owner;
  }
  receive(event) {
    if (!this.vocabulary.events[event.verb]) return true;
    if (this.depth >= this.limits.depth) return true;
    this.depth++;
    let performed = 0;
    try {
      for (const [source, definitions] of [...this.sources])
        for (const definition of definitions) {
          if (
            definition.event !== event.verb ||
            !this.inScope(definition.scope, event)
          )
            continue;
          if (!matches(definition.when, event, source)) continue;
          for (const action of definition.response.self) {
            if (performed++ >= this.limits.actions) return true;
            this.execute(action, {
              owner: this.owner,
              source,
              event,
              definition,
            });
          }
        }
    } finally {
      this.depth--;
    }
    return true;
  }
}
export { PlayerEventVocabulary, PlayerEvents, fieldSpec };
