export class ActorBase {
  getActiveModifiers(context = {}) {
    const list = [];
    const sourceMap = context.records ?? context;

    if (typeof this.expandConditions === "function") {
      const condResult = this.expandConditions(this.conditions);
      if (Array.isArray(condResult.modifiers)) {
        list.push(...condResult.modifiers);
      }
    }

    const buffs = Array.isArray(sourceMap.buffs)
      ? sourceMap.buffs
      : (Array.isArray(this.buffs) ? this.buffs : []);
    for (const b of buffs) {
      if (!b || b.active === false) continue;
      if (Array.isArray(b.modifiers)) {
        for (const m of b.modifiers) {
          if (!m || m.enabled === false) continue;
          list.push({ ...m, source: m.source ?? b.name ?? b.id ?? "Buff" });
        }
      }
    }

    const features = Array.isArray(sourceMap.features)
      ? sourceMap.features
      : (Array.isArray(this.features) ? this.features : []);
    for (const f of features) {
      if (!f || f.enabled === false) continue;
      if (Array.isArray(f.modifiers)) {
        for (const m of f.modifiers) {
          if (!m || m.enabled === false) continue;
          list.push({ ...m, source: m.source ?? f.name ?? f.id ?? "Feature" });
        }
      }
    }

    const items = Array.isArray(sourceMap.items)
      ? sourceMap.items
      : (Array.isArray(this.items) ? this.items : []);
    for (const item of items) {
      if (!item || (item.equipped === false && item.carried === false)) continue;
      if (Array.isArray(item.modifiers)) {
        for (const m of item.modifiers) {
          if (!m || m.enabled === false) continue;
          list.push({ ...m, source: m.source ?? item.name ?? item.id ?? "Item" });
        }
      }
    }

    const race = sourceMap.race ?? this.race;
    if (race && Array.isArray(race.modifiers)) {
      for (const m of race.modifiers) {
        if (!m || m.enabled === false) continue;
        list.push({ ...m, source: m.source ?? race.name ?? "Race" });
      }
    }

    const classLevels = Array.isArray(sourceMap.classLevels)
      ? sourceMap.classLevels
      : (Array.isArray(this.classLevels) ? this.classLevels : []);
    for (const cl of classLevels) {
      if (!cl) continue;
      if (Array.isArray(cl.modifiers)) {
        for (const m of cl.modifiers) {
          if (!m || m.enabled === false) continue;
          list.push({ ...m, source: m.source ?? cl.name ?? "ClassLevel" });
        }
      }
    }

    return list;
  }

  getContextNotes(context = {}) {
    const notes = [];
    const sourceMap = context.records ?? context;

    const sources = [
      ...(sourceMap.race ? [sourceMap.race] : (this.race ? [this.race] : [])),
      ...(Array.isArray(sourceMap.classLevels) ? sourceMap.classLevels : (Array.isArray(this.classLevels) ? this.classLevels : [])),
      ...(Array.isArray(sourceMap.buffs) ? sourceMap.buffs : (Array.isArray(this.buffs) ? this.buffs : [])),
      ...(Array.isArray(sourceMap.features) ? sourceMap.features : (Array.isArray(this.features) ? this.features : [])),
      ...(Array.isArray(sourceMap.items) ? sourceMap.items : (Array.isArray(this.items) ? this.items : []))
    ];

    for (const src of sources) {
      if (!src) continue;
      if (src.active === false || src.enabled === false) continue;
      if (Array.isArray(src.contextNotes)) {
        for (const cn of src.contextNotes) {
          if (!cn) continue;
          notes.push({ ...cn, source: cn.source ?? src.name ?? src.id });
        }
      }
    }

    return notes;
  }
}
