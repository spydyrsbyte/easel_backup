import { copy, list, record, key, unique } from "./support.mjs";
export default class SceneTool {
  describe(scene) {
    record(scene);
    key(scene.id);
    return {
      id: scene.id,
      title: String(scene.title ?? ""),
      description: String(scene.description ?? ""),
      participants: unique(list(scene.participants ?? []).map(key)),
      references: copy(list(scene.references ?? [])),
    };
  }
  reorder(scenes, ids) {
    list(scenes);
    unique(list(ids).map(key));
    if (
      ids.length !== scenes.length ||
      ids.some((id) => !scenes.some((s) => s.id === id))
    )
      throw new Error("Order must preserve membership");
    return ids.map((id) => this.describe(scenes.find((s) => s.id === id)));
  }
}
