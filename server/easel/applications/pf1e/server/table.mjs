const copy = (value) => JSON.parse(JSON.stringify(value));

export function startTable(table, game) {
  const projection = Easel.Interfaces.create("easel.visibility.projection@1");
  const geometry = Easel.Interfaces.create("easel.maps.geometry@1");
  const check = Easel.Interfaces.create("easel.d20.check@1");
  const notation = Easel.Interfaces.create("easel.dice.notation@1");
  const actor = (id) => {
    if (!easel.pf1e.Actor.ids().includes(id)) throw new Error("That actor was not found.");
    return new easel.pf1e.Actor(id);
  };
  const derived = (record) => {
    const context = {};
    for (const [type, key] of Object.entries({ Item: "items", Feature: "features", Buff: "buffs", ClassLevel: "classLevels" })) {
      context[key] = easel.pf1e[type].ids().map((id) => new easel.pf1e[type](id)).filter((child) => child.actorId === record.id).map((child) => copy(child._data));
    }
    return record.computeDerived(context);
  };
  table.start({
    actorChanged: () => game.session.changed(),
    actor: (type, id) => {
      const record = actor(id);
      if (record.type !== type) throw new Error("The actor type does not match.");
      return { name: record.name, image: record.tokenImage || "" };
    },
    initiative: (combatant, context) => {
      const record = actor(combatant.actorId);
      const result = check.rollCheck({ modifiers: [derived(record).init] });
      table.post({ userId: context.userId, speakerName: record.name, speakerActorId: record.id, speakerActorType: record.type, speakerTokenId: combatant.tokenId, card: { content: { title: "Initiative: " + result.total, total: result.total, naturalRoll: result.naturalRoll } } });
      return result.total;
    },
    sceneView: (scene, userId, gm) => {
      const visionConfig = game.visionConfig();
      const ground = geometry.activeGround(scene.map, "");
      const tokens = scene.tokens.filter((token) => !ground || token.groundId === ground.id).map((token) => {
        const record = token.actorId ? actor(token.actorId) : null;
        const rights = record ? record.access(userId) : { read: gm, control: gm };
        const senses = record?.senses ?? {};
        const vision = [senses.lowLight ? "lowLight" : "normal"];
        if (senses.darkvisionFeet > 0) vision.push({ ...copy(visionConfig.presets.darkvision), range: { depth: 0, maximum: senses.darkvisionFeet } });
        if (senses.seeInvisibility) vision.push("seeInvisibility");
        return { ...token, owned: rights.control, observer: rights.read, canControl: rights.control, vision };
      });
      const view = projection.projectBattlemap({ ...scene.map, id: scene.id }, userId, { tokens, gm, useCache: false, visionConfig });
      const stripTokens = (layers) => (layers || []).filter((layer) => layer.type !== "token").map((layer) => ({ ...layer, ...(layer.children ? { children: stripTokens(layer.children) } : {}) }));
      const map = { ...scene.map, tokens: [], layers: stripTokens(view.layers ?? scene.map.layers), visionMask: gm ? {} : view.visionMask ?? {}, visionPolygons: gm ? [] : view.visionPolygons ?? [] };
      return { ...scene, map, tokens: view.tokens };
    },
    command: (text, context) => {
      if (!/^\/(?:r|roll)\s+/i.test(text)) return false;
      const formula = text.replace(/^\/(?:r|roll)\s+/i, "");
      const result = notation.roll(formula);
      const dice = result.rolls.map((value) => ({ sides: result.sides, value, label: String(value) }));
      table.post({ userId: context.userId, speakerName: context.displayName || "Player", rollMode: context.rollMode, whisperUserIds: context.whisperUserIds, card: { content: { title: "Roll: " + formula, formula, total: result.total, rolls: dice }, dicePayload: { id: "chat-" + Easel.Random.integer(1, 2147483647), dice } } });
      return true;
    },
  });
  Application.events.on("easel.vtt.turnStarted", ({ combatantId }) => {
    const combatant = new easel.vtt.Combatant(combatantId);
    if (combatant.actorId) {
      game.advanceTurn({ actorId: combatant.actorId });
      game.session.changed();
    }
  });
  return (payload, context) => {
    if (!context?.userId) throw new Error("A roll needs its originating player.");
    const record = actor(context.actorId);
    table.post({
      userId: context.userId,
      speakerName: record.name,
      speakerActorType: record.type,
      speakerActorId: record.id,
      rollMode: context.rollMode,
      card: { content: { ...payload.card, ...(payload.card.actorName ? { actorName: record.name } : {}) }, dicePayload: payload.dicePayload, attackData: payload.attackData },
    });
  };
}
