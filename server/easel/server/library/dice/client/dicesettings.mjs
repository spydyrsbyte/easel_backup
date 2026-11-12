import { Base } from "./base.mjs";
import { element as el } from "./safe.mjs";

export default class DiceSettings extends Base {
  constructor() {
    super("easel.dice.dicesettings", ["preview"]);
  }

  update(p) {
    this.begin({ ...p, title: "" });
    const form = el("div", "kit-dicesettings-form kit-content");
    const current = {
      theme: p.theme || "standard",
      material: p.material || "plastic",
      colors: Object.assign(
        { diceColor: "#d6ae65", labelColor: "#ffffff", outlineColor: "#000000" },
        p.colors || {},
      ),
      sound: p.sound !== false,
      volume: typeof p.volume === "number" ? p.volume : 0.8,
      surface: p.surface || "felt",
      quality: p.quality || "high",
      speed: typeof p.speed === "number" ? p.speed : 1,
    };

    const emitChange = () => {
      this.emit("change", { settings: { ...current } });
    };

    const themeRow = el("div", "kit-field");
    themeRow.append(el("label", "kit-label", "Theme"));
    const themeSelect = el("select");
    for (const t of ["standard", "metallic", "translucent", "wooden", "gemstone"]) {
      const opt = el("option", "", t);
      opt.value = t;
      if (t === current.theme) opt.selected = true;
      themeSelect.append(opt);
    }
    themeSelect.onchange = (e) => {
      current.theme = e.target.value;
      emitChange();
    };
    themeRow.append(themeSelect);
    form.append(themeRow);

    const matRow = el("div", "kit-field");
    matRow.append(el("label", "kit-label", "Material"));
    const matSelect = el("select");
    for (const m of ["plastic", "metal", "wood", "glass", "iridescent"]) {
      const opt = el("option", "", m);
      opt.value = m;
      if (m === current.material) opt.selected = true;
      matSelect.append(opt);
    }
    matSelect.onchange = (e) => {
      current.material = e.target.value;
      emitChange();
    };
    matRow.append(matSelect);
    form.append(matRow);

    const surfRow = el("div", "kit-field");
    surfRow.append(el("label", "kit-label", "Surface SFX"));
    const surfSelect = el("select");
    for (const s of ["felt", "wood", "metal", "stone"]) {
      const opt = el("option", "", s);
      opt.value = s;
      if (s === current.surface) opt.selected = true;
      surfSelect.append(opt);
    }
    surfSelect.onchange = (e) => {
      current.surface = e.target.value;
      emitChange();
    };
    surfRow.append(surfSelect);
    form.append(surfRow);

    const colorRow = el("div", "kit-field");
    colorRow.append(el("label", "kit-label", "Dice Color"));
    const colorInput = el("input");
    colorInput.type = "color";
    colorInput.value = current.colors.diceColor || "#d6ae65";
    colorInput.onchange = (e) => {
      current.colors.diceColor = e.target.value;
      emitChange();
    };
    colorRow.append(colorInput);
    form.append(colorRow);

    const soundRow = el("div", "kit-field");
    soundRow.append(el("label", "kit-label", "SFX Sound"));
    const soundInput = el("input");
    soundInput.type = "checkbox";
    soundInput.checked = current.sound;
    soundInput.onchange = (e) => {
      current.sound = e.target.checked;
      emitChange();
    };
    soundRow.append(soundInput);
    form.append(soundRow);

    const volRow = el("div", "kit-field");
    volRow.append(el("label", "kit-label", "SFX Volume"));
    const volInput = el("input");
    volInput.type = "number";
    volInput.min = "0";
    volInput.max = "1";
    volInput.step = "0.1";
    volInput.value = String(current.volume);
    volInput.onchange = (e) => {
      current.volume = Number(e.target.value);
      emitChange();
    };
    volRow.append(volInput);
    form.append(volRow);

    const speedRow = el("div", "kit-field");
    speedRow.append(el("label", "kit-label", "Animation Speed"));
    const speedInput = el("input");
    speedInput.type = "number";
    speedInput.min = "0.5";
    speedInput.max = "3";
    speedInput.step = "0.5";
    speedInput.value = String(current.speed);
    speedInput.onchange = (e) => {
      current.speed = Number(e.target.value);
      emitChange();
    };
    speedRow.append(speedInput);
    form.append(speedRow);

    const actionsRow = el("div", "kit-row");
    const testBtn = this.button("Test Roll", "testRoll", { notation: "1d20" });
    actionsRow.append(testBtn);
    form.append(actionsRow);

    this.content.append(form);
    this.content.append(this.slots.preview);
  }
}
