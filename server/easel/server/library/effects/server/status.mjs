import { list } from "./support.mjs";
export default class StatusTool {
  project(effects, subject, viewer) {
    return list(effects)
      .filter(
        (e) =>
          e.subject === subject &&
          (!e.audience ||
            e.audience.includes(viewer) ||
            e.audience.includes("*")),
      )
      .map((e) => ({
        id: e.id,
        name: e.name ?? e.id,
        icon: e.icon ?? null,
        duration: e.duration ?? null,
        value: e.value ?? null,
      }));
  }
}
