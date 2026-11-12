import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

function parseInlineTokens(rawText, onEnricher) {
  const container = document.createDocumentFragment();
  const tokenRegex = /(\[\[(?:\/r\s*)?([^\]]+)\]\])|(@([a-zA-Z0-9_]+)\[([^\]]+)\](?:\{([^}]+)\})?)|(\*\*\*([^*]+)\*\*\*)|(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]+)\))/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(rawText)) !== null) {
    if (match.index > lastIndex) {
      container.append(document.createTextNode(rawText.slice(lastIndex, match.index)));
    }

    if (match[1]) {
      const fullRoll = match[2].trim();
      let formula = fullRoll;
      let label = fullRoll;
      if (fullRoll.includes("#")) {
        const parts = fullRoll.split("#");
        formula = parts[0].trim();
        label = parts.slice(1).join("#").trim() || formula;
      }
      const btn = el("button", "kit-enricher kit-enricher-roll", "🎲 " + label);
      btn.type = "button";
      btn.onclick = () => onEnricher({ kind: "roll", target: "", formula, label });
      container.append(btn);
    } else if (match[3]) {
      const kind = match[4].toLowerCase();
      const target = match[5];
      const label = match[6] || target;
      const btn = el("button", "kit-enricher kit-enricher-" + kind, label);
      btn.type = "button";
      btn.onclick = () => onEnricher({ kind, target, formula: "", label });
      container.append(btn);
    } else if (match[7]) {
      const strongEm = el("strong");
      const em = el("em", "", match[8]);
      strongEm.append(em);
      container.append(strongEm);
    } else if (match[9]) {
      const strong = el("strong", "", match[10]);
      container.append(strong);
    } else if (match[11]) {
      const em = el("em", "", match[12]);
      container.append(em);
    } else if (match[13]) {
      const code = el("code", "", match[14]);
      container.append(code);
    } else if (match[15]) {
      const link = el("a", "kit-link", match[16]);
      link.href = match[17];
      link.target = "_blank";
      link.rel = "noreferrer noopener";
      container.append(link);
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < rawText.length) {
    container.append(document.createTextNode(rawText.slice(lastIndex)));
  }

  return container;
}

export default class RichText extends Base {
  constructor() {
    super("easel.narrative.richtext", ["header", "footer"]);
    this.showingUnidentified = false;
  }

  update(p) {
    this.begin({ ...p, title: "" });
    this.content.append(this.slots.header);

    const docWrap = el("div", "kit-richtext-wrap kit-content");
    const onEnricher = (payload) => {
      this.emit("enricherActivate", payload);
      this.emit("enricherClick", payload);
    };

    const bodyEl = el("div", "kit-richtext-body");

    const renderMarkdown = (sourceText) => {
      bodyEl.replaceChildren();
      const lines = sourceText.split("\n");
      let currentList = null;
      let listType = null;

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) {
          currentList = null;
          listType = null;
          continue;
        }

        if (line === "---" || line === "***") {
          currentList = null;
          listType = null;
          bodyEl.append(el("hr"));
        } else if (line.startsWith("### ")) {
          currentList = null;
          listType = null;
          const h3 = el("h4");
          h3.append(parseInlineTokens(line.slice(4), onEnricher));
          bodyEl.append(h3);
        } else if (line.startsWith("## ")) {
          currentList = null;
          listType = null;
          const h2 = el("h3");
          h2.append(parseInlineTokens(line.slice(3), onEnricher));
          bodyEl.append(h2);
        } else if (line.startsWith("# ")) {
          currentList = null;
          listType = null;
          const h1 = el("h2");
          h1.append(parseInlineTokens(line.slice(2), onEnricher));
          bodyEl.append(h1);
        } else if (line.startsWith("> ")) {
          currentList = null;
          listType = null;
          const bq = el("blockquote", "kit-item");
          bq.style.borderLeft = "3px solid var(--kit-accent, #d6ae65)";
          bq.style.margin = "4px 0";
          bq.style.padding = "4px 8px";
          bq.append(parseInlineTokens(line.slice(2), onEnricher));
          bodyEl.append(bq);
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          if (!currentList || listType !== "ul") {
            currentList = el("ul", "kit-list");
            listType = "ul";
            bodyEl.append(currentList);
          }
          const li = el("li");
          li.append(parseInlineTokens(line.slice(2), onEnricher));
          currentList.append(li);
        } else if (/^\d+\.\s/.test(line)) {
          if (!currentList || listType !== "ol") {
            currentList = el("ol", "kit-list");
            listType = "ol";
            bodyEl.append(currentList);
          }
          const content = line.replace(/^\d+\.\s/, "");
          const li = el("li");
          li.append(parseInlineTokens(content, onEnricher));
          currentList.append(li);
        } else {
          currentList = null;
          listType = null;
          const pEl = el("p");
          pEl.append(parseInlineTokens(line, onEnricher));
          bodyEl.append(pEl);
        }
      }
    };

    if (p.isGM && p.unidentifiedText) {
      const gmControls = el("div", "kit-row kit-richtext-gmcontrols");
      const toggleUnidBtn = el(
        "button",
        "kit-badge",
        this.showingUnidentified ? "View Identified (GM)" : "View Unidentified (Players)",
      );
      toggleUnidBtn.onclick = () => {
        this.showingUnidentified = !this.showingUnidentified;
        toggleUnidBtn.textContent = this.showingUnidentified ? "View Identified (GM)" : "View Unidentified (Players)";
        const activeText = this.showingUnidentified ? p.unidentifiedText : (p.text || "");
        renderMarkdown(activeText);
      };
      gmControls.append(toggleUnidBtn);
      docWrap.append(gmControls);
    }

    const initialText =
      (this.showingUnidentified || p.showUnidentified) && p.unidentifiedText
        ? p.unidentifiedText
        : p.text || "";

    if (p.editable) {
      const editArea = el("div", "kit-richtext-editor");
      const textarea = el("textarea");
      textarea.value = initialText;
      textarea.rows = 8;
      textarea.style.width = "100%";
      textarea.oninput = (e) => {
        renderMarkdown(e.target.value);
        this.emit("change", { text: e.target.value });
      };
      editArea.append(textarea);
      docWrap.append(editArea);
    }

    renderMarkdown(initialText);
    docWrap.append(bodyEl);
    this.content.append(docWrap);
    this.content.append(this.slots.footer);
  }
}
