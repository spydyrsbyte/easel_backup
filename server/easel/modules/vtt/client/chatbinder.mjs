import Binding from "./binding.mjs";

const mode = (value) => ({ gmroll: "gm", blindroll: "blind", selfroll: "self" })[value] ?? value ?? "public";

export default class ChatBinder extends Binding {
  bind(options) {
    this.configure(options);
    this.settingsSignature = undefined;
    this.messagesSignature = undefined;
    this.seen = new Set();
    this.pending = new Map();
    this.legacy = [];
    this.initialized = false;
    this.listen(this.chatlog, "sendMessage", ({ text, rollMode }) => this.send("chatSend", { text, rollMode: mode(rollMode), whisperUserIds: [] }));
    this.listen(this.chatlog, "cardAction", (payload) => this.onCardAction?.(payload));
    this.listen(this.chatlog, "rollModeChanged", ({ rollMode }) => this.onRollMode?.(mode(rollMode)));
    this.listen(this.dicebox, "settled", ({ rollId }) => {
      this.pending.delete(rollId);
      this.render();
    });
    this.listen(this.dicesettings, "change", ({ settings }) => this.send("diceSave", { settings }));
    this.listen(this.dicesettings, "testRoll", ({ notation }) => this.send("chatSend", { text: "/r " + notation, rollMode: "self", whisperUserIds: [] }));
    return this;
  }

  setLegacy(messages) {
    this.legacy = messages;
    this.render();
  }

  update(state) {
    this.state = state;
    const settings = state.diceSettings;
    if (JSON.stringify(settings) !== this.settingsSignature) {
      this.settingsSignature = JSON.stringify(settings);
      this.dicesettings?.setProps(settings);
      this.dicebox?.setProps({
        quality: settings.quality ?? "high", speed: settings.speed ?? 1,
        enabled: settings.enabled !== false,
        theme: { name: settings.theme ?? "standard", material: settings.material ?? "plastic", colors: settings.colors ?? {} },
      });
    }
    const rolls = [];
    for (const message of state.messages) {
      const payload = message.card?.dicePayload;
      if (this.initialized && !this.seen.has(message.id) && payload?.dice?.length && this.dicebox && this.dicebox.props.enabled !== false) {
        this.pending.set(payload.id, message.id);
        rolls.push(payload);
      }
      this.seen.add(message.id);
    }
    this.initialized = true;
    this.render();
    if (rolls.length) this.dicebox.setProps({ rolls });
  }

  render() {
    if (!this.state) return;
    const hidden = new Set(this.pending.values());
    const messages = this.state.messages.filter((message) => !hidden.has(message.id)).map((message) => ({
      ...message,
      card: message.concealed || !Object.keys(message.card || {}).length ? undefined : message.card?.content ?? message.card,
      text: message.concealed ? "Blind roll" : message.text,
      blind: message.concealed,
    }));
    const projected = [...this.legacy, ...messages].sort((a, b) => a.timestamp - b.timestamp);
    const signature = JSON.stringify(projected);
    if (signature === this.messagesSignature) return;
    this.messagesSignature = signature;
    this.chatlog.setProps({ messages: projected });
  }
}
