import { copy, list, record, key, unique } from "./support.mjs";
export default class EquipmentTool {
  equip(equipment, item, slots) {
    record(equipment);
    key(item.id);
    unique(list(slots).map(key));
    for (const slot of slots)
      if (equipment[slot] && equipment[slot] !== item.id)
        throw new Error("Slot occupied");
    return {
      ...copy(equipment),
      ...Object.fromEntries(slots.map((s) => [s, item.id])),
    };
  }
  unequip(equipment, id) {
    key(id);
    return Object.fromEntries(
      Object.entries(record(equipment)).filter(([, value]) => value !== id),
    );
  }
}
