import classes from "./classes.mjs";
import races from "./races.mjs";
import feats from "./feats.mjs";
import items from "./items.mjs";
import spells from "./spells.mjs";
import buffs from "./buffs.mjs";
import monsters from "./monsters.mjs";

export const KINDS = [
  { id: "monster", label: "Monsters", singular: "monster", icon: "skull" },
  { id: "item", label: "Items", singular: "item", icon: "bag" },
  { id: "spell", label: "Spells", singular: "spell", icon: "sparkle" },
  { id: "feat", label: "Feats", singular: "feat", icon: "star" },
  { id: "class", label: "Classes", singular: "class", icon: "shield" },
  { id: "race", label: "Races", singular: "race", icon: "users" },
  { id: "buff", label: "Effects", singular: "effect", icon: "bolt" },
];

export function corePacks() {
  return [
    {
      id: "pf1e.core",
      name: "Core rules",
      source: "Core",
      system: "pf1e",
      entries: [...classes, ...races, ...feats, ...items, ...spells, ...buffs, ...monsters],
    },
  ];
}
