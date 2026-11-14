const list = (value) => (Array.isArray(value) ? value : []);

function maneuvers(section, api) {
  const { h, button, iconButton, doc, derived, state } = api;
  const info = derived.initiating;
  if (!info) return null;
  const known = list((doc.lists || {}).maneuver);
  const stances = known.filter((entry) => entry.type === "stance");
  const readied = known.filter((entry) => entry.type !== "stance" && entry.readied);
  const others = known.filter((entry) => entry.type !== "stance" && !entry.readied);
  const node = h("div", { class: "pow", style: { display: "grid", gap: "16px" } });
  const part = (heading, ...children) => {
    const block = api.block(heading, ...children);
    block.classList.add("pow-part");
    return block;
  };

  node.append(
    h(
      "div",
      { class: "pf-tiles" },
      api.tile("Initiator level", String(info.level), "maneuvers to level " + info.highest),
      api.tile("Maneuver DC", String(info.dc), "plus the maneuver's level"),
      api.tile("Readied", info.count.readied + " / " + info.readied, info.count.expended ? info.count.expended + " expended" : "none expended"),
      api.tile("Known", info.count.known + " / " + info.known, ""),
      api.tile("Stances", info.count.stances + " / " + info.stances, ""),
    ),
  );

  if (api.canControl)
    node.append(
      part(
        "Recover maneuvers",
        h(
          "div",
          { class: "pf-actions" },
          button("Recover one", { kind: "small", title: "A standard action recovers one expended maneuver", onClick: () => api.act("pow.recover", { count: "one" }) }),
          button("Full-round recovery (" + Math.max(2, info.mod) + ")", { kind: "small", title: "The class's recovery method", onClick: () => api.act("pow.recover", { count: "focus" }) }),
          button("Encounter over", { kind: "small ez-btn-ghost", title: "Every expended maneuver returns", onClick: () => api.act("pow.recover", { count: "all" }) }),
        ),
        ...info.recovery.map((text) => h("p", { class: "pf-text", text })),
      ),
    );

  const chips = h("div", { class: "pf-chips" });
  for (const entry of stances) {
    const on = !!doc.toggles[entry.toggle];
    const chip = api.chip(entry.name, on, () => api.act("pow.stance", { uid: on ? "" : entry.uid }));
    chip.title = entry.text || "";
    chips.append(chip);
  }
  if (!stances.length) chips.append(api.empty("No stances known yet."));
  node.append(part("Stance", chips, stances.some((entry) => doc.toggles[entry.toggle]) ? h("p", { class: "pf-text", text: (stances.find((entry) => doc.toggles[entry.toggle]) || {}).text || "" }) : null));

  const attacks = list(derived.attacks);
  if (!attacks.some((attack) => attack.id === state.attack)) state.attack = attacks.length ? attacks[0].id : "";
  const weapon = h("select", { "aria-label": "Weapon for strikes", dataset: { path: "@pow-weapon" } });
  for (const attack of attacks) weapon.append(h("option", { value: attack.id, selected: attack.id === state.attack, text: attack.name.replace(/^./, (letter) => letter.toUpperCase()) }));
  weapon.addEventListener("change", () => {
    state.attack = weapon.value;
  });

  const row = (entry, ...actions) => {
    const name = h("button", { type: "button", class: "pf-link", text: entry.name });
    name.addEventListener("click", () => entry.entryId && api.view(entry.entryId));
    return h(
      "div",
      { class: "ez-row pf-feature", dataset: { maneuver: entry.uid, expended: String(!!entry.expended) } },
      h("div", { class: "ez-row-main" }, name, h("span", { class: "pf-muted", text: " " + [entry.discipline, entry.type, "level " + entry.level].join(" · ") }), h("p", { class: "pf-text", text: entry.text || "" })),
      ...actions,
    );
  };

  const ready = h("div", { class: "ez-rows" });
  for (const entry of readied) {
    const actions = [];
    if (entry.expended) {
      actions.push(h("span", { class: "ez-chip ez-chip-danger", text: "Expended" }));
      if (api.canControl) actions.push(button("Recover", { kind: "small", onClick: () => api.act("pow.recover", { count: "one", uid: entry.uid }) }));
    } else if (api.canControl) actions.push(button("Initiate", { kind: "small ez-btn-primary", onClick: () => api.roll("maneuver", entry.uid, { attack: state.attack }) }));
    if (api.canControl) actions.push(iconButton("minus", "Unready " + entry.name, () => api.act("pow.ready", { uid: entry.uid, on: false })));
    ready.append(row(entry, ...actions));
  }
  if (!readied.length) ready.append(api.empty("Nothing readied. Ready maneuvers from the list below."));
  node.append(part("Readied maneuvers", attacks.length ? h("label", { style: { display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" } }, h("span", { class: "pf-muted", text: "Strikes use" }), weapon) : null, ready));

  const rest = h("div", { class: "ez-rows" });
  for (const entry of others) {
    const actions = [];
    if (api.canControl) actions.push(button("Ready", { kind: "small", onClick: () => api.act("pow.ready", { uid: entry.uid, on: true }) }));
    if (api.canWrite) actions.push(iconButton("trash", "Forget " + entry.name, () => api.remove("list:maneuver", entry.uid)));
    rest.append(row(entry, ...actions));
  }
  for (const entry of stances) rest.append(row(entry, h("span", { class: "ez-chip", text: "Stance" }), api.canWrite ? iconButton("trash", "Forget " + entry.name, () => api.remove("list:maneuver", entry.uid)) : null));
  if (!others.length && !stances.length) rest.append(api.empty("No other maneuvers known."));
  const known_ = part("Known maneuvers and stances", rest);
  if (api.canWrite) known_.append(h("div", { class: "pf-actions" }, button("Learn a maneuver or stance", { kind: "small ez-btn-primary", iconName: "plus", onClick: () => api.request("add", { kind: "maneuver" }) }), h("span", { class: "pf-muted", text: "Disciplines: " + info.disciplines.join(", ") })));
  node.append(known_);
  return node;
}

export default class PathOfWarSections {
  sections() {
    return { "pathofwar.maneuvers": maneuvers };
  }
}
