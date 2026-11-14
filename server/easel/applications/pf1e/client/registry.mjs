export const sectionTypes = new Map();

export function registerSections(found) {
  for (const [type, draw] of Object.entries(found || {})) if (typeof draw === "function") sectionTypes.set(type, draw);
}
