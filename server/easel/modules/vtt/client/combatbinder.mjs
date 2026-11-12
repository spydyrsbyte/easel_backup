import Binding from "./binding.mjs";

export default class CombatBinder extends Binding {
  bind(options) {
    this.configure(options);
    this.renderSignature = undefined;
    this.listen(this.tracker, "select", ({ id }) => { this.selectedId = id; this.render(); });
    this.listen(this.tracker, "request", ({ action }) => this.request(action));
    return this;
  }

  update(state) {
    this.state = state;
    if (!state.combat?.combatants.some((entry) => entry.id === this.selectedId)) this.selectedId = "";
    this.render();
  }

  render() {
    if (!this.state) return;
    const { combat, isGM } = this.state;
    const selected = combat?.combatants.find((entry) => entry.id === this.selectedId);
    const actions = [];
    if (!combat && isGM && this.state.activeScene) actions.push({ id: "start", label: "Create Encounter" });
    if (combat && isGM) actions.push(
      { id: "add", label: "Add Selected Token" },
      { id: "next", label: combat.started ? "Next Turn" : "Begin Combat" },
      ...(combat.started ? [{ id: "previous", label: "Previous Turn" }] : []),
      ...(selected ? [{ id: "defeated", label: selected.defeated ? "Mark Active" : "Mark Defeated" }, { id: "remove", label: "Remove Combatant" }] : []),
      { id: "end", label: "End Encounter" },
    );
    if (selected && (isGM || selected.canControl)) actions.push({ id: "initiative", label: "Roll Initiative" });
    const props = {
      title: combat ? "Round " + combat.round : "No encounter",
      active: combat?.currentId ?? "",
      selected: this.selectedId ? [this.selectedId] : [],
      items: combat?.combatants.map((entry) => ({ ...entry, value: entry.hasInitiative ? entry.initiative : "Not rolled", description: entry.defeated ? "Defeated" : "" })) ?? [],
      actions,
    };
    const signature = JSON.stringify(props);
    if (signature === this.renderSignature) return;
    this.renderSignature = signature;
    this.tracker.setProps(props);
  }

  request(action) {
    const combat = this.state?.combat;
    const selected = combat?.combatants.find((entry) => entry.id === this.selectedId);
    if (action === "start") return this.send("combatStart", { sceneId: this.state.activeScene.id });
    if (!combat) return;
    if (action === "add") {
      const token = this.selectedToken?.();
      if (!token) return this.onError?.("Select a token on the map first.");
      return this.send("combatantAdd", { combatId: combat.id, tokenId: token.id });
    }
    const events = { next: "combatNext", previous: "combatPrevious", end: "combatEnd" };
    if (events[action]) return this.send(events[action], { combatId: combat.id });
    if (!selected) return;
    if (action === "initiative") this.send("combatantRollInitiative", { combatantId: selected.id });
    if (action === "remove") this.send("combatantRemove", { combatantId: selected.id });
    if (action === "defeated") this.send("combatantDefeated", { combatantId: selected.id, defeated: !selected.defeated });
  }
}
