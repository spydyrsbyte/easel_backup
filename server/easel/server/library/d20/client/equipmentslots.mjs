import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

const DEFAULT_SLOTS = [
  "head",
  "headband",
  "eyes",
  "shoulders",
  "neck",
  "chest",
  "body",
  "armor",
  "belt",
  "wrists",
  "hands",
  "ring1",
  "ring2",
  "feet",
  "shield",
  "mainHand",
  "offHand",
  "slotless"
];

export default class EquipmentSlots extends Base {
  constructor() {
    super("easel.d20.equipmentslots", []);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const slots = p.slots || {};
    const editable = !!p.editable;

    const listNode = el("div", "kit-list kit-equipment-slots");

    for (const slotKey of DEFAULT_SLOTS) {
      const item = slots[slotKey] || null;
      const row = el("div", "kit-item kit-row kit-slot-row");
      row.dataset.slot = slotKey;

      const slotLabel = el("strong", "kit-label", slotKey);
      row.append(slotLabel);

      if (item) {
        const itemName = el(
          "span",
          "kit-item-name",
          typeof item === "string" ? item : item.name ?? "Item"
        );
        itemName.style.cursor = "pointer";
        itemName.onclick = () => {
          this.emit("inspectSlot", { slot: slotKey });
        };
        row.append(itemName);

        if (editable) {
          const unequipBtn = el("button", "kit-button kit-btn-unequip", "Unequip");
          unequipBtn.type = "button";
          unequipBtn.disabled = !!p.disabled;
          unequipBtn.onclick = () => {
            this.emit("unequipItem", { slot: slotKey });
          };
          row.append(unequipBtn);
        }
      } else {
        const emptyLabel = el("span", "kit-muted", "(Empty)");
        row.append(emptyLabel);

        if (editable) {
          const equipBtn = el("button", "kit-button kit-btn-equip", "Equip");
          equipBtn.type = "button";
          equipBtn.disabled = !!p.disabled;
          equipBtn.onclick = () => {
            this.emit("equipItem", { slot: slotKey });
          };
          row.append(equipBtn);
        }
      }

      listNode.append(row);
    }

    this.content.append(listNode);
  }
}
