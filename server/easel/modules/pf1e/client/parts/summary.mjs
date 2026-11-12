import { element as el, safeImage } from "../safe.mjs";

export function renderSummaryHeader(sheet, p) {
  const actor = p.actor || {};
  const derived = p.derived || {};

  const header = el("div", "pf1e-summary-header kit-row");
  const portraitWrap = el("div", "pf1e-portrait-wrap");
  const portraitSrc = safeImage(actor.portrait) || safeImage(actor.tokenImage) || "";
  if (portraitSrc) {
    const portrait = el("img", "pf1e-portrait kit-image");
    portrait.src = portraitSrc;
    portrait.alt = actor.name || "Actor";
    portrait.onerror = () => {
      portrait.style.display = "none";
      const fallback = el("div", "pf1e-portrait-placeholder");
      fallback.textContent = (actor.name || "A").charAt(0).toUpperCase();
      portraitWrap.append(fallback);
    };
    portraitWrap.append(portrait);
  } else {
    const placeholder = el("div", "pf1e-portrait-placeholder");
    placeholder.textContent = (actor.name || "A").charAt(0).toUpperCase();
    portraitWrap.append(placeholder);
  }
  header.append(portraitWrap);

  const meta = el("div", "pf1e-summary-meta kit-content");
  const titleRow = el("div", "kit-row");
  const nameEl = el("h2", "pf1e-actor-name", actor.name || "Unnamed Character");
  titleRow.append(nameEl);
  if (p.canEdit) {
    const nameInput = el("input", "pf1e-name-input");
    nameInput.setAttribute("aria-label", "Character name");
    nameInput.value = actor.name || "";
    nameInput.onchange = () => sheet.emit("updateActor", { changes: { name: nameInput.value } });
    nameEl.replaceWith(nameInput);
  }

  const align = String(actor.alignment || "N").toUpperCase();
  titleRow.append(el("span", "kit-badge pf1e-alignment", align));

  if (p.race?.id) {
    const raceBtn = el("button", "kit-button pf1e-race-link", p.race.name || "Race");
    raceBtn.type = "button";
    raceBtn.onclick = () => sheet.emit("editRecord", { recordType: "Race", recordId: p.race.id });
    titleRow.append(raceBtn);
  }
  meta.append(titleRow);

  const classLevels = Array.isArray(p.classes) ? p.classes : [];
  let classSummary = "Level 1";
  if (classLevels.length > 0) {
    const grouped = {};
    for (const cl of classLevels) {
      const cName = cl.name || cl.className || "Class";
      grouped[cName] = (grouped[cName] || 0) + (Number(cl.classLevel) || 1);
    }
    classSummary = Object.entries(grouped)
      .map(([k, v]) => `${k} ${v}`)
      .join(" / ");
  }
  const classEl = el("div", "pf1e-classes-summary", classSummary);
  meta.append(classEl);

  const xp = Number(actor.xp ?? 0);
  const xpRow = el("div", "pf1e-xp-row kit-row");
  xpRow.append(el("span", "kit-label", "XP: " + xp));
  const xpBar = el("div", "kit-progress pf1e-xp-bar");
  const xpFill = el("span");
  xpFill.style.width = Math.min(100, Math.max(0, (xp % 5000) / 50)) + "%";
  xpBar.append(xpFill);
  xpRow.append(xpBar);
  meta.append(xpRow);

  const restBtn = el("button", "kit-button pf1e-btn-rest", "Rest");
  restBtn.type = "button";
  restBtn.disabled = p.canEdit === false;
  restBtn.onclick = (e) => {
    sheet.emit("rest", { actorId: actor.id || "", isFullBedrest: e.shiftKey });
  };
  meta.append(restBtn);

  header.append(meta);
  return header;
}

export function renderSummaryTab(sheet, p) {
  const root = el("div", "pf1e-tab-summary kit-content");
  const actor = p.actor || {};
  const derived = p.derived || {};
  const speedsRow = el("div", "pf1e-speeds kit-row");
  const speeds = derived.speed || actor.speeds || { land: 30 };
  for (const [k, v] of Object.entries(speeds)) {
    if (v && Number(v) > 0) {
      speedsRow.append(el("span", "kit-badge pf1e-speed-badge", `${k.toUpperCase()}: ${v} ft.`));
    }
  }
  root.append(speedsRow);

  const vitRow = el("div", "pf1e-vitality-container kit-row");
  sheet.slots.summaryVitality.style.flex = "1";
  vitRow.append(sheet.slots.summaryVitality);

  const defRow = el("div", "pf1e-defenses-container kit-row");
  sheet.slots.summaryDefenses.style.flex = "1";
  defRow.append(sheet.slots.summaryDefenses);

  root.append(vitRow);
  root.append(defRow);

  const initRow = el("div", "pf1e-initiative-row kit-row");
  const initBonus = derived.initiative ?? derived.abilities?.dex?.mod ?? 0;
  const initSign = initBonus >= 0 ? "+" + initBonus : String(initBonus);
  const initBtn = el("button", "kit-button pf1e-btn-init", `Roll Initiative (${initSign})`);
  initBtn.type = "button";
  initBtn.disabled = p.canControl === false;
  initBtn.onclick = () => {
    sheet.emit("rollInitiative", { actorId: actor.id || "" });
  };
  initRow.append(initBtn);
  root.append(initRow);

  const quickActionsWrap = el("div", "pf1e-quick-actions kit-content");
  quickActionsWrap.append(el("h4", "kit-label", "Quick Actions"));
  const qaList = el("div", "kit-row pf1e-qa-list");
  const actions = Array.isArray(p.actions) ? p.actions : [];
  for (const act of actions.slice(0, 6)) {
    const actBtn = el("button", "kit-button pf1e-qa-btn", act.name || "Action");
    actBtn.type = "button";
    actBtn.onclick = (e) => {
      if (e.shiftKey) {
        sheet.emit("useAction", { actionId: act.id, mode: "fast", take: 0, conditionalModifiers: [], actionData: act });
      } else {
        sheet.emit("useAction", { actionId: act.id, mode: "normal", take: 0, conditionalModifiers: [], actionData: act });
      }
    };
    qaList.append(actBtn);
  }
  quickActionsWrap.append(qaList);
  root.append(quickActionsWrap);

  return root;
}
