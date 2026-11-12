import { text as translate } from "./text.mjs";
const theme = (key) => globalThis.window?.easel?.palette?.[key] || "#d3d3d3";
const MAT_UNIT = 100;
const TEXT_SCALE = 64 / MAT_UNIT;
const LINE = () => theme("text") + "d9";
const unit = (px) => (Number.isFinite(px) ? px / MAT_UNIT : 0);
const number = (value, fallback) => (Number.isFinite(value) ? value : fallback);
function hasImages(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasImages);
  if (value.image && typeof value.image === "object" && value.image.url)
    return true;
  return Object.values(value).some(hasImages);
}
function drawsOutlines(map) {
  return !map?.image?.url;
}
function resolveImages(value, base) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value))
    return value.map((item) => resolveImages(item, base));
  const result = {};
  for (const [key, item] of Object.entries(value))
    result[key] =
      ["image", "outline"].includes(key) &&
      item?.url &&
      !/^(\/|https?:|asset\/)/i.test(item.url)
        ? {
            ...resolveImages(item, base),
            url: new URL(item.url, base).pathname,
          }
        : resolveImages(item, base);
  return result;
}
function boxOf(position = {}, container = { width: 0, height: 0 }) {
  const width = number(position.width, number(position.radius, 0) * 2);
  const height =
    number(position.height, number(position.radius, 0) * 2) || width;
  return {
    x: number(
      position.left,
      Number.isFinite(position.right)
        ? container.width - position.right - width
        : 0,
    ),
    y: number(
      position.top,
      Number.isFinite(position.bottom)
        ? container.height - position.bottom - height
        : 0,
    ),
    width,
    height,
  };
}
function fillText(text, values = {}) {
  return translate(text)
    .replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ""))
    .replace(/#/g, String(values.count ?? ""));
}
function imagesOf(image, box) {
  if (!image?.url) return [];
  return [
    {
      key: image.url,
      x: unit(image.left ?? 0),
      y: unit(image.top ?? 0),
      width: unit(image.width ?? box.width),
      height: unit(image.height ?? box.height),
      shadow: image.shadow
        ? {
            x: unit(image.shadow.x ?? 2),
            y: unit(image.shadow.y ?? 3),
            blur: unit(image.shadow.blur ?? 1.5),
            opacity: image.shadow.opacity ?? 0.55,
          }
        : void 0,
      outline: image.outline
        ? {
            key: image.outline.url,
            size: unit(image.outline.size ?? 2),
            color: image.outline.color,
            opacity: image.outline.opacity,
          }
        : void 0,
    },
  ];
}
function textOf(spec, box, text, defaults = {}) {
  if (!spec || text === "" || text == null) return [];
  const size = number(spec.size, defaults.size ?? 32);
  let x = 0,
    width = box.width,
    align = spec.align;
  if (Number.isFinite(spec.left)) {
    x = spec.left;
    width = number(spec.width, box.width - spec.left);
    align ??= "left";
  } else if (Number.isFinite(spec.right)) {
    width = number(spec.width, box.width - spec.right);
    x = box.width - spec.right - width;
    align ??= "right";
  } else align ??= "center";
  const top = number(spec.top, (box.height - size) / 2);
  return [
    {
      text: String(text),
      x: unit(x),
      y: unit(top),
      width: unit(width),
      size: Math.max(1, Math.round(size * TEXT_SCALE)),
      align,
      color: spec.color || defaults.color || theme("text"),
      bold: spec.bold ?? true,
      outline: spec.outline ? true : void 0,
      rule: spec.rule
        ? {
            gap: unit(spec.rule.gap ?? 10),
            thickness: unit(spec.rule.thickness ?? 2),
            color: spec.rule.color,
          }
        : void 0,
    },
  ];
}
function letteringOf(lettering, box, values) {
  return (
    Array.isArray(lettering) ? lettering : lettering ? [lettering] : []
  ).flatMap((spec) => textOf(spec, box, fillText(spec.text, values)));
}
function partControl(
  id,
  part,
  {
    fallback,
    label,
    values = {},
    reveal,
    step,
    fill = theme("text") + "12",
  } = {},
) {
  const box = boxOf(part);
  const round = part.type !== "square";
  return {
    id,
    x: unit(box.x),
    y: unit(box.y),
    width: unit(box.width),
    height: unit(box.height),
    shape: round ? "round" : "square",
    radius:
      part.type === "square" ? number(part.corner, 8) * TEXT_SCALE : void 0,
    box: Boolean(fallback && !part.image),
    color: fill,
    border: theme("text"),
    borderWidth: 2,
    images: imagesOf(part.image, box),
    texts: [
      ...letteringOf(part.lettering, box, values),
      ...(fallback && !part.image && !part.lettering && label
        ? textOf({}, box, label, { size: Math.min(box.height * 0.55, 34) })
        : []),
    ],
    reveal,
    step: number(part.step, step),
  };
}
function elementLayer(
  element,
  { id, size, values = {}, fallback, parts = [] } = {},
) {
  const box = boxOf(element.position, size);
  return {
    id,
    kind: "zone",
    x: unit(box.x),
    y: unit(box.y),
    width: unit(box.width),
    height: unit(box.height),
    box: Boolean(fallback && element.outline !== false),
    sides: Array.isArray(element.sides) ? element.sides : void 0,
    color: "#00000000",
    border: LINE(),
    borderWidth: 2,
    radius: number(element.corner, 10) * TEXT_SCALE,
    label: "",
    images: imagesOf(element.image, box),
    texts: [
      ...letteringOf(element.lettering, box, values),
      ...(element.count && values.count !== void 0
        ? textOf(element.count, box, values.count, { size: 64 })
        : []),
    ],
    controls: parts,
    pixels: box,
  };
}
function tokenControls(
  type,
  {
    id,
    x = 0,
    y = 0,
    scale = 1,
    count,
    fallback,
    label,
    interactive,
    reveal,
    draggable,
    clickable,
    fill,
  } = {},
) {
  const size = {
    width: number(type.size?.width, 84),
    height: number(type.size?.height, 84),
  };
  const scaled = (px) => px * scale;
  const shrink = (spec) =>
    spec && {
      ...spec,
      top: Number.isFinite(spec.top) ? scaled(spec.top) : void 0,
      left: Number.isFinite(spec.left) ? scaled(spec.left) : void 0,
      right: Number.isFinite(spec.right) ? scaled(spec.right) : void 0,
      width: Number.isFinite(spec.width) ? scaled(spec.width) : void 0,
      height: Number.isFinite(spec.height) ? scaled(spec.height) : void 0,
      radius: Number.isFinite(spec.radius) ? scaled(spec.radius) : void 0,
      size: Number.isFinite(spec.size) ? scaled(spec.size) : void 0,
      image:
        spec.image && spec.image !== spec ? shrink(spec.image) : spec.image,
      lettering: Array.isArray(spec.lettering)
        ? spec.lettering.map(shrink)
        : spec.lettering && shrink(spec.lettering),
    };
  const box = {
    x: 0,
    y: 0,
    width: scaled(size.width),
    height: scaled(size.height),
  };
  const origin = (control) => ({
    ...control,
    x: control.x + x,
    y: control.y + y,
  });
  const image = shrink(type.image);
  const token = {
    id: id + (draggable ? "" : "|token"),
    x,
    y,
    width: unit(box.width),
    height: unit(box.height),
    shape: type.shape === "square" ? "square" : "round",
    box: Boolean(fallback && !type.image),
    color: "#00000099",
    border: theme("text"),
    borderWidth: 2,
    images: imagesOf(image, box),
    texts: [
      ...letteringOf(
        Array.isArray(type.lettering)
          ? type.lettering.map(shrink)
          : shrink(type.lettering),
        box,
        { count, label },
      ),
      ...(fallback && !type.image && !type.lettering && label
        ? textOf(
            count !== void 0 && type.count
              ? { top: box.height * 0.14, size: box.height * 0.26 }
              : {},
            box,
            label,
            { size: Math.min(box.height * 0.34, scaled(26)) },
          )
        : []),
      ...(count !== void 0 && type.count && !type.count.badge
        ? textOf(shrink(type.count), box, count)
        : []),
    ],
    badge: count !== void 0 && type.count?.badge ? String(count) : void 0,
    badgeColor: type.count?.color || theme("background"),
    badgeInk: type.count?.ink || theme("text"),
    badgeScale: type.count?.scale ?? 0.3,
    passive: !draggable && !clickable,
    secondary: clickable || void 0,
    draggable,
  };
  if (!interactive) return [token];
  const parts = deltasOf(type)
    .filter((part) => hasArea(part))
    .map((part) => {
      const amount = Number.isFinite(part.step) ? part.step : 1;
      return origin(
        partControl(`${id}|${amount}`, shrink(part), {
          fallback,
          label: deltaLabel(amount),
          reveal,
          fill,
        }),
      );
    });
  return [token, ...parts];
}
const hasArea = (part) =>
  ["top", "left", "right", "bottom"].some((side) =>
    Number.isFinite(part[side]),
  );
const deltaLabel = (amount) =>
  (amount < 0 ? "\u2212" : "+") +
  (Math.abs(amount) === 1 ? "" : Math.abs(amount));
function deltasOf(spec = {}) {
  return Array.isArray(spec.delta)
    ? spec.delta
    : spec.delta
      ? [spec.delta]
      : [];
}
function stepParts(spec = {}, { id, area, step = 1, fallback } = {}) {
  const controls = [],
    bindings = [];
  for (const part of deltasOf(spec)) {
    const amount = Number.isFinite(part.step) ? part.step : step;
    if (part.click !== void 0)
      bindings.push({
        click: Number(part.click),
        modifier: ["shift", "ctrl", "alt"].includes(part.modifier)
          ? part.modifier
          : null,
        step: amount,
      });
    if (hasArea(part))
      controls.push(
        partControl(`${id}|${amount}`, part, {
          fallback,
          label: deltaLabel(amount),
        }),
      );
  }
  if (bindings.length && area)
    controls.push({
      id,
      x: unit(area.left ?? 0),
      y: unit(area.top ?? 0),
      width: unit(area.width ?? 0),
      height: unit(area.height ?? 0),
      box: false,
      buttons: [...new Set(bindings.map((binding) => binding.click))],
    });
  return { controls, bindings };
}
function resolveStep(
  bindings = [],
  { button = "left", shift, ctrl, alt } = {},
) {
  const click = { left: 1, right: 2, middle: 3 }[button] ?? 1;
  const held = shift ? "shift" : ctrl ? "ctrl" : alt ? "alt" : null;
  const match =
    bindings.find(
      (binding) => binding.click === click && binding.modifier === held,
    ) ||
    bindings.find((binding) => binding.click === click && !binding.modifier);
  return match ? match.step : null;
}
export {
  MAT_UNIT,
  boxOf,
  deltasOf,
  drawsOutlines,
  elementLayer,
  fillText,
  hasImages,
  imagesOf,
  letteringOf,
  partControl,
  resolveImages,
  resolveStep,
  stepParts,
  textOf,
  tokenControls,
};
