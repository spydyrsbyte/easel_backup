import { Base } from "./base.mjs";
import { safeImage, element as el } from "./safe.mjs";

export default class RollCard extends Base {
  constructor() {
    super("easel.dice.rollcard", ["breakdown", "actions"]);
  }

  update(p) {
    this.begin(p);
    const card = el("div", "kit-rollcard");
    card.style.background = "var(--kit-surface, #20242b)";
    card.style.border = "1px solid var(--kit-border, #ffffff24)";
    card.style.borderRadius = "8px";
    card.style.padding = "10px";
    card.style.display = "grid";
    card.style.gap = "8px";

    if (p.speaker && (p.speaker.name || p.speaker.image)) {
      const spk = el("div", "kit-row kit-rollcard-speaker");
      if (p.speaker.image) {
        const img = el("img", "kit-image");
        img.src = safeImage(p.speaker.image);
        img.style.width = "28px";
        img.style.height = "28px";
        img.style.borderRadius = "50%";
        img.style.objectFit = "cover";
        spk.append(img);
      }
      if (p.speaker.name) {
        spk.append(el("span", "kit-label", p.speaker.name));
      }
      card.append(spk);
    }

    if (p.title) {
      card.append(el("h4", "kit-rollcard-title", p.title));
    }

    if (p.formula) {
      card.append(el("div", "kit-muted kit-rollcard-formula", p.formula));
    }

    const totalRow = el("div", "kit-row kit-rollcard-result");
    totalRow.style.justifyContent = "space-between";

    const totalBadge = el("div", "kit-badge kit-rollcard-total", String(p.total ?? 0));
    totalBadge.style.fontSize = "18px";
    totalBadge.style.fontWeight = "bold";
    totalBadge.style.padding = "6px 14px";
    if (p.isCrit) {
      totalBadge.style.borderColor = "#4caf50";
      totalBadge.style.boxShadow = "0 0 8px #4caf5088";
      totalBadge.style.color = "#81c784";
    } else if (p.isFumble) {
      totalBadge.style.borderColor = "#f44336";
      totalBadge.style.boxShadow = "0 0 8px #f4433688";
      totalBadge.style.color = "#e57373";
    }
    totalRow.append(totalBadge);

    if (Array.isArray(p.rolls) && p.rolls.length > 0) {
      const diceRow = el("div", "kit-row kit-rollcard-dice");
      for (const d of p.rolls) {
        const dieBadge = el("span", "kit-badge", String(d.value));
        dieBadge.style.fontSize = "12px";
        if (d.discarded) dieBadge.style.opacity = "0.4";
        if (d.crit) dieBadge.style.color = "#81c784";
        if (d.fumble) dieBadge.style.color = "#e57373";
        diceRow.append(dieBadge);
      }
      totalRow.append(diceRow);
    }
    card.append(totalRow);

    const isCollapsed = p.collapsed === true;
    const toggleBtn = this.button(
      isCollapsed ? "Show Modifiers" : "Hide Modifiers",
      "toggle",
      { collapsed: !isCollapsed },
    );
    toggleBtn.className = "kit-rollcard-toggle";
    card.append(toggleBtn);

    if (!isCollapsed) {
      const breakdownEl = el("div", "kit-rollcard-breakdown");
      if (Array.isArray(p.breakdown) && p.breakdown.length > 0) {
        const list = el("ul", "kit-list");
        for (const item of p.breakdown) {
          const li = el("li", "kit-item kit-row");
          li.style.justifyContent = "space-between";
          li.append(el("span", "kit-label", item.label || item.type || "Modifier"));
          const sign = (item.value >= 0 ? "+" : "");
          li.append(el("span", "kit-muted", sign + item.value));
          list.append(li);
        }
        breakdownEl.append(list);
      }
      breakdownEl.append(this.slots.breakdown);
      card.append(breakdownEl);
    }

    if (Array.isArray(p.actions) && p.actions.length > 0) {
      const actRow = el("div", "kit-row kit-rollcard-actions");
      for (const act of p.actions) {
        const actBtn = el("button", "kit-badge", act.label || act.id);
        actBtn.type = "button";
        actBtn.onclick = () => {
          this.emit("action", { id: act.id, payload: act.payload || {} });
        };
        actRow.append(actBtn);
      }
      card.append(actRow);
    }

    card.append(this.slots.actions);
    this.content.append(card);
  }
}
