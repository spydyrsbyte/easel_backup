import { element as el } from "../safe.mjs";

export function renderBiographyTab(sheet, p) {
  const root = el("div", "pf1e-tab-biography kit-content");
  const actor = p.actor || {};
  const notes = actor.notes || {};

  const detailsRow = el("div", "kit-row pf1e-bio-fields");
  const fields = [
    { label: "Homeland", val: notes.homeland },
    { label: "Deity", val: notes.deity },
    { label: "Age", val: notes.age },
    { label: "Height", val: notes.height },
    { label: "Weight", val: notes.weight },
    { label: "Languages", val: Array.isArray(notes.languages) ? notes.languages.join(", ") : notes.languages }
  ];
  for (const f of fields) {
    if (f.val) {
      detailsRow.append(el("span", "kit-badge", `${f.label}: ${f.val}`));
    }
  }
  root.append(detailsRow);

  const rtWrap = el("div", "pf1e-bio-richtext-wrap");
  rtWrap.append(sheet.slots.biographyRichText);
  root.append(rtWrap);

  return root;
}
