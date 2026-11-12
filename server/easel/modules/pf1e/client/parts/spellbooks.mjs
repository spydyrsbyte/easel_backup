import { element as el } from "../safe.mjs";

export function renderSpellbooksTab(sheet, p) {
  const root = el("div", "pf1e-tab-spellbooks kit-content");
  const derived = p.derived || {};
  const actor = p.actor || {};
  const defaultBooks = [
    { id: "primary", name: "Primary" },
    { id: "secondary", name: "Secondary" },
    { id: "tertiary", name: "Tertiary" },
    { id: "spellLike", name: "Spell-Like" }
  ];
  const spellbooks = Array.isArray(p.spellbooks) && p.spellbooks.length > 0 ? p.spellbooks : defaultBooks;
  const activeSbId = sheet.activeSpellbook || spellbooks[0]?.id || "primary";

  const subtabs = el("div", "kit-row pf1e-spellbook-subtabs");
  for (const sb of spellbooks) {
    const isAct = activeSbId === sb.id;
    const b = el("button", `kit-button pf1e-sb-subtab${isAct ? " active" : ""}`, sb.name || "Spellbook");
    b.type = "button";
    if (isAct) {
      b.style.borderColor = "var(--kit-accent)";
    }
    b.onclick = () => {
      sheet.activeSpellbook = sb.id;
      sheet.emit("selectSpellbook", { spellbookId: sb.id });
      sheet.update({ ...sheet.props, activeSpellbook: sb.id });
    };
    subtabs.append(b);
  }
  root.append(subtabs);

  const banner = el("div", "kit-row pf1e-spellbook-banner");
  const asf = derived.encumbrance?.asf ?? actor.attributes?.asf ?? 0;
  banner.append(el("span", "kit-badge", `ASF: ${asf}%`));
  if (p.spellPoints || actor.settings?.spellPoints) {
    const spVal = p.spellPoints?.current ?? actor.spellPoints?.current ?? 0;
    const spMax = p.spellPoints?.max ?? actor.spellPoints?.max ?? 0;
    banner.append(el("span", "kit-badge", `Spell Points: ${spVal} / ${spMax}`));
  }
  if (p.domainSlots || actor.domainSlots) {
    banner.append(el("span", "kit-badge", "Domain Slots: Active"));
  }
  root.append(banner);

  const sbWrap = el("div", "pf1e-spellbook-mount");
  sbWrap.append(sheet.slots.spellbooksSlot);
  root.append(sbWrap);

  const dropZone = el("div", "kit-item pf1e-spell-dropzone");
  dropZone.append(el("p", "kit-muted", "Drag and drop spells here from Compendium to prepare or add"));
  dropZone.ondragover = (e) => e.preventDefault();
  dropZone.ondrop = (e) => {
    e.preventDefault();
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/x-easel-kit") || "{}");
      if (data.id) {
        sheet.emit("addSpell", { spellId: data.id, spellbookId: activeSbId, spell: data });
      }
    } catch {}
  };
  root.append(dropZone);

  if (p.canEdit) root.append(sheet.button("Add Spell", "createRecord", { recordType: "Spell" }));

  return root;
}
