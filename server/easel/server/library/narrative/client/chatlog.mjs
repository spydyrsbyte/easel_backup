import { Base } from "./base.mjs";
import { safeImage, element as el } from "./safe.mjs";

export default class ChatLog extends Base {
  constructor() {
    super("easel.narrative.chatlog", ["header", "footer", "card"]);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const container = el("div", "kit-chatlog-wrap kit-content");
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.height = "100%";
    container.style.minHeight = "280px";

    this.content.append(this.slots.header);

    const topBar = el("div", "kit-row kit-chatlog-topbar");
    topBar.style.justifyContent = "space-between";
    topBar.style.marginBottom = "8px";

    const filterInput = el("input", "kit-chatlog-search");
    filterInput.type = "search";
    filterInput.placeholder = "Filter chat...";
    filterInput.value = this.filter ?? p.filter ?? "";
    filterInput.style.flex = "1";
    topBar.append(filterInput);

    if (p.canClear) {
      const clearBtn = this.button("Clear", "clear", {});
      clearBtn.className = "kit-chatlog-clear";
      topBar.append(clearBtn);
    }
    container.append(topBar);

    const stream = el("div", "kit-chatlog-stream");
    stream.style.flex = "1";
    stream.style.overflow = "auto";
    stream.style.display = "flex";
    stream.style.flexDirection = "column";
    stream.style.gap = "8px";
    stream.style.padding = "4px";

    const messages = Array.isArray(p.messages) ? p.messages : [];

    for (const msg of messages) {
      const msgEl = el("div", "kit-item kit-chatlog-message");
      msgEl.dataset.messageId = msg.id || "";
      msgEl.dataset.searchText = `${msg.text || ""} ${msg.speaker?.name || ""} ${msg.card?.title || ""}`.toLowerCase();
      msgEl.style.display = "grid";
      msgEl.style.gap = "4px";

      const header = el("div", "kit-row kit-chatlog-header");
      header.style.justifyContent = "space-between";

      const spkGroup = el("div", "kit-row");
      if (msg.speaker?.image) {
        const img = el("img", "kit-image");
        img.src = safeImage(msg.speaker.image);
        img.style.width = "20px";
        img.style.height = "20px";
        img.style.borderRadius = "50%";
        spkGroup.append(img);
      }
      spkGroup.append(el("span", "kit-label", msg.speaker?.name || "Unknown"));
      header.append(spkGroup);

      const metaGroup = el("div", "kit-row");
      if (msg.whisper) {
        const toNames = Array.isArray(msg.whisper) ? msg.whisper.join(", ") : String(msg.whisper);
        const wBadge = el("span", "kit-badge", "To: " + toNames);
        wBadge.style.fontSize = "11px";
        metaGroup.append(wBadge);
      }
      if (msg.blind) {
        const bBadge = el("span", "kit-badge", "Blind");
        bBadge.style.fontSize = "11px";
        metaGroup.append(bBadge);
      }
      if (msg.timestamp) {
        const timeStr = typeof msg.timestamp === "number" ? new Date(msg.timestamp).toLocaleTimeString() : String(msg.timestamp);
        metaGroup.append(el("span", "kit-muted", timeStr));
      }
      header.append(metaGroup);
      msgEl.append(header);

      if (msg.rollMode && msg.rollMode !== "public") {
        const modeBadge = el("span", "kit-badge", msg.rollMode);
        modeBadge.style.fontSize = "11px";
        msgEl.append(modeBadge);
      }

      if (msg.text) {
        const body = el("div", "kit-chatlog-body", msg.text);
        body.style.whiteSpace = "pre-wrap";
        msgEl.append(body);
      }

      if (msg.card) {
        const cardBox = el("div", "kit-chatlog-card pf1e-attack-card");
        cardBox.style.background = "#181c23";
        cardBox.style.border = "1px solid var(--kit-border, #ffffff24)";
        cardBox.style.borderRadius = "6px";
        cardBox.style.padding = "8px";
        cardBox.style.display = "grid";
        cardBox.style.gap = "8px";

        if (Array.isArray(msg.card.attacks) && msg.card.attacks.length > 0) {
          // --- FULL RPG ATTACK CARD ---
          const header = el("div", "kit-row pf1e-card-header");
          header.style.justifyContent = "space-between";
          header.style.alignItems = "center";
          header.style.borderBottom = "1px solid rgba(255, 255, 255, 0.1)";
          header.style.paddingBottom = "4px";

          const titleCol = el("div");
          const title = el("strong", "kit-label pf1e-card-title", msg.card.title || "Attack");
          title.style.fontSize = "14px";
          title.style.color = "#d6ae65";
          titleCol.append(title);
          if (msg.card.actorName) {
            const sub = el("div", "kit-muted", msg.card.actorName);
            sub.style.fontSize = "11px";
            titleCol.append(sub);
          }
          header.append(titleCol);

          if (msg.card.mode) {
            const mBadge = el("span", "kit-badge", msg.card.mode);
            mBadge.style.fontSize = "11px";
            mBadge.style.background = "#222733";
            mBadge.style.borderColor = "rgba(214, 174, 101, 0.35)";
            mBadge.style.color = "#d6ae65";
            header.append(mBadge);
          }
          cardBox.append(header);

          // Render each attack strike
          for (const atk of msg.card.attacks) {
            const strikeBox = el("div", "pf1e-strike-box");
            strikeBox.style.display = "grid";
            strikeBox.style.gap = "6px";
            strikeBox.style.padding = "6px";
            strikeBox.style.background = "#13161c";
            strikeBox.style.borderRadius = "4px";
            strikeBox.style.border = "1px solid rgba(255, 255, 255, 0.06)";

            if (msg.card.attacks.length > 1) {
              const sTitle = el("div", "kit-label", atk.label || "Strike");
              sTitle.style.fontWeight = "bold";
              sTitle.style.fontSize = "12px";
              sTitle.style.color = "#ece8de";
              strikeBox.append(sTitle);
            }

            // Attack Section
            if (atk.attackRoll) {
              const atkRow = el("div", "kit-row");
              atkRow.style.justifyContent = "space-between";
              atkRow.style.alignItems = "center";
              atkRow.style.background = "rgba(255, 255, 255, 0.03)";
              atkRow.style.padding = "4px 8px";
              atkRow.style.borderRadius = "4px";

              const left = el("div");
              const tag = el("span", "kit-muted", "Attack: ");
              tag.style.fontSize = "11px";
              tag.style.textTransform = "uppercase";
              const formula = el("span", "kit-muted", `${atk.attackRoll.formula} [${atk.attackRoll.naturalRoll}]`);
              left.append(tag, formula);
              atkRow.append(left);

              const totalBadge = el("span", "kit-badge", String(atk.attackRoll.total));
              totalBadge.style.fontSize = "14px";
              totalBadge.style.fontWeight = "bold";
              totalBadge.style.padding = "2px 8px";

              if (atk.attackRoll.isCrit || atk.attackRoll.threatensCrit) {
                totalBadge.style.color = "#81c784";
                totalBadge.style.borderColor = "#4caf50";
                totalBadge.style.background = "rgba(76, 175, 80, 0.15)";
              } else if (atk.attackRoll.isFumble) {
                totalBadge.style.color = "#e57373";
                totalBadge.style.borderColor = "#f44336";
                totalBadge.style.background = "rgba(244, 67, 54, 0.15)";
              }
              atkRow.append(totalBadge);
              strikeBox.append(atkRow);

              // Critical Threat Notice / Confirmation
              if (atk.attackRoll.threatensCrit) {
                const critBanner = el("div", "kit-row");
                critBanner.style.justifyContent = "space-between";
                critBanner.style.padding = "3px 8px";
                critBanner.style.background = "rgba(214, 174, 101, 0.12)";
                critBanner.style.border = "1px dashed rgba(214, 174, 101, 0.4)";
                critBanner.style.borderRadius = "4px";
                critBanner.style.fontSize = "11px";

                const critTxt = el("strong", "", `★ Threatens Critical (Nat ${atk.attackRoll.naturalRoll})`);
                critTxt.style.color = "#d6ae65";
                critBanner.append(critTxt);

                if (atk.attackRoll.critConfirm) {
                  const confTxt = el("span", "", `Confirm: ${atk.attackRoll.critConfirm.total} [${atk.attackRoll.critConfirm.naturalRoll}]`);
                  confTxt.style.color = "#ece8de";
                  critBanner.append(confTxt);
                }
                strikeBox.append(critBanner);
              } else if (atk.attackRoll.isFumble) {
                const fumbBanner = el("div", "kit-row");
                fumbBanner.style.padding = "3px 8px";
                fumbBanner.style.background = "rgba(244, 67, 54, 0.12)";
                fumbBanner.style.borderRadius = "4px";
                fumbBanner.style.fontSize = "11px";
                fumbBanner.style.color = "#ff8a80";
                fumbBanner.append(el("strong", "", "⚠ Natural 1 (Automatic Miss)"));
                strikeBox.append(fumbBanner);
              }
            }

            // Damage Section
            if (atk.damageRoll) {
              const dmgRow = el("div", "kit-row");
              dmgRow.style.justifyContent = "space-between";
              dmgRow.style.alignItems = "center";
              dmgRow.style.background = "rgba(255, 255, 255, 0.03)";
              dmgRow.style.padding = "4px 8px";
              dmgRow.style.borderRadius = "4px";

              const left = el("div");
              const tag = el("span", "kit-muted", "Damage: ");
              tag.style.fontSize = "11px";
              tag.style.textTransform = "uppercase";

              const diceStr = Array.isArray(atk.damageRoll.dice)
                ? ` [${atk.damageRoll.dice.map((d) => d.value).join(", ")}]`
                : "";
              const formula = el("span", "kit-muted", `${atk.damageRoll.formula}${diceStr}`);
              left.append(tag, formula);
              dmgRow.append(left);

              const right = el("div", "kit-row");
              right.style.gap = "4px";
              if (atk.damageRoll.type) {
                const typeBadge = el("span", "kit-badge", atk.damageRoll.type);
                typeBadge.style.fontSize = "10px";
                typeBadge.style.padding = "1px 5px";
                right.append(typeBadge);
              }

              const dmgBadge = el("span", "kit-badge", String(atk.damageRoll.total));
              dmgBadge.style.fontSize = "14px";
              dmgBadge.style.fontWeight = "bold";
              dmgBadge.style.padding = "2px 8px";
              dmgBadge.style.color = "#ffb74d";
              dmgBadge.style.borderColor = "rgba(255, 183, 77, 0.4)";
              right.append(dmgBadge);
              dmgRow.append(right);
              strikeBox.append(dmgRow);

              // Extra Crit Damage if applicable
              if (atk.critDamageRoll) {
                const critDmgRow = el("div", "kit-row");
                critDmgRow.style.justifyContent = "space-between";
                critDmgRow.style.alignItems = "center";
                critDmgRow.style.padding = "3px 8px";
                critDmgRow.style.background = "rgba(214, 174, 101, 0.08)";
                critDmgRow.style.borderRadius = "4px";
                critDmgRow.style.fontSize = "11px";

                const critDiceStr = Array.isArray(atk.critDamageRoll.dice)
                  ? ` [${atk.critDamageRoll.dice.map((d) => d.value).join(", ")}]`
                  : "";
                critDmgRow.append(el("span", "kit-muted", `Crit Extra Dmg: ${atk.critDamageRoll.formula}${critDiceStr}`));

                const cBadge = el("span", "kit-badge", `+${atk.critDamageRoll.total}`);
                cBadge.style.color = "#d6ae65";
                cBadge.style.fontWeight = "bold";
                critDmgRow.append(cBadge);
                strikeBox.append(critDmgRow);
              }
            }

            // Strike Action Buttons (Apply Damage, Half, Crit)
            if (Array.isArray(atk.actions) && atk.actions.length > 0) {
              const acts = el("div", "kit-row");
              acts.style.gap = "4px";
              acts.style.marginTop = "2px";
              for (const a of atk.actions) {
                const btn = el("button", "kit-badge", a.label || a.id);
                btn.type = "button";
                btn.style.cursor = "pointer";
                btn.onclick = () => {
                  this.emit("cardAction", {
                    messageId: msg.id,
                    actionId: a.id,
                    payload: a.payload || {},
                  });
                };
                acts.append(btn);
              }
              strikeBox.append(acts);
            }

            cardBox.append(strikeBox);
          }

          // Top Level / Full Attack Summary Actions
          if (Array.isArray(msg.card.actions) && msg.card.actions.length > 0) {
            const topActs = el("div", "kit-row");
            topActs.style.gap = "6px";
            topActs.style.marginTop = "4px";
            topActs.style.paddingTop = "6px";
            topActs.style.borderTop = "1px solid rgba(255, 255, 255, 0.1)";
            for (const a of msg.card.actions) {
              const btn = el("button", "kit-badge", a.label || a.id);
              btn.type = "button";
              btn.style.cursor = "pointer";
              btn.style.fontWeight = "bold";
              btn.style.borderColor = "#d6ae65";
              btn.style.color = "#d6ae65";
              btn.onclick = () => {
                this.emit("cardAction", {
                  messageId: msg.id,
                  actionId: a.id,
                  payload: a.payload || {},
                });
              };
              topActs.append(btn);
            }
            cardBox.append(topActs);
          }
        } else {
          // --- SIMPLE FALLBACK CARD ---
          if (msg.card.title) {
            cardBox.append(el("div", "kit-label", msg.card.title));
          }
          if (msg.card.formula) {
            cardBox.append(el("div", "kit-muted", msg.card.formula));
          }
          if (msg.card.total !== undefined) {
            const tRow = el("div", "kit-row");
            tRow.style.justifyContent = "space-between";
            const tBadge = el("span", "kit-badge", "Total: " + msg.card.total);
            tBadge.style.fontWeight = "bold";
            if (msg.card.isCrit) {
              tBadge.style.color = "#81c784";
              tBadge.style.borderColor = "#4caf50";
            } else if (msg.card.isFumble) {
              tBadge.style.color = "#e57373";
              tBadge.style.borderColor = "#f44336";
            }
            tRow.append(tBadge);

            if (Array.isArray(msg.card.rolls) && msg.card.rolls.length > 0) {
              const dRow = el("div", "kit-row");
              for (const d of msg.card.rolls) {
                dRow.append(el("span", "kit-badge", String(d.value)));
              }
              tRow.append(dRow);
            }
            cardBox.append(tRow);
          }

          if (Array.isArray(msg.card.actions) && msg.card.actions.length > 0) {
            const acts = el("div", "kit-row");
            for (const a of msg.card.actions) {
              const btn = el("button", "kit-badge", a.label || a.id);
              btn.type = "button";
              btn.onclick = () => {
                this.emit("cardAction", {
                  messageId: msg.id,
                  actionId: a.id,
                  payload: a.payload || {},
                });
              };
              acts.append(btn);
            }
            cardBox.append(acts);
          }
        }
        msgEl.append(cardBox);
      }

      stream.append(msgEl);
    }

    const applyFilter = (filterVal) => {
      this.filter = filterVal;
      const q = filterVal.toLowerCase().trim();
      for (const child of stream.children) {
        if (!q) {
          child.hidden = false;
        } else {
          const text = child.dataset.searchText || "";
          child.hidden = !text.includes(q);
        }
      }
    };

    filterInput.oninput = (e) => applyFilter(e.target.value);
    applyFilter(filterInput.value);

    container.append(stream);

    const inputArea = el("div", "kit-chatlog-inputarea");
    inputArea.style.display = "flex";
    inputArea.style.gap = "6px";
    inputArea.style.alignItems = "center";
    inputArea.style.marginTop = "8px";

    const modeSelect = el("select", "kit-chatlog-rollmode");
    const modes = [
      { id: "public", label: "Public" },
      { id: "gmroll", label: "GM Roll" },
      { id: "blindroll", label: "Blind Roll" },
      { id: "selfroll", label: "Self Roll" },
    ];
    const currentMode = this.rollMode ?? p.rollMode ?? "public";
    for (const m of modes) {
      const opt = el("option", "", m.label);
      opt.value = m.id;
      if (m.id === currentMode) opt.selected = true;
      modeSelect.append(opt);
    }
    modeSelect.onchange = (e) => {
      this.rollMode = e.target.value;
      this.emit("rollModeChanged", { rollMode: e.target.value });
    };
    inputArea.append(modeSelect);

    const chatInput = el("input", "kit-chatlog-text");
    chatInput.type = "text";
    chatInput.placeholder = "Say something or /r 1d20...";
    chatInput.style.flex = "1";

    const doSend = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = "";
      this.emit("sendMessage", {
        text,
        rollMode: modeSelect.value || currentMode,
      });
    };

    chatInput.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doSend();
      }
    };
    inputArea.append(chatInput);

    const sendBtn = el("button", "kit-chatlog-send", "Send");
    sendBtn.type = "button";
    sendBtn.onclick = () => doSend();
    inputArea.append(sendBtn);

    container.append(inputArea);
    this.content.append(container);
    this.content.append(this.slots.footer);
    this.content.append(this.slots.card);
  }
}
