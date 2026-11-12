import { pileToWorld } from "./cardtable-layout.mjs";
import {
  MAT_UNIT,
  drawsOutlines,
  boxOf,
  elementLayer,
  partControl,
  stepParts,
  deltasOf,
  textOf,
  tokenControls,
} from "./battlemap.mjs";
const HAND = { gap: 30, height: 300 };
const SETTINGS_ICON =
  "/packages/modules/assetkit/client/icons/sliders-horizontal.svg";
const MANA = {
  white: "W",
  blue: "U",
  black: "B",
  red: "R",
  green: "G",
  colorless: "C",
};
const LABELS = { plus: "+", minus: "\u2212", tap: "T" };
const SHORT = {
  "first strike": "1ST",
  "double strike": "2X",
  deathtouch: "DTH",
  hexproof: "HEX",
  indestructible: "IND",
  lifelink: "LIF",
  storage: "STO",
  verse: "VRS",
  luck: "LCK",
  quest: "QST",
  charge: "CHG",
  shield: "SHL",
  stun: "STN",
  level: "LVL",
  trample: "TRM",
  reach: "RCH",
  shadow: "SHD",
  haste: "HST",
};
const counterLabel = (preset) =>
  !preset || preset.kind === "custom"
    ? String(preset?.name || "").slice(0, 7)
    : preset.kind === "stat"
      ? preset.name
      : SHORT[preset.name] || preset.name.slice(0, 3).toUpperCase();
const partLabel = (key, part) =>
  LABELS[key] ||
  (Number.isFinite(part.step)
    ? (part.step > 0 ? "+" : "\u2212") + Math.abs(part.step)
    : key.toUpperCase());
function counterType(map, name) {
  const counters = map.counters || {};
  return { ...(counters.template || {}), ...(counters.types?.[name] || {}) };
}
function cardSize(map) {
  return {
    width: (map.card?.width ?? 160) / MAT_UNIT,
    height: (map.card?.height ?? 223) / MAT_UNIT,
  };
}
function cardControls(map, card, presets = [], { saved = false } = {}) {
  const fallback = drawsOutlines(map);
  const events = [];
  if (card.movable && card.faceup && map.card?.events) {
    const control = partControl("events", map.card.events, {
      fallback,
      label: "{}",
      reveal: "hover",
      fill: "#000000b3",
    });
    events.push(control);
    if (saved && !card.events?.length)
      events.push({
        id: "events-saved",
        x: control.x,
        y: control.y,
        width: control.width,
        height: control.height,
        box: false,
        passive: true,
        badge: " ",
        badgeScale: 0.22,
        badgeColor: globalThis.window?.easel?.palette?.primary || "#d3d3d3",
      });
  }
  if (card.zone === "hand")
    return [
      ...(card.movable && card.faceup && map.card?.cast
        ? [
            partControl("cast", map.card.cast, {
              fallback,
              label: "C",
              reveal: "hover",
              fill: "#000000b3",
            }),
          ]
        : []),
      ...events,
    ];
  if (card.zone === "command") return events;
  if (!["battlefield", "table"].includes(card.zone)) return [];
  const controls = [...events];
  if (card.movable && map.card?.attach)
    controls.push(
      partControl(
        "attach",
        {
          ...map.card.attach,
          image: card.attachedTo
            ? {
                ...map.card.attach.image,
                url: "/packages/modules/assetkit/client/icons/unlink.svg",
              }
            : map.card.attach.image,
        },
        {
          fallback,
          label: { i18n: "easel.mtg.attach" },
          reveal: "hover",
          fill: "#000000b3",
        },
      ),
    );
  if (card.movable && map.card?.tap)
    controls.push({
      ...partControl(
        "tap",
        {
          ...map.card.tap,
          image: card.skipUntap
            ? {
                ...map.card.tap.image,
                url: "/packages/modules/assetkit/client/icons/circle-pause.svg",
              }
            : map.card.tap.image,
        },
        {
          fallback,
          label: LABELS.tap,
          reveal: card.skipUntap ? void 0 : "hover",
          fill: "#000000b3",
        },
      ),
      secondary: card.autoUntap || void 0,
      tooltip: card.autoUntap
        ? card.skipUntap
          ? { i18n: "easel.mtg.r-click-to-add-to-untap" }
          : { i18n: "easel.mtg.r-click-to-remove-from-untap" }
        : void 0,
    });
  const onCard = map.counters?.onCard || {};
  const entries = card.faceup ? Object.entries(card.counters || {}) : [];
  entries.forEach(([name, amount], index) => {
    const preset =
      card.counterKinds?.[name] || presets.find((p) => p.name === name);
    const type = counterType(map, preset?.id ?? name);
    const tokenSize = type.size?.width ?? 84;
    const scale = (onCard.size ?? 58) / tokenSize;
    const step =
      ((type.size?.height ?? 84) * scale + (onCard.gap ?? 4)) / MAT_UNIT;
    controls.push(
      ...tokenControls(type, {
        id: "counter|" + name,
        x: (onCard.left ?? 0) / MAT_UNIT,
        y: (onCard.top ?? 0) / MAT_UNIT + index * step,
        scale,
        count: amount,
        fallback,
        label: counterLabel(preset || { kind: "custom", name }),
        interactive: card.movable,
        reveal: "hover",
        fill: "#000000b3",
      }),
    );
  });
  return controls;
}
function regionGeometry(map) {
  const size = map.size || { width: 2400, height: 1400 };
  const area = (element) => {
    const box = boxOf(element?.position, size);
    return { width: Math.round(box.width), height: Math.round(box.height) };
  };
  return {
    card: { width: map.card?.width ?? 160, height: map.card?.height ?? 223 },
    main: area(map.play?.battlefield),
    lands: area(map.play?.lands ?? map.play?.battlefield),
  };
}
function magicLayout(
  players,
  capabilities,
  viewer,
  boardid,
  shape = "auto",
  size = 1,
  {
    format = "commander",
    counts = {},
    counters = [],
    amount = null,
    maps = {},
    fallbackMap,
    stack = { count: 0, timer: null },
    commanders = [],
    turn = {},
    palette = {},
  } = {},
) {
  const count = players.length,
    sectors = Math.max(4, count);
  const mapOf = (player) => maps[player.id] || fallbackMap;
  const matOf = (map) => ({
    width: (map?.size?.width ?? 2400) / MAT_UNIT,
    height: (map?.size?.height ?? 1400) / MAT_UNIT,
  });
  const stationWidth = Math.max(
      16,
      ...players.map((player) => matOf(mapOf(player)).width),
    ),
    stationHeight =
      Math.max(10, ...players.map((player) => matOf(mapOf(player)).height)) +
      (HAND.gap + HAND.height) / MAT_UNIT;
  const distance =
    stationHeight / 2 +
    stationWidth / 2 / Math.tan(Math.PI / sectors) +
    1.2 +
    Math.max(0, size - 1) * 12;
  const outer = distance + stationHeight / 2 + 1;
  const sides =
    shape === "circle"
      ? 64
      : shape === "square"
        ? 4
        : shape === "polygon"
          ? Math.max(3, count)
          : sectors;
  const radius = outer / Math.cos(Math.PI / sides);
  const extent = Math.ceil(2 * radius + 2),
    center = extent / 2;
  const piles = [];
  piles.width = piles.height = extent;
  piles.stations = [];
  piles.decor = [];
  piles.bindings = {};
  piles.table = {
    points: Array.from({ length: sides }, (_, i) => {
      const angle = Math.PI / 2 - Math.PI / sides + (i * Math.PI * 2) / sides;
      return {
        x: center + Math.cos(angle) * radius,
        y: center + Math.sin(angle) * radius,
      };
    }),
  };
  piles.push({
    id: "table",
    name: { i18n: "easel.mtg.table" },
    kind: "playregion",
    zone: "table",
    owner: { metatype: "board", id: boardid },
    x: 0,
    y: 0,
    width: extent,
    height: extent,
    orientation: 0,
    layout: "free",
    coordinates: "world",
    box: false,
    label: "",
    permissions: { control: capabilities.play, receive: capabilities.play },
  });
  const stackPile = (bounds, orientation) => ({
    id: "stack",
    name: { i18n: "easel.mtg.stack" },
    kind: "pile",
    zone: "stack",
    owner: { metatype: "board", id: boardid },
    ...bounds,
    orientation,
    layout: "spread",
    direction: "vertical",
    coordinates: "world",
    visible: stack.count > 0,
    box: false,
    label: "",
    permissions: { control: capabilities.play, receive: capabilities.play },
  });
  const stackTimer = (bounds, orientation) =>
    stack.count > 0 && stack.timer
      ? [
          {
            id: "stack-timer",
            kind: "zone",
            ...bounds,
            orientation,
            box: false,
            label: "",
            progress: {
              deadline: stack.timer.deadline,
              total: stack.timer.total,
              color: (palette.text || "#d3d3d3") + "d9",
            },
          },
        ]
      : [];
  let stackPlaced = false;
  for (const [index, player] of players.entries()) {
    const map = mapOf(player) || {};
    const mat = matOf(map);
    const pixels = map.size || { width: 2400, height: 1400 };
    const fallback = drawsOutlines(map);
    const seat = count === 2 ? index * 2 : index;
    const orientation = count <= 4 ? seat * 90 : (index * 360) / count;
    const angle = ((orientation + 90) * Math.PI) / 180;
    const point = {
      x: center + Math.cos(angle) * distance,
      y: center + Math.sin(angle) * distance,
    };
    const frame = { x: point.x, y: point.y, width: 0, height: 0, orientation };
    piles.stations.push({
      id: "station-" + player.id,
      player: player.id,
      name: player.name,
      color: player.color,
      x: point.x - stationWidth / 2,
      y: point.y - stationHeight / 2,
      width: stationWidth,
      height: stationHeight,
      orientation,
      map,
      card: cardSize(map),
    });
    const own = player.id === viewer;
    const controlled = capabilities.play && (own || capabilities.controlOther);
    const mine = capabilities.play && own;
    const left = (stationWidth - mat.width) / 2;
    const place = (item) => {
      const location = pileToWorld(frame, {
        x: left + item.x + item.width / 2 - stationWidth / 2,
        y: item.y + item.height / 2 - stationHeight / 2,
      });
      return {
        ...item,
        x: location.x - item.width / 2,
        y: location.y - item.height / 2,
        orientation,
      };
    };
    const element = (key, spec, values, parts2 = []) =>
      place(
        elementLayer(spec, {
          id: key + "-" + player.id,
          size: pixels,
          values,
          fallback,
          parts: parts2,
        }),
      );
    const parts = (spec, prefix, enabled, extra = () => ({})) =>
      enabled
        ? Object.entries(spec.parts || {}).map(([key, part]) => ({
            ...partControl(prefix(key, part), part, {
              fallback,
              label: partLabel(key, part),
            }),
            ...extra(key),
          }))
        : [];
    const counted = (key) =>
      amount && ["draw", "peek", "show", "reveal"].includes(key)
        ? { badge: String(amount) }
        : {};
    const steppers = (spec, id, step, area) => {
      if (!controlled) return [];
      const built = stepParts(spec, { id, area, step, fallback });
      if (built.bindings.length) piles.bindings[id] = built.bindings;
      return built.controls;
    };
    const whole = (spec) => {
      const box = boxOf(spec.position, pixels);
      return { top: 0, left: 0, width: box.width, height: box.height };
    };
    piles.decor.push(
      place({
        id: "mat-" + player.id,
        kind: "zone",
        x: 0,
        y: 0,
        width: mat.width,
        height: mat.height,
        box: fallback || !map.image,
        color: player.color,
        border: (palette.text || "#d3d3d3") + "26",
        borderWidth: 1,
        radius: 22,
        label: "",
        images: map.image?.url
          ? [
              {
                key: map.image.url,
                x: (map.image.left ?? 0) / MAT_UNIT,
                y: (map.image.top ?? 0) / MAT_UNIT,
                width: (map.image.width ?? pixels.width) / MAT_UNIT,
                height: (map.image.height ?? pixels.height) / MAT_UNIT,
              },
            ]
          : [],
      }),
    );
    if (map.life)
      piles.decor.push(
        element(
          "life",
          map.life,
          { count: player.life ?? 0 },
          steppers(map.life, `life|${player.id}`, 1, whole(map.life)),
        ),
      );
    if (map.turn) {
      const layer = element("turn", map.turn, {
        turn: turn.number ?? "",
        player: players.find((participant) => participant.id === turn.active)
          ?.name || {
          i18n: "easel.mtg.waiting",
        },
        step: turn.step || "",
      });
      const list = map.turn.phaseList;
      const canAdvance =
        mine && (turn.active === viewer || capabilities.manage);
      const style = map.turn.style || {};
      const surface = palette[style.surface || "surface"] || "#d3d3d3";
      const ink = palette[style.text || "text"] || "#d3d3d3";
      const accent = palette[style.highlight || "primary"] || ink;
      const darkIcons =
        [1, 3, 5].reduce(
          (total, offset) =>
            total + parseInt(ink.slice(offset, offset + 2), 16),
          0,
        ) < 384;
      const iconUrl = (name) =>
        `/packages/modules/assetkit/client/icons/${name}${darkIcons ? "-black" : ""}.svg`;
      const panel = (
        id,
        left2,
        top,
        width,
        height,
        color,
        border = ink + "26",
      ) => ({
        id,
        x: left2 / MAT_UNIT,
        y: top / MAT_UNIT,
        width: width / MAT_UNIT,
        height: height / MAT_UNIT,
        shape: "square",
        radius: 6,
        box: true,
        color,
        border,
        borderWidth: 1,
        passive: true,
      });
      layer.controls.push({
        ...panel("turn-header", 0, 0, layer.pixels.width, 48, surface + "dd"),
        texts: layer.texts.map((text) => ({ ...text, color: ink })),
      });
      layer.texts = [];
      if (list) {
        let top = list.top ?? 62;
        const lineHeight = list.lineHeight ?? 26;
        const headingHeight = list.headingHeight ?? 30;
        const left2 = list.left ?? 8;
        const width = layer.pixels.width - left2 * 2;
        for (const [index2, phase] of (list.phases || []).entries()) {
          const active =
            phase.step === turn.step ||
            phase.steps?.some((step) => step.step === turn.step);
          const groupHeight =
            headingHeight + (phase.steps?.length || 0) * lineHeight + 4;
          layer.controls.push(
            panel(
              `turn-group-${index2}`,
              left2,
              top,
              width,
              groupHeight,
              surface + (active ? "e6" : "99"),
              active ? accent + "99" : ink + "26",
            ),
          );
          const row = (label, current, heading, step, icon) => {
            const phaseIndex = (turn.phases || []).indexOf(step);
            const height = heading ? headingHeight : lineHeight;
            const selected = current && (!heading || !phase.steps?.length);
            const textLeft = heading ? 38 : (list.indent ?? 38);
            layer.controls.push({
              ...partControl(
                phaseIndex >= 0
                  ? `phase|${phaseIndex}`
                  : `turn-label-${index2}`,
                {
                  type: "square",
                  left: left2 + 4,
                  top,
                  width: width - 8,
                  height,
                  image: icon
                    ? {
                        url: iconUrl(icon),
                        left: 10,
                        top: (height - 20) / 2,
                        width: 20,
                        height: 20,
                      }
                    : void 0,
                  lettering: {
                    text: label,
                    top: (height - (list.size ?? 22)) / 2 - 3,
                    left: textLeft,
                    width: width - textLeft - 16,
                    size: list.size ?? 22,
                    align: "left",
                    color: current ? accent : heading ? ink : ink + "b3",
                    bold: heading || current,
                  },
                },
                { fill: selected ? accent + "26" : surface + "00" },
              ),
              box: selected,
              borderWidth: 0,
              radius: 3,
              passive: !canAdvance || phaseIndex < 0,
            });
            if (selected)
              layer.controls.push({
                ...panel(
                  `turn-marker-${index2}`,
                  left2 + 10,
                  top + 6,
                  3,
                  height - 12,
                  accent,
                ),
                borderWidth: 0,
                radius: 1,
              });
            top += height;
          };
          row(
            phase.label,
            active,
            true,
            phase.step || phase.steps?.[0]?.step,
            phase.icon,
          );
          for (const step of phase.steps || [])
            row(step.label, step.step === turn.step, false, step.step);
          top += 4 + (list.gap ?? 8);
        }
      }
      if (canAdvance) {
        const lastStep = turn.step === turn.phases?.at(-1);
        layer.controls.push({
          ...partControl(
            "next-step",
            {
              type: "square",
              top: layer.pixels.height - 44,
              left: 8,
              width: layer.pixels.width - 16,
              height: 36,
              image: {
                url: iconUrl("arrow-right"),
                left: layer.pixels.width - 48,
                top: 8,
                width: 20,
                height: 20,
              },
              lettering: {
                text: lastStep
                  ? { i18n: "easel.mtg.pass-turn" }
                  : { i18n: "easel.mtg.next-step" },
                top: 3,
                left: 16,
                width: layer.pixels.width - 72,
                size: 24,
                align: "left",
                color: accent,
              },
            },
            { fill: surface + "e6" },
          ),
          box: true,
          border: accent + "99",
          borderWidth: 1,
          radius: 5,
        });
      }
      piles.decor.push(layer);
    }
    if (map.tax && format === "commander")
      piles.decor.push(
        element(
          "tax",
          map.tax,
          { count: player.commanderTax ?? 0 },
          steppers(map.tax, `tax|${player.id}`, 2, whole(map.tax)),
        ),
      );
    for (const [name, color] of Object.entries(MANA)) {
      const spec = map.mana?.[name];
      if (!spec) continue;
      piles.decor.push(
        element(
          "mana-" + color,
          spec,
          { count: player.mana?.[color] || "", color },
          steppers(
            spec,
            `mana|${player.id}|${color}`,
            1,
            spec.image || whole(spec),
          ),
        ),
      );
    }
    if (map.damage && format === "commander") {
      const spec = map.damage,
        row = spec.row || {};
      const rowHeight = row.height ?? 36,
        rowGap = row.gap ?? 8;
      const sources = commanders.filter((source) => source.owner !== player.id);
      const taken = (source) =>
        player.commanderDamage?.[source.id] ??
        (String(source.id).startsWith("player-")
          ? player.commanderDamage?.[source.owner] || 0
          : 0);
      const bar = row.bar || { left: 36, width: 96, top: 4, height: 28 };
      const controls = sources.flatMap((source, index2) => {
        const top = (row.top ?? 44) + index2 * (rowHeight + rowGap);
        const shift = (part) =>
          part &&
          (Number.isFinite(part.top) ? { ...part, top: part.top + top } : part);
        return [
          {
            id: `cdmg-bar|${player.id}|${source.id}`,
            x: (bar.left ?? 0) / MAT_UNIT,
            y: (top + (bar.top ?? 0)) / MAT_UNIT,
            width: (bar.width ?? 96) / MAT_UNIT,
            height: (bar.height ?? 28) / MAT_UNIT,
            shape: "square",
            radius: (bar.corner ?? 6) * 0.64,
            color: source.color,
            border: (palette.text || "#d3d3d3") + "40",
            borderWidth: 1,
            passive: true,
            texts: textOf(
              { size: bar.textSize ?? 22, outline: true },
              { width: bar.width ?? 96, height: bar.height ?? 28 },
              taken(source),
            ),
          },
          ...steppers(
            { delta: deltasOf(row).map(shift) },
            `cdmg|${player.id}|${source.id}`,
            1,
            {
              top: top + (bar.top ?? 0),
              left: bar.left ?? 0,
              width: bar.width ?? 96,
              height: bar.height ?? 28,
            },
          ),
        ];
      });
      piles.decor.push(element("damage", spec, {}, controls));
    }
    if (map.playerCounters) {
      const spec = map.playerCounters,
        slot = spec.slot || {};
      const columns = slot.columns ?? 4;
      const held = [
        ["poison", player.poison],
        ["energy", player.energy],
        ...Object.entries(player.counters || {}),
      ].filter(([, amount2]) => amount2 > 0);
      piles.decor.push(
        element(
          "pcounters",
          spec,
          { count: held.length },
          held.flatMap(([name, amount2], i) => {
            const preset = counters.find(
              (item) => item.id === name || item.name === name,
            );
            const type = counterType(map, preset?.id ?? name);
            const left2 =
              (slot.left ?? 0) +
              (i % columns) * ((slot.width ?? 64) + (slot.gap ?? 8));
            const top =
              (slot.top ?? 0) +
              Math.floor(i / columns) * ((slot.height ?? 64) + (slot.gap ?? 8));
            return [
              ...tokenControls(type, {
                id: `pcounter-token|${player.id}|${name}`,
                x: left2 / MAT_UNIT,
                y: top / MAT_UNIT,
                scale: (slot.width ?? 64) / (type.size?.width ?? 84),
                count: amount2,
                fallback,
                label: counterLabel(preset || { kind: "custom", name }),
              }),
              ...steppers(spec, `pcounter|${player.id}|${name}`, 1, {
                top,
                left: left2,
                width: slot.width ?? 64,
                height: slot.height ?? 64,
              }),
            ];
          }),
        ),
      );
    }
    if (map.counters && !map.counters.hidden) {
      const slot = map.counters.slot || {};
      const columns = slot.columns ?? 3;
      const tokens = controlled
        ? (counters.some((preset) => counterType(map, preset.id).image)
            ? counters.filter((preset) => counterType(map, preset.id).image)
            : [...counters, { id: "custom", name: "custom", kind: "custom" }]
          ).flatMap((preset, i) => {
            const type = counterType(map, preset.id);
            const scale = (slot.width ?? 84) / (type.size?.width ?? 84);
            return tokenControls(type, {
              id: "counter|" + preset.id,
              x:
                ((slot.left ?? 0) +
                  (i % columns) * ((slot.width ?? 84) + (slot.gap ?? 6))) /
                MAT_UNIT,
              y:
                ((slot.top ?? 0) +
                  Math.floor(i / columns) *
                    ((slot.height ?? 84) + (slot.gap ?? 6))) /
                MAT_UNIT,
              scale,
              fallback,
              label: preset.kind === "custom" ? "+" : counterLabel(preset),
              draggable: true,
            });
          })
        : [];
      piles.decor.push(element("counters", map.counters, {}, tokens));
    }
    const zoneCount = (zone) => counts[player.id]?.[zone] ?? 0;
    const containers = [
      [
        "battlefield",
        "main",
        "playregion",
        map.play?.battlefield,
        "free",
        "battlefield",
      ],
      ["battlefield", "lands", "playregion", map.play?.lands, "free", "lands"],
      ["command", null, "pile", map.piles?.command, "spread", "command"],
      ["library", null, "deck", map.piles?.library, "stack", "library"],
      [
        "graveyard",
        null,
        "discard",
        map.piles?.graveyard,
        "stack",
        "graveyard",
      ],
      ["exile", null, "pile", map.piles?.exile, "stack", "exile"],
    ];
    for (const [zone, region, kind, spec, mode, countKey] of containers) {
      if (!spec) continue;
      const control =
        capabilities.play &&
        (own || (capabilities.controlOther && zone !== "library"));
      const controls =
        zone === "library"
          ? parts(
              spec,
              (key) =>
                key === "search"
                  ? `search|${player.id}|library`
                  : `${key}|${player.id}`,
              mine,
              counted,
            )
          : zone === "graveyard" || zone === "exile"
            ? parts(
                spec,
                (key) =>
                  key === "search"
                    ? `search|${player.id}|${zone}`
                    : `${key}|${player.id}|${zone}`,
                true,
              )
            : parts(spec, (key) => `${key}|${player.id}|${zone}`, control);
      const layer = element(
        region === "lands" ? "lands" : zone,
        spec,
        { count: zoneCount(countKey) },
        controls,
      );
      piles.push({
        ...layer,
        name: zone.charAt(0).toUpperCase() + zone.slice(1),
        kind,
        zone,
        region: zone === "battlefield" ? region : void 0,
        player: player.id,
        owner: { metatype: "account", id: player.id },
        layout: mode,
        coordinates: zone === "battlefield" ? "normalized" : "world",
        align: spec.align,
        paddingTop: Number.isFinite(spec.paddingTop)
          ? spec.paddingTop / MAT_UNIT
          : void 0,
        permissions: { control, receive: control },
      });
      if (zone === "library" && spec.bottom) {
        const box = boxOf(spec.position, pixels);
        const compartment = element(
          "library-bottom",
          {
            ...spec.bottom,
            position: {
              ...spec.bottom.position,
              top: box.y + (spec.bottom.position?.top ?? 0),
              left: box.x + (spec.bottom.position?.left ?? 0),
            },
          },
          {},
        );
        piles.push({
          ...compartment,
          name: { i18n: "easel.mtg.library-bottom" },
          kind: "deck",
          zone: "library",
          bottom: true,
          player: player.id,
          owner: { metatype: "account", id: player.id },
          layout: "stack",
          coordinates: "world",
          permissions: { control: false, receive: control },
        });
      }
    }
    if (own) {
      const size2 = cardSize(map);
      const pile = place({
        x: mat.width + 0.3,
        y: 0,
        width: size2.width + 0.3,
        height: mat.height,
      });
      piles.push(stackPile(pile, orientation));
      piles.decor.push(
        ...stackTimer(
          place({
            x: mat.width + 0.3 + size2.width + 0.45,
            y: 0.15,
            width: 0.14,
            height: mat.height - 0.3,
          }),
          orientation,
        ),
      );
      stackPlaced = true;
    }
    const handControl = capabilities.play && own;
    piles.push({
      ...place({
        x: 0,
        y: mat.height + HAND.gap / MAT_UNIT,
        width: mat.width,
        height: HAND.height / MAT_UNIT,
      }),
      id: "hand-" + player.id,
      name: player.name + "'s hand",
      kind: "hand",
      zone: "hand",
      player: player.id,
      owner: { metatype: "account", id: player.id },
      layout: "spread",
      coordinates: "world",
      color: "#00000059",
      border: (palette.text || "#d3d3d3") + "33",
      borderWidth: 1,
      radius: 14,
      label: own
        ? { i18n: "easel.mtg.your-hand" }
        : { i18n: "easel.mtg.name-s-hand", args: { name: player.name } },
      labelSize: 14,
      bold: true,
      ink: (palette.text || "#d3d3d3") + "cc",
      permissions: { control: handControl, receive: handControl },
    });
    if (mine) {
      const corner = (key, settings, box) => {
        const size2 = settings.size ?? 52,
          glyph = Math.round(size2 * 0.56);
        const darkTurnIcon =
          key === "turn" &&
          [1, 3, 5].reduce(
            (total, offset) =>
              total +
              parseInt(
                (palette.text || "#d3d3d3").slice(offset, offset + 2),
                16,
              ),
            0,
          ) < 384;
        const image = settings.image || {
          url: darkTurnIcon
            ? SETTINGS_ICON.replace(".svg", "-black.svg")
            : SETTINGS_ICON,
          top: (size2 - glyph) / 2,
          left: (size2 - glyph) / 2,
          width: glyph,
          height: glyph,
        };
        piles.decor.push(
          place(
            elementLayer(
              {
                position: {
                  top: box.y,
                  left: box.x + box.width - size2,
                  width: size2,
                  height: size2,
                },
                outline: settings.outline ?? true,
                sides: ["left", "bottom"],
                corner: settings.corner,
                image,
              },
              {
                id: "settings-" + key + "-" + player.id,
                size: pixels,
                fallback,
                parts: [
                  {
                    id: `settings|${player.id}|${key}`,
                    x: 0,
                    y: 0,
                    width: size2 / MAT_UNIT,
                    height: size2 / MAT_UNIT,
                    box: false,
                  },
                ],
              },
            ),
          ),
        );
      };
      for (const [key, spec] of [
        ["turn", map.turn],
        ["battlefield", map.play?.battlefield],
        ["lands", map.play?.lands],
        ["exile", map.piles?.exile],
        ["library", map.piles?.library],
        ["graveyard", map.piles?.graveyard],
      ])
        if (spec?.settings)
          corner(key, spec.settings, boxOf(spec.position, pixels));
      if (map.hand?.settings)
        corner("hand", map.hand.settings, {
          x: 0,
          y: pixels.height + HAND.gap,
          width: pixels.width,
          height: HAND.height,
        });
    }
  }
  if (!stackPlaced) {
    piles.push(
      stackPile({ x: center - 4, y: center - 1.5, width: 8, height: 3 }, 0),
    );
    piles.decor.push(
      ...stackTimer(
        { x: center + 4.2, y: center - 1.5, width: 0.14, height: 3 },
        0,
      ),
    );
  }
  return piles;
}
function stationView(station) {
  return {
    x: station.x + station.width / 2,
    y: station.y + station.height / 2,
    width: station.width + 0.8,
    height: station.height + 0.8,
    rotation: station.orientation,
  };
}
function tableView(stations, extent) {
  const points = stations.flatMap((station) =>
    [
      [0, 0],
      [station.width, 0],
      [0, station.height],
      [station.width, station.height],
    ].map(([x, y]) => pileToWorld(station, { x, y })),
  );
  if (!points.length)
    return { x: extent / 2, y: extent / 2, width: 16, height: 12, rotation: 0 };
  const xs = points.map((p) => p.x),
    ys = points.map((p) => p.y);
  const left = Math.min(...xs),
    top = Math.min(...ys),
    right = Math.max(...xs),
    bottom = Math.max(...ys);
  return {
    x: (left + right) / 2,
    y: (top + bottom) / 2,
    width: right - left + 2,
    height: bottom - top + 2,
    rotation: 0,
  };
}
export {
  cardControls,
  cardSize,
  counterLabel,
  counterType,
  magicLayout,
  regionGeometry,
  stationView,
  tableView,
};
