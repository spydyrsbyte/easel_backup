import { element as el } from "../safe.mjs";

export function renderNotesTab(sheet, p) {
  const root = el("div", "pf1e-tab-notes kit-content");
  const isGM = !!p.isGM;

  const playerNotesSec = el("div", "pf1e-player-notes-section kit-content");
  playerNotesSec.append(el("h4", "kit-label", "Player Notes"));
  playerNotesSec.append(sheet.slots.notesRichText);
  root.append(playerNotesSec);

  const contextNotes = Array.isArray(p.actor?.contextNotes)
    ? p.actor.contextNotes
    : (Array.isArray(p.contextNotes) ? p.contextNotes : []);
  if (contextNotes.length > 0) {
    const cnSec = el("div", "pf1e-context-notes-summary kit-content");
    cnSec.append(el("h4", "kit-label", "Context Notes Summary"));
    const cnList = el("div", "kit-list pf1e-context-notes-list");
    for (const cn of contextNotes) {
      const row = el("div", "kit-item kit-row");
      row.append(el("strong", "kit-badge", cn.target || "all"));
      row.append(el("span", "kit-label", cn.text || ""));
      cnList.append(row);
    }
    cnSec.append(cnList);
    root.append(cnSec);
  }

  if (isGM) {
    const gmNotesSec = el("div", "pf1e-gm-notes-section kit-content");
    gmNotesSec.append(el("h4", "kit-label", "GM Notes (Secret)"));
    gmNotesSec.append(sheet.slots.gmNotesRichText);
    root.append(gmNotesSec);
  }

  return root;
}
