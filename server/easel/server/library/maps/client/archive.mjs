const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function encodeText(str) {
  return new TextEncoder().encode(String(str ?? ""));
}

export function decodeText(bytes) {
  return new TextDecoder().decode(bytes);
}

export function bytesToBase64(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    output +=
      alphabet[a >> 2] +
      alphabet[((a & 3) << 4) | (b >> 4)] +
      (i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : "=") +
      (i + 2 < bytes.length ? alphabet[c & 63] : "=");
  }
  return output;
}

export function base64ToBytes(str) {
  const clean = String(str ?? "").replace(/[^A-Za-z0-9+/=]/g, "");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = [];
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = alphabet.indexOf(clean[i]);
    const c1 = alphabet.indexOf(clean[i + 1]);
    const c2 = clean[i + 2] === "=" ? -1 : alphabet.indexOf(clean[i + 2]);
    const c3 = clean[i + 3] === "=" ? -1 : alphabet.indexOf(clean[i + 3]);
    if (c0 < 0 || c1 < 0) break;
    out.push((c0 << 2) | (c1 >> 4));
    if (c2 >= 0) out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (c3 >= 0) out.push(((c2 & 3) << 6) | c3);
  }
  return new Uint8Array(out);
}

export function zip(files = {}) {
  const entries = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encodeText(name);
    const data =
      content instanceof Uint8Array
        ? content
        : typeof content === "string"
          ? encodeText(content)
          : encodeText(JSON.stringify(content));
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    entries.push({ local, central });
    offset += local.length;
  }

  let centralLength = 0;
  for (const e of entries) centralLength += e.central.length;
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralLength, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const out = new Uint8Array(offset + centralLength + 22);
  let pos = 0;
  for (const e of entries) {
    out.set(e.local, pos);
    pos += e.local.length;
  }
  for (const e of entries) {
    out.set(e.central, pos);
    pos += e.central.length;
  }
  out.set(eocd, pos);
  return out;
}

export function unzip(archiveBytes) {
  const bytes =
    archiveBytes instanceof Uint8Array
      ? archiveBytes
      : archiveBytes instanceof ArrayBuffer
        ? new Uint8Array(archiveBytes)
        : typeof archiveBytes === "string"
          ? base64ToBytes(archiveBytes)
          : new Uint8Array(0);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error("Invalid zip archive");
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  const files = {};
  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw new Error("Invalid central directory header");
    }
    const method = view.getUint16(centralOffset + 10, true);
    if (method !== 0) throw new Error("Unsupported zip compression method");
    const size = view.getUint32(centralOffset + 24, true);
    const nameLen = view.getUint16(centralOffset + 28, true);
    const extraLen = view.getUint16(centralOffset + 30, true);
    const commentLen = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = decodeText(bytes.subarray(centralOffset + 46, centralOffset + 46 + nameLen));
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    files[name] = bytes.subarray(dataStart, dataStart + size);
    centralOffset += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

const MIME_TYPES = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function mediaTypeFor(name) {
  const ext = String(name || "").split(".").pop().toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

function collectAssetFiles(files, assets) {
  if (Array.isArray(assets)) {
    for (const entry of assets) {
      if (!entry) continue;
      const rawPath = String(entry.path || entry.name || "").replace(/^\/+/, "");
      if (!rawPath) continue;
      const fullPath = rawPath.startsWith("assets/") ? rawPath : `assets/${rawPath}`;
      files[fullPath] = entry.data ?? entry.bytes ?? new Uint8Array(0);
    }
    return;
  }
  for (const [k, v] of Object.entries(assets || {})) {
    const safeName = String(k).replace(/^\/+/, "");
    const fullPath = safeName.startsWith("assets/") ? safeName : `assets/${safeName}`;
    files[fullPath] = v;
  }
}

function rewriteAssetStrings(node, lookup) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = rewriteAssetStrings(node[i], lookup);
    }
    return node;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === "string" && lookup.has(v)) {
        node[k] = lookup.get(v);
      } else {
        node[k] = rewriteAssetStrings(v, lookup);
      }
    }
    return node;
  }
  return node;
}

function extractAssetsAndLookup(files) {
  const assets = [];
  const assetMap = {};
  const lookup = new Map();
  for (const [path, bytes] of Object.entries(files)) {
    if (path.startsWith("assets/") && path.length > 7) {
      const name = path.slice("assets/".length);
      const mime = mediaTypeFor(name);
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      assetMap[name] = bytes;
      assets.push({ path, name, data: bytes, dataUrl });
      lookup.set(path, dataUrl);
      lookup.set(name, dataUrl);
    }
  }
  Object.assign(assets, assetMap);
  return { assets, assetMap, lookup };
}

export function packMap(mapData, assets = {}) {
  const clean = JSON.parse(JSON.stringify(mapData ?? {}));
  delete clean.visionMask;
  const files = {
    "map.json": JSON.stringify(clean, null, 2),
  };
  collectAssetFiles(files, assets);
  return zip(files);
}

export function unpackMap(archiveBytes) {
  const files = unzip(archiveBytes);
  const mapRaw = files["map.json"];
  if (!mapRaw) throw new Error("Archive missing map.json");
  const parsed = JSON.parse(decodeText(mapRaw));
  const map = parsed && parsed.definition && typeof parsed.definition === "object"
    ? parsed.definition
    : parsed;
  delete map.visionMask;
  const { assets, assetMap, lookup } = extractAssetsAndLookup(files);
  rewriteAssetStrings(map, lookup);
  return { map, definition: map, assets, assetMap };
}

export function packBox(boxData, assets = {}) {
  const clean = JSON.parse(JSON.stringify(boxData ?? {}));
  const files = {
    "box.json": JSON.stringify(clean, null, 2),
  };
  collectAssetFiles(files, assets);
  return zip(files);
}

export function unpackBox(archiveBytes) {
  const files = unzip(archiveBytes);
  const boxRaw = files["box.json"] || files["scene.json"];
  if (!boxRaw) throw new Error("Archive missing box.json");
  const parsed = JSON.parse(decodeText(boxRaw));
  const box = parsed && parsed.definition && typeof parsed.definition === "object"
    ? parsed.definition
    : parsed;
  const { assets, assetMap, lookup } = extractAssetsAndLookup(files);
  rewriteAssetStrings(box, lookup);
  return { box, scene: box, definition: box, assets, assetMap };
}

