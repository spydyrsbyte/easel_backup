import test from "node:test";
import assert from "node:assert/strict";
import SceneBinder from "../server/easel/modules/vtt/client/scenebinder.mjs";
import ChatBinder from "../server/easel/modules/vtt/client/chatbinder.mjs";
import CombatBinder from "../server/easel/modules/vtt/client/combatbinder.mjs";

class Component {
  constructor(props = {}) { this.props = props; this.listeners = new Map(); this.updates = 0; }
  on(name, fn) {
    const list = this.listeners.get(name) || new Set();
    list.add(fn);
    this.listeners.set(name, list);
    return () => list.delete(fn);
  }
  emit(name, value) { for (const fn of this.listeners.get(name) || []) fn(value); }
  setProps(props) { this.props = { ...this.props, ...structuredClone(props) }; this.updates++; }
}

test("scene binding preserves the camera during interactions and uses saved scene dimensions", () => {
  const map = new Component();
  const sent = [];
  const binder = new SceneBinder().bind({ map, send: (name, payload) => sent.push({ name, payload }) });
  const scene = { id: "scene", name: "Dungeon", map: { size: { width: 800, height: 600 }, layers: [{ id: "ground", type: "ground", grid: { cellSize: 64 } }] }, tokens: [{ id: "hero", groundId: "ground", canControl: true }] };
  const state = { activeScene: scene, isGM: true };
  binder.update(state);
  const updates = map.updates;
  map.emit("cameraChanged", { camera: { x: 50, y: 25, zoom: 2, rotation: 45 } });
  assert.equal(map.updates, updates);
  binder.update(structuredClone(state));
  assert.equal(map.updates, updates);
  map.emit("tokenSelect", { tokenId: "hero" });
  map.emit("tokenMoveRequest", { tokenId: "hero", groundId: "ground", to: { x: 200, y: 150 } });
  assert.deepEqual(sent[0], { name: "tokenMove", payload: { tokenId: "hero", groundId: "ground", x: 200, y: 150 } });
  binder.update({ ...state, activeScene: { ...scene, tokens: [{ ...scene.tokens[0], x: 200 }] } });
  assert.deepEqual(map.props.camera, { x: 50, y: 25, zoom: 2, rotation: 45 });
  assert.equal(map.props.width, 800);
  binder.update({ ...state, activeScene: { ...scene, id: "other" } });
  assert.deepEqual(map.props.camera, { x: 0, y: 0, zoom: 1, rotation: 0 });
  assert.equal(binder.selectedToken(), null);
  binder.destroy();
  map.emit("tokenMoveRequest", { tokenId: "hero", to: { x: 0, y: 0 } });
  assert.equal(sent.length, 1);
});

test("chat binding hides a roll until its dice settle and never animates concealed cards", () => {
  const chatlog = new Component();
  const dicebox = new Component({ enabled: true });
  const binder = new ChatBinder().bind({ chatlog, dicebox, send: () => {} });
  binder.update({ diceSettings: {}, messages: [{ id: "old", card: { content: { title: "Old" }, dicePayload: { id: "old-roll", dice: [{ sides: 6, value: 1 }] } } }] });
  assert.equal(dicebox.props.rolls, undefined);
  const roll = { id: "new", card: { content: { title: "New" }, dicePayload: { id: "new-roll", dice: [{ sides: 20, value: 12 }] } } };
  const hidden = { id: "blind", concealed: true, rollMode: "blind", card: {} };
  const state = { diceSettings: {}, messages: [roll, hidden, { id: "text", text: "Hello", card: {} }] };
  binder.update(state);
  assert.equal(chatlog.props.messages.some((message) => message.id === "new"), false);
  assert.equal(chatlog.props.messages[0].text, "Blind roll");
  assert.equal(chatlog.props.messages.find((message) => message.id === "text").card, undefined);
  assert.deepEqual(dicebox.props.rolls.map((roll) => roll.id), ["new-roll"]);
  dicebox.emit("settled", { rollId: "new-roll" });
  assert.equal(chatlog.props.messages.find((message) => message.id === "new").card.title, "New");
  const updates = chatlog.updates;
  binder.update(state);
  assert.equal(chatlog.updates, updates);
});

test("combat binding offers initiative to a controller and never offers them GM turn controls", () => {
  const tracker = new Component();
  const sent = [];
  const binder = new CombatBinder().bind({ tracker, send: (name, payload) => sent.push({ name, payload }) });
  const state = { isGM: false, combat: { id: "combat", round: 1, currentId: "fighter", combatants: [{ id: "fighter", name: "Fighter", canControl: true }] } };
  binder.update(state);
  tracker.emit("select", { id: "fighter" });
  assert.deepEqual(tracker.props.actions.map((action) => action.id), ["initiative"]);
  tracker.emit("request", { action: "initiative" });
  assert.deepEqual(sent[0], { name: "combatantRollInitiative", payload: { combatantId: "fighter" } });
  const updates = tracker.updates;
  binder.update(structuredClone(state));
  assert.equal(tracker.updates, updates);
  binder.update({ ...state, combat: { ...state.combat, combatants: [{ ...state.combat.combatants[0], canControl: false }] } });
  assert.deepEqual(tracker.props.actions, []);
});
