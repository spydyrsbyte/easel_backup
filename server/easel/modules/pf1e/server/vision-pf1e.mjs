export const PF1E_HINDRANCES = [
  "stone",
  "wood",
  "metal",
  "foliage",
  "fog",
  "magicalDarkness",
  "silence",
  "invisibility",
  "illusionGlamer",
  "illusionFigment"
];

export const PF1E_VISION_PRESETS = {
  normal: {
    enabled: true,
    range: { depth: 0, maximum: null },
    luminance: { minimum: 0.25, maximum: null },
    transformation: { saturation: 1 },
    hindered: { stone: 1, wood: 1, metal: 1, fog: 0.2, invisibility: 1 }
  },
  lowLight: {
    enabled: true,
    range: { depth: 0, maximum: null },
    luminance: { minimum: 0.125, maximum: null },
    transformation: { saturation: 1 },
    hindered: { stone: 1, wood: 1, metal: 1, fog: 0.2, invisibility: 1 }
  },
  darkvision: {
    enabled: true,
    range: { depth: 5, maximum: 60 },
    luminance: { minimum: 0, maximum: null },
    transformation: { saturation: 0 },
    hindered: { stone: 1, wood: 1, metal: 1, magicalDarkness: 1, invisibility: 1 }
  },
  darkvision120: {
    enabled: true,
    range: { depth: 5, maximum: 120 },
    luminance: { minimum: 0, maximum: null },
    transformation: { saturation: 0 },
    hindered: { stone: 1, wood: 1, metal: 1, magicalDarkness: 1, invisibility: 1 }
  },
  seeInvisibility: {
    enabled: true,
    range: { depth: 0, maximum: null },
    luminance: { minimum: 0.25, maximum: null },
    transformation: { saturation: 1 },
    hindered: { stone: 1, wood: 1, metal: 1, fog: 0.2, invisibility: 0 }
  },
  blindsense: {
    enabled: true,
    range: { depth: 0, maximum: 30 },
    luminance: { minimum: 0, maximum: null },
    transformation: null,
    hindered: { stone: 1, wood: 1, metal: 1, fog: 0, invisibility: 0 }
  },
  blindsight: {
    enabled: true,
    range: { depth: 0, maximum: 30 },
    luminance: { minimum: 0, maximum: null },
    transformation: null,
    hindered: { stone: 1, wood: 1, metal: 1, fog: 0, invisibility: 0 }
  },
  tremorsense: {
    enabled: true,
    range: { depth: 0, maximum: 30 },
    luminance: { minimum: 0, maximum: null },
    transformation: null,
    hindered: { stone: 1, wood: 1, metal: 1, fog: 0, invisibility: 0 }
  },
  trueSeeing: {
    enabled: true,
    range: { depth: 0, maximum: 120 },
    luminance: { minimum: 0, maximum: null },
    transformation: null,
    hindered: {
      stone: 1,
      wood: 1,
      metal: 1,
      invisibility: 0,
      illusionGlamer: 0,
      illusionFigment: 0,
      magicalDarkness: 0
    }
  }
};

export function registerPF1eVision(registry) {
  if (!registry || typeof registry.register !== "function") return null;
  return registry.register({
    hindrances: PF1E_HINDRANCES,
    presets: PF1E_VISION_PRESETS
  });
}

export function recordIllusionDisbelief(illusionTarget, viewerActorId) {
  if (!illusionTarget) return;
  if (!Array.isArray(illusionTarget.disbelievedByActorIds)) {
    illusionTarget.disbelievedByActorIds = [];
  }
  const idStr = String(viewerActorId);
  if (!illusionTarget.disbelievedByActorIds.includes(idStr)) {
    illusionTarget.disbelievedByActorIds.push(idStr);
  }
}

export function applyViewerPresentationOverrides(scene, viewerActorId, viewerHasTrueSeeing = false) {
  if (!scene || typeof scene !== "object") return scene;
  const clone = structuredClone(scene);
  const idStr = String(viewerActorId ?? "");

  const processEntity = (entity) => {
    if (!entity) return;
    const disbelieved =
      viewerHasTrueSeeing ||
      (Array.isArray(entity.disbelievedByActorIds) && entity.disbelievedByActorIds.includes(idStr));

    if (disbelieved) {
      if (entity.isIllusion || entity.school === "ill" || entity.school === "illusion") {
        entity.presentation = {
          ...(entity.presentation ?? {}),
          opacity: 0.25,
          types: []
        };
      }
      if (entity.trueImage || entity.trueTokenImage) {
        entity.tokenImage = entity.trueTokenImage ?? entity.trueImage;
      }
      if (entity.trueName) {
        entity.name = entity.trueName;
      }
    }
  };

  if (Array.isArray(clone.tokens)) {
    for (const t of clone.tokens) processEntity(t);
  }
  if (Array.isArray(clone.walls)) {
    for (const w of clone.walls) processEntity(w);
  }

  return clone;
}
