const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => structuredClone(v);
const canonical = (v) =>
  JSON.stringify(v, (_, value) =>
    object(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  );
function checkType(value, rule, label) {
  const type = typeof rule === "string" ? rule : rule?.type;
  const checks = {
    String: (v) => typeof v === "string",
    Boolean: (v) => typeof v === "boolean",
    Number: (v) => typeof v === "number" && Number.isFinite(v),
    Integer: Number.isInteger,
    Object: object,
    Array: Array.isArray,
    Null: (v) => v === null,
  };
  const key = Object.keys(checks).find(
    (k) => k.toLowerCase() === type?.toLowerCase(),
  );
  if (!key || !checks[key](value))
    throw new Error(label + ": expected " + type);
}
function validateFields(data, rules, label, defaults = false) {
  if (!object(data) || !object(rules))
    throw new Error(label + ": expected object");
  const result = Object.create(null);
  for (const key of Object.keys(data))
    if (!own(rules, key)) throw new Error(label + ": undeclared field " + key);
  for (const [key, rule] of Object.entries(rules)) {
    if (own(data, key)) result[key] = clone(data[key]);
    else if (defaults && own(rule, "default"))
      result[key] = clone(rule.default);
    else throw new Error(label + ": missing " + key);
    checkType(result[key], rule, label + "." + key);
  }
  return result;
}
function contract(def, name) {
  if (!object(def)) throw new Error(name + ": invalid interface JSON");
  if (def.kind !== "component") return;
  for (const field of ["properties", "events", "slots"])
    if (!object(def[field])) throw new Error(name + ": invalid " + field);
  for (const [key, rule] of Object.entries(def.properties)) {
    if (!object(rule) || typeof rule.type !== "string")
      throw new Error(name + ": invalid property " + key);
    if (own(rule, "default")) checkType(rule.default, rule, name + "." + key);
  }
  for (const e of Object.values(def.events))
    if (!object(e) || !object(e.payload))
      throw new Error(name + ": invalid event");
}
export function createInterfaces() {
  const definitions = new Map(),
    implementations = new Map();
  let active = null,
    registering = true,
    saved = null,
    importer = null;
  const exact = (name) => {
    if (typeof name !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*@[1-9][0-9]*$/.test(name))
      throw new Error("Exact interface version required");
  };
  const isClass = (Class) =>
    typeof Class === "function" &&
    /^class\s/.test(Function.prototype.toString.call(Class));
  const loaded = (item, name) => {
    if (!item.obj)
      throw new Error(
        name +
          " from " +
          item.host +
          " is not loaded; require it or await Easel.Interfaces.load(\"" +
          name +
          "\")",
      );
    return item.obj;
  };
  const fetchImplementation = async (item, name, chain = new Set()) => {
    if (item.obj || chain.has(item)) return;
    const next = new Set(chain).add(item);
    item.loading ??= (async () => {
      for (const required of item.requires || [])
        await Promise.all(
          (implementations.get(required) || []).map((dependency) =>
            fetchImplementation(dependency, required, next),
          ),
        );
      if (!item.importer) throw new Error("No implementation loader");
      const module = await item.importer(item.url);
      if (!isClass(module.default))
        throw new Error("default export must be a class");
      item.obj = module.default;
    })();
    try {
      await item.loading;
    } catch (error) {
      item.loading = null;
      throw new Error(name + " from " + item.host + ": " + error.message);
    }
  };
  const list = (name) => {
    if (typeof name !== "string") throw new Error("Interface name required");
    if (name.includes("@")) exact(name);
    const result = [];
    for (const [id, items] of implementations)
      if (id === name || id.split("@")[0] === name) {
        const [base, version] = id.split("@");
        result.push(
          ...items
            .map((item) => ({
              name: base,
              version: Number(version),
              host: item.host,
              get obj() {
                return loaded(item, id);
              },
            }))
            .sort(
              (a, b) =>
                Number(b.host === base.slice(0, base.lastIndexOf("."))) -
                Number(a.host === base.slice(0, base.lastIndexOf("."))),
            ),
        );
      }
    return result.sort((a, b) => a.version - b.version);
  };
  const api = Object.freeze({
    supports(name) {
      exact(name);
      return list(name).length;
    },
    list,
    create(name, host) {
      exact(name);
      const items = list(name);
      const item = host ? items.find((i) => i.host === host) : items[0];
      if (!item)
        throw new Error(
          "Missing implementation " + name + (host ? " from " + host : ""),
        );
      return new item.obj();
    },
    async load(name, host) {
      exact(name);
      const items = (implementations.get(name) || []).filter(
        (i) => !host || i.host === host,
      );
      if (!items.length)
        throw new Error(
          "Missing implementation " + name + (host ? " from " + host : ""),
        );
      await Promise.all(items.map((item) => fetchImplementation(item, name)));
    },
    register(host, name, Class) {
      exact(name);
      if (
        !registering ||
        !active ||
        host !== active.host ||
        !active.implements.includes(name)
      )
        throw new Error("Unauthorized interface registration " + name);
      if (!isClass(Class)) throw new Error("Implementation must be a class");
      const items = implementations.get(name) || [];
      if (items.some((i) => i.host === host))
        throw new Error("Duplicate implementation " + name + " from " + host);
      items.push({ host, obj: Class });
      implementations.set(name, items);
    },
  });
  return {
    api,
    definitions,
    define(name, def) {
      exact(name);
      contract(def, name);
      if (
        definitions.has(name) &&
        canonical(definitions.get(name)) !== canonical(def)
      )
        throw new Error("Conflicting interface contract " + name);
      definitions.set(name, clone(def));
    },
    lazy(name, host, url, requires = []) {
      exact(name);
      const items = implementations.get(name) || [];
      if (items.some((i) => i.host === host))
        throw new Error("Duplicate implementation " + name + " from " + host);
      items.push({ host, obj: null, url, importer, requires });
      implementations.set(name, items);
    },
    loader(load) {
      importer = load;
    },
    async preload(names = []) {
      for (const name of names)
        await Promise.all(
          (implementations.get(name) || []).map((item) =>
            fetchImplementation(item, name),
          ),
        );
    },
    enter(pkg) {
      active = pkg;
    },
    begin() {
      if (active) throw new Error("Library stage already active");
      registering = true;
    },
    leave() {
      active = null;
    },
    snapshot() {
      saved = {
        definitions: new Map(definitions),
        implementations: new Map(
          [...implementations].map(([name, items]) => [name, [...items]]),
        ),
      };
    },
    restore() {
      if (!saved) return;
      definitions.clear();
      for (const [name, def] of saved.definitions) definitions.set(name, def);
      implementations.clear();
      for (const [name, items] of saved.implementations)
        implementations.set(name, [...items]);
      active = null;
    },
    close(packages) {
      registering = false;
      active = null;
      for (const p of packages)
        if (p.libraryEntry)
          for (const name of p.implements)
            if (!list(name).some((i) => i.host === p.host))
              throw new Error(p.id + ": missing interface " + name);
    },
  };
}
export function createComponents(registry, root) {
  const ids = new Map(),
    handles = new WeakMap();
  let next = 0,
    rootNode = null;
  let applicationMount = null,
    applicationRoot = null,
    shellIDs = new Set();
  const live = (h) => {
    const s = handles.get(h);
    if (!s || s.dead) throw new Error("Invalid component handle");
    return s;
  };
  const visit = (s, mounted) => {
    if (s.mounted !== mounted) {
      if (!mounted) for (const child of s.children) visit(child, false);
      s.mounted = mounted;
      s.impl[mounted ? "mount" : "unmount"]?.();
      if (mounted) for (const child of s.children) visit(child, true);
    }
  };
  const unlink = (s) => {
    let failure;
    try {
      visit(s, false);
    } catch (error) {
      failure = error;
    }
    if (s.parent) s.parent.children.splice(s.parent.children.indexOf(s), 1);
    s.parent = null;
    s.slot = null;
    s.impl.element.remove();
    if (rootNode === s) rootNode = null;
    if (applicationRoot === s) applicationRoot = null;
    if (failure) throw failure;
  };
  const api = {
    create(name, options = {}) {
      const def = registry.definitions.get(name);
      if (def?.kind !== "component") throw new Error("Not a component " + name);
      let id = options.id;
      if (id === undefined) {
        do {
          id = "component-" + ++next;
        } while (ids.has(id));
      }
      if (typeof id !== "string" || !id || ids.has(id))
        throw new Error("Duplicate or invalid component ID " + id);
      const properties = validateFields(
        options.properties ?? options.props ?? {},
        def.properties,
        name,
        true,
      );
      const impl = registry.api.create(name, options.host);
      let s;
      try {
        if (
          !(impl.element instanceof Element) ||
          typeof impl.update !== "function" ||
          typeof impl.destroy !== "function"
        )
          throw new Error("Invalid HTML component " + name);
        impl.element.setAttribute?.("data-easel-id", id);
        for (const slot of Object.keys(def.slots))
          if (
            !(impl.slots?.[slot] instanceof Element) ||
            !(
              impl.element === impl.slots[slot] ||
              impl.element.contains(impl.slots[slot])
            )
          )
            throw new Error("Invalid slot " + slot);
        s = {
          id,
          def,
          impl,
          properties,
          parent: null,
          slot: null,
          children: [],
          listeners: new Map(),
          dead: false,
          mounted: false,
        };
        impl.onEvent = (event, payload) => {
          if (s.dead) return;
          if (!own(def.events, event))
            throw new Error("Undeclared UI event " + event);
          const checked = validateFields(
            payload,
            def.events[event].payload,
            event,
          );
          for (const listener of [...(s.listeners.get(event) || [])])
            listener(clone(checked));
        };
        impl.update(clone(properties));
      } catch (error) {
        impl.destroy?.();
        throw error;
      }
      const handle = Object.freeze({
        get id() {
          live(handle);
          return id;
        },
        get parent() {
          return live(handle).parent?.handle ?? null;
        },
        get slot() {
          return live(handle).slot;
        },
        get children() {
          return live(handle).children.map((c) => c.handle);
        },
        get properties() {
          return clone(live(handle).properties);
        },
        get props() {
          return clone(live(handle).properties);
        },
        setProperties(patch) {
          live(handle);
          if (!object(patch)) throw new Error("Invalid property patch");
          const merged = validateFields(
            { ...s.properties, ...patch },
            def.properties,
            name,
          );
          impl.update(clone(merged));
          s.properties = merged;
        },
        setProps(patch) {
          return handle.setProperties(patch);
        },
        attach(parent, slot) {
          live(handle);
          const p = live(parent);
          if (!own(p.def.slots, slot))
            throw new Error("Undeclared slot " + slot);
          for (let a = p; a; a = a.parent)
            if (a === s) throw new Error("Component cycle");
          unlink(s);
          s.parent = p;
          s.slot = slot;
          p.children.push(s);
          p.impl.slots[slot].append(impl.element);
          visit(s, p.mounted);
          return handle;
        },
        detach() {
          live(handle);
          unlink(s);
          return handle;
        },
        destroy() {
          live(handle);
          let failure;
          try {
            unlink(s);
          } catch (e) {
            failure = e;
          }
          for (const child of [...s.children])
            try {
              child.handle.destroy();
            } catch (e) {
              failure ??= e;
            }
          s.listeners.clear();
          impl.onEvent = undefined;
          try {
            impl.destroy();
          } catch (e) {
            failure ??= e;
          } finally {
            impl.element.remove();
            s.dead = true;
            ids.delete(id);
          }
          if (failure) throw failure;
        },
        on(event, listener) {
          live(handle);
          if (!own(def.events, event) || typeof listener !== "function")
            throw new Error("Invalid UI listener " + event);
          const listeners = s.listeners.get(event) || new Set();
          listeners.add(listener);
          s.listeners.set(event, listeners);
          return () => listeners.delete(listener);
        },
      });
      s.handle = handle;
      handles.set(handle, s);
      ids.set(id, handle);
      return handle;
    },
    get(id) {
      return ids.get(id) ?? null;
    },
    mountRoot(handle) {
      const s = live(handle);
      if (applicationMount) {
        if (applicationRoot && applicationRoot !== s)
          throw new Error("Application root already mounted");
        handle.attach(applicationMount.parent, applicationMount.slot);
        applicationRoot = s;
        return handle;
      }
      if (rootNode && rootNode !== s) throw new Error("Root already mounted");
      unlink(s);
      rootNode = s;
      root.append(s.impl.element);
      visit(s, true);
      return handle;
    },
  };
  return {
    api: Object.freeze(api),
    destroy() {
      for (const [id, h] of [...ids])
        if (ids.has(id))
          try {
            h.destroy();
          } catch {}
      root.replaceChildren();
    },
    setApplicationMount(parent, slot) {
      const state = live(parent);
      if (!own(state.def.slots, slot))
        throw new Error("Undeclared application slot " + slot);
      applicationMount = { parent, slot };
      shellIDs = new Set(ids.keys());
    },
    destroyApplication() {
      for (const [id, handle] of [...ids])
        if (!shellIDs.has(id) && ids.has(id)) {
          try {
            handle.destroy();
          } catch {}
        }
      applicationRoot = null;
    },
    hasRoot: () =>
      applicationMount ? applicationRoot !== null : rootNode !== null,
  };
}

export async function loadClientPackages(
  plan,
  registry,
  easel,
  application,
  status = () => {},
  stopped = () => false,
) {
  registry.begin();
  registry.loader(async (url) => {
    const module = await import(url);
    if (stopped()) throw new Error("Disconnected");
    if (typeof module.initialize === "function")
      await module.initialize({ Easel: easel, Application: application });
    return module;
  });
  const packages = new Map(plan.packages.map((p) => [p.id, p]));
  for (const p of plan.packages)
    for (const i of p.interfaces) {
      if (stopped()) throw new Error("Disconnected");
      status("Loading " + p.id + " · " + i.name);
      const response = await fetch(i.url);
      if (stopped()) throw new Error("Disconnected");
      if (!response.ok) throw new Error(p.id + ": missing resource " + i.url);
      registry.define(i.name, await response.json());
      if (i.implementation)
        registry.lazy(i.name, p.host, i.implementation, i.requires);
    }
  const run = async (id, stage) => {
    if (stopped()) throw new Error("Disconnected");
    const p = packages.get(id);
    if (!p?.[stage]) throw new Error("Invalid package stage " + id);
    status("Initializing " + id);
    await registry.preload(
      p[stage === "libraryEntry" ? "libraryRequires" : "applicationRequires"],
    );
    if (stopped()) throw new Error("Disconnected");
    registry.enter(stage === "libraryEntry" ? p : null);
    try {
      const module = await import(p[stage]);
      if (stopped()) throw new Error("Disconnected");
      if (typeof module.initialize === "function")
        await module.initialize({ Easel: easel, Application: application });
    } catch (error) {
      throw new Error(id + " " + p[stage] + ": " + error.message);
    } finally {
      registry.leave();
    }
  };
  for (const id of plan.libraryOrder) await run(id, "libraryEntry");
  registry.close(plan.packages);
  for (const id of plan.applicationOrder) await run(id, "applicationEntry");
}

export function createRuntime(root, status = () => {}, options = {}) {
  let socket,
    phase = "disconnected",
    serial = 0,
    resolveClosed,
    closing = false;
  const pending = new Map(),
    listeners = new Map(),
    subscriptions = new Map();
  const registry = options.registry ?? createInterfaces(),
    components = options.components ?? createComponents(registry, root);
  registry.snapshot();
  let entering = Promise.resolve();
  const closed = new Promise((resolve) => (resolveClosed = resolve));
  const request = (type, fields = {}) =>
    new Promise((resolve, reject) => {
      if (!socket || socket.readyState !== 1) {
        reject(new Error("Disconnected"));
        return;
      }
      const id = String(++serial);
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(type + " timed out"));
      }, 30000);
      pending.set(id, { type, resolve, reject, timeout });
      socket.send(JSON.stringify({ type, id, ...fields }));
    });
  const sync = (name) => {
    const previous = subscriptions.get(name) || Promise.resolve();
    const work = previous
      .catch(() => {})
      .then(async () => {
        const type = listeners.get(name)?.size ? "subscribe" : "unsubscribe";
        const ack = await request(type, { names: [name] });
        if (!ack.accepted.includes(name) || ack.rejected.length)
          throw new Error("Subscription denied: " + name);
      });
    subscriptions.set(name, work);
    return work;
  };
  const events = Object.freeze({
    emit(name, payload) {
      if (phase !== "ready")
        return Promise.reject(new Error("Client is not ready"));
      return request("event", { name, payload }).then(() => undefined);
    },
    on(name, handler) {
      if (typeof name !== "string" || !name || typeof handler !== "function")
        throw new Error("Invalid event listener");
      const set = listeners.get(name) || new Set();
      const first = !set.size;
      set.add(handler);
      listeners.set(name, set);
      if (first && ["bootstrapping", "ready"].includes(phase))
        sync(name).catch((error) => {
          if (phase === "ready") status(error.message);
        });
      return () => events.off(name, handler);
    },
    off(name, handler) {
      const set = listeners.get(name);
      if (set?.delete(handler) && !set.size) {
        listeners.delete(name);
        if (["bootstrapping", "ready"].includes(phase))
          sync(name).catch((error) => status(error.message));
      }
    },
  });
  const easel = Object.freeze({
    Interfaces: registry.api,
    Components: components.api,
  });
  let level = null;
  const files = Object.freeze({
    url(id) {
      return "/files/" + (level || "server") + "/" + encodeURIComponent(id);
    },
    async upload(contents, settings = {}) {
      if (!(contents instanceof Blob))
        throw new Error("Upload a File or a Blob");
      const name = settings.name ?? contents.name ?? "";
      const type = settings.mediaType || contents.type;
      if (!type) throw new Error("The file has no media type");
      const target =
        "/files/" +
        (level || "server") +
        (settings.replace ? "/" + encodeURIComponent(settings.replace) : "") +
        "?name=" +
        encodeURIComponent(name);
      const headers = { "Content-Type": type };
      if (settings.replace && settings.hash)
        headers["If-Match"] = '"' + settings.hash + '"';
      const response = await fetch(target, {
        method: settings.replace ? "PUT" : "POST",
        headers,
        body: contents,
      });
      let data = null;
      try {
        data = await response.json();
      } catch {}
      if (!response.ok)
        throw Object.assign(new Error(data?.error || "Upload failed"), {
          status: response.status,
        });
      return data.file;
    },
  });
  const readyHandlers = new Set();
  const application = Object.freeze({ events, files, onReady(handler) {
    readyHandlers.add(handler);
    return () => readyHandlers.delete(handler);
  } });
  const destroy = () => {
    closing = true;
    phase = "disconnected";
    socket?.close();
    for (const p of pending.values()) {
      clearTimeout(p.timeout);
      p.reject(new Error("Disconnected"));
    }
    pending.clear();
    if (options.components) components.destroyApplication();
    else components.destroy();
    listeners.clear();
    resolveClosed();
  };
  async function bootstrap(plan) {
    if (
      plan.protocol?.major !== 1 ||
      plan.protocol?.minor !== 0 ||
      plan.client !== "http" ||
      !Array.isArray(plan.packages)
    )
      throw new Error("Invalid welcome");
    phase = "bootstrapping";
    level = plan.game ?? null;
    globalThis.Easel = easel;
    globalThis.Application = application;
    await loadClientPackages(
      plan,
      registry,
      easel,
      application,
      status,
      () => closing,
    );
    if (closing) throw new Error("Disconnected");
    if (!components.hasRoot())
      throw new Error("Application did not mount a root component");
    for (const name of listeners.keys())
      if (!subscriptions.has(name)) sync(name);
    while (true) {
      const work = [...subscriptions.values()];
      await Promise.all(work);
      if (
        work.length === subscriptions.size &&
        work.every((v, i) => v === [...subscriptions.values()][i])
      )
        break;
    }
    await request("ready");
    phase = "ready";
    for (const handler of [...readyHandlers]) await handler();
  }
  async function enter(plan) {
    phase = "bootstrapping";
    listeners.clear();
    subscriptions.clear();
    readyHandlers.clear();
    if (options.components) components.destroyApplication();
    else components.destroy();
    registry.restore();
    await bootstrap(plan);
    options.onLevel?.({ game: plan.game ?? null });
  }
  const move = (plan) => {
    const work = entering.then(() => enter(plan));
    entering = work.catch((error) => {
      if (closing) return;
      status(error.message);
      destroy();
    });
    return work;
  };
  return {
    closed,
    destroy,
    async leave() {
      if (phase !== "ready") throw new Error("Client is not ready");
      await move(await request("leave"));
    },
    async connect(url) {
      socket = new WebSocket(url);
      phase = "negotiating";
      await new Promise((resolve, reject) => {
        socket.onopen = resolve;
        socket.onerror = () => reject(new Error("Could not connect to game"));
        socket.onclose = () => {
          reject(new Error("Disconnected"));
          destroy();
        };
      });
      socket.onmessage = (event) => {
        let frame;
        try {
          frame = JSON.parse(event.data);
          if (!object(frame) || typeof frame.type !== "string")
            throw new Error("Invalid server frame");
        } catch (error) {
          status(error.message);
          destroy();
          return;
        }
        if (frame.type === "welcome" && frame.replyTo === undefined) {
          move(frame).catch(() => {});
          return;
        }
        if (frame.type === "event") {
          if (phase === "ready")
            for (const fn of [...(listeners.get(frame.name) || [])])
              try {
                fn(clone(frame.payload));
              } catch (error) {
                status(error.message);
              }
          return;
        }
        const p = pending.get(frame.replyTo);
        if (!p) {
          status("Uncorrelated server response");
          destroy();
          return;
        }
        const expected = {
          hello: "welcome",
          ready: "ready.ok",
          event: "event.ack",
          leave: "welcome",
          subscribe: "subscription.ack",
          unsubscribe: "subscription.ack",
        };
        pending.delete(frame.replyTo);
        clearTimeout(p.timeout);
        if (frame.type === "error")
          p.reject(new Error(frame.message || frame.code));
        else if (frame.type !== expected[p.type])
          p.reject(new Error("Unexpected server response"));
        else p.resolve(frame);
      };
      try {
        const work = enter(
          await request("hello", { protocol: { major: 1, minor: 0 } }),
        );
        entering = work.catch(() => {});
        await work;
      } catch (error) {
        destroy();
        throw error;
      }
    },
  };
}
