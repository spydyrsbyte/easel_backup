import { monsterEntry } from "../statblock.mjs";

const BLOCKS = [
  `Goblin CR 1/3
XP 135
NE Small humanoid (goblinoid)
Init +6; Senses darkvision 60 ft.; Perception -1
DEFENSE
AC 16, touch 13, flat-footed 14 (+2 armor, +2 Dex, +1 shield, +1 size)
hp 6 (1d10+1)
Fort +3, Ref +2, Will -1
OFFENSE
Speed 30 ft.
Melee short sword +2 (1d4/19-20)
Ranged short bow +4 (1d4/x3)
STATISTICS
Str 11, Dex 15, Con 12, Int 10, Wis 9, Cha 6
Base Atk +1; CMB +0; CMD 12
Feats Improved Initiative
Skills Ride +10, Stealth +10, Swim +4; Racial Modifiers +4 Ride, +4 Stealth
Languages Goblin
ECOLOGY
Environment temperate forest and plains
Organization gang (4-9), warband (10-16) or tribe
Treasure NPC gear
DESCRIPTION
Small, cruel raiders with oversized heads, fond of fire, song and ambush.`,
  `Kobold CR 1/4
XP 100
LE Small humanoid (reptilian)
Init +1; Senses darkvision 60 ft.; Perception +5
DEFENSE
AC 15, touch 12, flat-footed 14 (+2 armor, +1 Dex, +1 natural, +1 size)
hp 5 (1d10)
Fort +2, Ref +1, Will -1
Weaknesses light sensitivity
OFFENSE
Speed 30 ft.
Melee spear +1 (1d6-1/x3)
Ranged sling +3 (1d3-1)
STATISTICS
Str 9, Dex 13, Con 10, Int 10, Wis 9, Cha 8
Base Atk +1; CMB -1; CMD 10
Feats Skill Focus (Perception)
Skills Craft (trapmaking) +6, Perception +5, Stealth +5; Racial Modifiers +2 Craft (trapmaking), +2 Perception
Languages Draconic
SQ crafty
ECOLOGY
Environment temperate underground or dense forest
Organization gang (2-4), nest (5-30) or tribe
Treasure NPC gear
DESCRIPTION
Small reptilian tunnel-dwellers who rely on traps and numbers.`,
  `Orc CR 1/3
XP 135
CE Medium humanoid (orc)
Init +0; Senses darkvision 60 ft.; Perception -1
DEFENSE
AC 13, touch 10, flat-footed 13 (+3 armor)
hp 6 (1d10+1)
Fort +3, Ref +0, Will -1
Defensive Abilities ferocity
Weaknesses light sensitivity
OFFENSE
Speed 30 ft.
Melee falchion +5 (2d4+4/18-20)
Ranged javelin +1 (1d6+3)
STATISTICS
Str 17, Dex 11, Con 12, Int 7, Wis 8, Cha 6
Base Atk +1; CMB +4; CMD 14
Feats Weapon Focus (falchion)
Skills Intimidate +2
Languages Common, Orc
SQ weapon familiarity
SPECIAL ABILITIES
Ferocity (Ex) Remains conscious and can keep fighting below 0 hit points, staggered and losing 1 hit point each round.`,
  `Hobgoblin CR 1/2
XP 200
LE Medium humanoid (goblinoid)
Init +2; Senses darkvision 60 ft.; Perception +2
DEFENSE
AC 16, touch 12, flat-footed 14 (+3 armor, +2 Dex, +1 shield)
hp 17 (1d10+7)
Fort +5, Ref +2, Will +1
OFFENSE
Speed 30 ft.
Melee longsword +4 (1d8+2/19-20)
Ranged longbow +3 (1d8/x3)
STATISTICS
Str 15, Dex 15, Con 16, Int 10, Wis 12, Cha 8
Base Atk +1; CMB +3; CMD 15
Feats Toughness
Skills Perception +2, Stealth +5; Racial Modifiers +4 Stealth
Languages Common, Goblin`,
  `Gnoll CR 1
XP 400
CE Medium humanoid (gnoll)
Init +0; Senses darkvision 60 ft.; Perception +2
DEFENSE
AC 15, touch 10, flat-footed 15 (+2 armor, +1 natural, +2 shield)
hp 11 (2d8+2)
Fort +4, Ref +0, Will +0
OFFENSE
Speed 30 ft.
Melee spear +3 (1d8+3/x3)
Ranged spear +1 (1d8+2/x3)
STATISTICS
Str 15, Dex 10, Con 13, Int 8, Wis 11, Cha 8
Base Atk +1; CMB +3; CMD 13
Feats Power Attack
Skills Perception +2
Languages Gnoll`,
  `Bugbear CR 2
XP 600
CE Medium humanoid (goblinoid)
Init +1; Senses darkvision 60 ft., scent; Perception +8
DEFENSE
AC 17, touch 11, flat-footed 16 (+2 armor, +1 Dex, +3 natural, +1 shield)
hp 16 (3d8+3)
Fort +2, Ref +4, Will +1
OFFENSE
Speed 30 ft.
Melee morningstar +5 (1d8+3)
Ranged javelin +3 (1d6+3)
STATISTICS
Str 16, Dex 13, Con 13, Int 10, Wis 10, Cha 9
Base Atk +2; CMB +5; CMD 16
Feats Intimidating Prowess, Skill Focus (Perception)
Skills Intimidate +7, Perception +8, Stealth +10; Racial Modifiers +4 Intimidate, +4 Stealth
Languages Common, Goblin`,
  `Bandit CR 1/2
XP 200
NE Medium humanoid (human)
Init +1; Senses Perception +0
DEFENSE
AC 14, touch 11, flat-footed 13 (+3 armor, +1 Dex)
hp 11 (2d10)
Fort +3, Ref +1, Will +0
OFFENSE
Speed 30 ft.
Melee short sword +4 (1d6+1/19-20)
Ranged light crossbow +3 (1d8/19-20)
STATISTICS
Str 13, Dex 13, Con 11, Int 10, Wis 10, Cha 8
Base Atk +2; CMB +3; CMD 14
Feats Weapon Focus (short sword), Point-Blank Shot
Skills Intimidate +3, Stealth +2
Languages Common
Gear studded leather, short sword, light crossbow with 10 bolts
DESCRIPTION
A highway robber: a human warrior who prefers an ambush to a fair fight.`,
  `Guard CR 1
XP 400
LN Medium humanoid (human)
Init +0; Senses Perception +4
DEFENSE
AC 16, touch 10, flat-footed 16 (+5 armor, +1 shield)
hp 19 (3d10+3)
Fort +4, Ref +1, Will +1
OFFENSE
Speed 20 ft.
Melee longsword +6 (1d8+2/19-20)
Ranged light crossbow +3 (1d8/19-20)
STATISTICS
Str 15, Dex 11, Con 12, Int 10, Wis 11, Cha 9
Base Atk +3; CMB +5; CMD 15
Feats Alertness, Weapon Focus (longsword)
Skills Intimidate +5, Perception +4, Sense Motive +2
Languages Common
Gear scale mail, light steel shield, longsword, light crossbow with 10 bolts
DESCRIPTION
A town watchman or caravan guard: a human warrior of 3rd level.`,
  `Skeleton CR 1/3
XP 135
NE Medium undead
Init +6; Senses darkvision 60 ft.; Perception +0
DEFENSE
AC 16, touch 12, flat-footed 14 (+2 armor, +2 Dex, +2 natural)
hp 4 (1d8)
Fort +0, Ref +2, Will +2
DR 5/bludgeoning; Immune cold, undead traits
OFFENSE
Speed 30 ft.
Melee broken scimitar +0 (1d6), claw -3 (1d4+1) or 2 claws +2 (1d4+2)
STATISTICS
Str 15, Dex 14, Con -, Int -, Wis 10, Cha 10
Base Atk +0; CMB +2; CMD 14
Feats Improved Initiative
Gear broken chain shirt, broken scimitar`,
  `Zombie CR 1/2
XP 200
NE Medium undead
Init +0; Senses darkvision 60 ft.; Perception +0
DEFENSE
AC 12, touch 10, flat-footed 12 (+2 natural)
hp 12 (2d8+3)
Fort +0, Ref +0, Will +3
DR 5/slashing; Immune undead traits
OFFENSE
Speed 30 ft.
Melee slam +4 (1d6+4)
STATISTICS
Str 17, Dex 10, Con -, Int -, Wis 10, Cha 10
Base Atk +1; CMB +4; CMD 14
Feats Toughness
SQ staggered
SPECIAL ABILITIES
Staggered (Ex) Can take only a single move or standard action each round, but can still charge.`,
  `Ghoul CR 1
XP 400
CE Medium undead
Init +2; Senses darkvision 60 ft.; Perception +7
DEFENSE
AC 14, touch 12, flat-footed 12 (+2 Dex, +2 natural)
hp 13 (2d8+4)
Fort +2, Ref +2, Will +5
Defensive Abilities channel resistance +2; Immune undead traits
OFFENSE
Speed 30 ft.
Melee bite +3 (1d6+1 plus disease and paralysis), 2 claws +3 (1d6+1 plus paralysis)
Special Attacks paralysis (1d4+1 rounds, DC 13, elves are immune)
STATISTICS
Str 13, Dex 15, Con -, Int 13, Wis 14, Cha 14
Base Atk +1; CMB +2; CMD 14
Feats Weapon Finesse
Skills Acrobatics +4, Climb +6, Perception +7, Stealth +7, Swim +3
Languages Common
SPECIAL ABILITIES
Disease (Su) Ghoul fever: bite, Fortitude DC 13, onset 1 day, frequency 1/day, effect 1d3 Con and 1d3 Dex damage, cure 2 consecutive saves.
Paralysis (Su) A creature hit by a bite or claw must make a DC 13 Fortitude save or be paralyzed for 1d4+1 rounds. Elves are immune.`,
  `Wight CR 3
XP 800
LE Medium undead
Init +1; Senses darkvision 60 ft.; Perception +11
DEFENSE
AC 15, touch 11, flat-footed 14 (+1 Dex, +4 natural)
hp 26 (4d8+8)
Fort +3, Ref +2, Will +5
Immune undead traits
Weaknesses resurrection vulnerability
OFFENSE
Speed 30 ft.
Melee slam +4 (1d4+1 plus energy drain)
Special Attacks create spawn, energy drain (1 level, DC 14)
STATISTICS
Str 12, Dex 12, Con -, Int 11, Wis 13, Cha 15
Base Atk +3; CMB +4; CMD 15
Feats Blind-Fight, Skill Focus (Perception)
Skills Intimidate +9, Knowledge (religion) +7, Perception +11, Stealth +16; Racial Modifiers +8 Stealth
Languages Common
SPECIAL ABILITIES
Energy Drain (Su) A creature hit by the slam gains 1 negative level (Fortitude DC 14 to remove after a day).
Create Spawn (Su) A humanoid slain by a wight rises as a wight in 1d4 rounds.`,
  `Shadow CR 3
XP 800
CE Medium undead (incorporeal)
Init +2; Senses darkvision 60 ft.; Perception +8
DEFENSE
AC 15, touch 15, flat-footed 12 (+2 deflection, +2 Dex, +1 dodge)
hp 19 (3d8+6)
Fort +3, Ref +3, Will +3
Defensive Abilities incorporeal, channel resistance +2; Immune undead traits
OFFENSE
Speed fly 40 ft. (good)
Melee incorporeal touch +4 (1d6 Strength damage)
Special Attacks create spawn
STATISTICS
Str -, Dex 14, Con -, Int 6, Wis 12, Cha 15
Base Atk +2; CMB +4; CMD 17
Feats Dodge, Skill Focus (Perception)
Skills Fly +11, Perception +8, Stealth +8
SPECIAL ABILITIES
Strength Damage (Su) The touch deals 1d6 Strength damage to a living creature; a creature reduced to Strength 0 dies.`,
  `Dire Rat CR 1/3
XP 135
N Small animal
Init +3; Senses low-light vision, scent; Perception +4
DEFENSE
AC 14, touch 14, flat-footed 11 (+3 Dex, +1 size)
hp 5 (1d8+1)
Fort +3, Ref +5, Will +1
OFFENSE
Speed 40 ft., climb 20 ft., swim 20 ft.
Melee bite +1 (1d4 plus disease)
STATISTICS
Str 10, Dex 17, Con 13, Int 2, Wis 13, Cha 4
Base Atk +0; CMB -1; CMD 12 (16 vs. trip)
Feats Skill Focus (Perception)
Skills Climb +11, Perception +4, Stealth +11, Swim +11
SPECIAL ABILITIES
Disease (Ex) Filth fever: bite, Fortitude DC 11, onset 1d3 days, frequency 1/day, effect 1d3 Dex and 1d3 Con damage, cure 2 consecutive saves.`,
  `Wolf CR 1
XP 400
N Medium animal
Init +2; Senses low-light vision, scent; Perception +8
DEFENSE
AC 14, touch 12, flat-footed 12 (+2 Dex, +2 natural)
hp 13 (2d8+4)
Fort +5, Ref +5, Will +1
OFFENSE
Speed 50 ft.
Melee bite +2 (1d6+1 plus trip)
STATISTICS
Str 13, Dex 15, Con 15, Int 2, Wis 12, Cha 6
Base Atk +1; CMB +2; CMD 14 (18 vs. trip)
Feats Skill Focus (Perception)
Skills Perception +8, Stealth +6, Survival +1 (+5 scent tracking)`,
  `Dire Wolf CR 3
XP 800
N Large animal
Init +2; Senses low-light vision, scent; Perception +10
DEFENSE
AC 14, touch 11, flat-footed 12 (+2 Dex, +3 natural, -1 size)
hp 37 (5d8+15)
Fort +7, Ref +6, Will +2
OFFENSE
Speed 50 ft.
Melee bite +7 (1d8+6 plus trip)
Space 10 ft.; Reach 5 ft.
STATISTICS
Str 19, Dex 15, Con 17, Int 2, Wis 12, Cha 10
Base Atk +3; CMB +8; CMD 20 (24 vs. trip)
Feats Run, Skill Focus (Perception), Weapon Focus (bite)
Skills Perception +10, Stealth +3, Survival +1`,
  `Boar CR 2
XP 600
N Medium animal
Init +0; Senses low-light vision, scent; Perception +6
DEFENSE
AC 14, touch 10, flat-footed 14 (+4 natural)
hp 18 (2d8+9)
Fort +6, Ref +3, Will +1
Defensive Abilities ferocity
OFFENSE
Speed 40 ft.
Melee gore +4 (1d8+4)
STATISTICS
Str 17, Dex 10, Con 17, Int 2, Wis 13, Cha 4
Base Atk +1; CMB +4; CMD 14
Feats Toughness
Skills Perception +6`,
  `Grizzly Bear CR 4
XP 1,200
N Large animal
Init +1; Senses low-light vision, scent; Perception +6
DEFENSE
AC 16, touch 10, flat-footed 15 (+1 Dex, +6 natural, -1 size)
hp 42 (5d8+20)
Fort +8, Ref +5, Will +2
OFFENSE
Speed 40 ft.
Melee 2 claws +7 (1d6+5 plus grab), bite +7 (1d6+5)
Space 10 ft.; Reach 5 ft.
STATISTICS
Str 21, Dex 13, Con 19, Int 2, Wis 12, Cha 6
Base Atk +3; CMB +9 (+13 grapple); CMD 20 (24 vs. trip)
Feats Endurance, Run, Skill Focus (Survival)
Skills Perception +6, Survival +5, Swim +14`,
  `Riding Horse CR 1
XP 400
N Large animal
Init +2; Senses low-light vision, scent; Perception +6
DEFENSE
AC 11, touch 11, flat-footed 9 (+2 Dex, -1 size)
hp 15 (2d8+6)
Fort +6, Ref +5, Will +1
OFFENSE
Speed 50 ft.
Melee 2 hooves -2 (1d4+1)
Space 10 ft.; Reach 5 ft.
STATISTICS
Str 16, Dex 14, Con 17, Int 2, Wis 13, Cha 7
Base Atk +1; CMB +5; CMD 17 (21 vs. trip)
Feats Endurance, Run
Skills Perception +6`,
  `Giant Spider CR 1
XP 400
N Medium vermin
Init +3; Senses darkvision 60 ft., tremorsense 60 ft.; Perception +4
DEFENSE
AC 14, touch 13, flat-footed 11 (+3 Dex, +1 natural)
hp 16 (3d8+3)
Fort +4, Ref +4, Will +1
Immune mind-affecting effects
OFFENSE
Speed 30 ft., climb 30 ft.
Melee bite +2 (1d6 plus poison)
Special Attacks web (+5 ranged, DC 12, 2 hp)
STATISTICS
Str 11, Dex 17, Con 12, Int -, Wis 10, Cha 2
Base Atk +2; CMB +2; CMD 15 (27 vs. trip)
Skills Climb +16, Perception +4, Stealth +7
SPECIAL ABILITIES
Poison (Ex) Bite: Fortitude DC 14, frequency 1/round for 4 rounds, effect 1d2 Strength damage, cure 1 save.`,
  `Giant Centipede CR 1/2
XP 200
N Medium vermin
Init +2; Senses darkvision 60 ft.; Perception +4
DEFENSE
AC 14, touch 12, flat-footed 12 (+2 Dex, +2 natural)
hp 5 (1d8+1)
Fort +3, Ref +2, Will +0
Immune mind-affecting effects
OFFENSE
Speed 40 ft., climb 40 ft.
Melee bite +2 (1d6-1 plus poison)
STATISTICS
Str 9, Dex 15, Con 12, Int -, Wis 10, Cha 2
Base Atk +0; CMB -1; CMD 11 (can't be tripped)
Feats Weapon Finesse
Skills Climb +10, Perception +4, Stealth +10
SPECIAL ABILITIES
Poison (Ex) Bite: Fortitude DC 13, frequency 1/round for 6 rounds, effect 1d3 Dexterity damage, cure 1 save.`,
  `Stirge CR 1/2
XP 200
N Tiny magical beast
Init +4; Senses darkvision 60 ft., low-light vision, scent; Perception +1
DEFENSE
AC 16, touch 16, flat-footed 12 (+4 Dex, +2 size)
hp 5 (1d10)
Fort +2, Ref +6, Will +1
OFFENSE
Speed 10 ft., fly 40 ft. (average)
Melee touch +7 (attach)
Space 2-1/2 ft.; Reach 0 ft.
Special Attacks blood drain
STATISTICS
Str 3, Dex 19, Con 10, Int 1, Wis 12, Cha 6
Base Atk +1; CMB +3 (+11 grapple when attached); CMD 9 (17 vs. trip)
Feats Weapon Finesse
Skills Fly +8, Stealth +16
SPECIAL ABILITIES
Attach (Ex) On a hit, latches on and is effectively grappling its prey; its AC drops to 12 while attached.
Blood Drain (Ex) Drains blood at the end of its turn while attached, dealing 1 Constitution damage; it flies off after dealing 4.`,
  `Gelatinous Cube CR 3
XP 800
N Large ooze
Init -5; Senses blindsight 60 ft.; Perception -5
DEFENSE
AC 4, touch 4, flat-footed 4 (-5 Dex, -1 size)
hp 50 (4d8+32)
Fort +9, Ref -4, Will -4
Immune electricity, ooze traits
OFFENSE
Speed 15 ft.
Melee slam +2 (1d6 plus 1d6 acid)
Space 10 ft.; Reach 5 ft.
Special Attacks engulf (DC 12, 1d6 acid and paralysis), paralysis (3d6 rounds, DC 20)
STATISTICS
Str 10, Dex 1, Con 26, Int -, Wis 1, Cha 1
Base Atk +3; CMB +4; CMD 9 (can't be tripped)
SQ transparent
SPECIAL ABILITIES
Engulf (Ex) Moves over creatures of its size or smaller, which must make a DC 12 Reflex save or be engulfed, paralyzed and take acid damage each round.
Transparent (Ex) A DC 15 Perception check is needed to notice a motionless cube.`,
  `Ogre CR 3
XP 800
CE Large humanoid (giant)
Init -1; Senses darkvision 60 ft., low-light vision; Perception +5
DEFENSE
AC 17, touch 8, flat-footed 17 (+4 armor, -1 Dex, +5 natural, -1 size)
hp 30 (4d8+12)
Fort +6, Ref +0, Will +3
OFFENSE
Speed 30 ft. (40 ft. base)
Melee greatclub +7 (2d8+7)
Ranged javelin +1 (1d8+5)
Space 10 ft.; Reach 10 ft.
STATISTICS
Str 21, Dex 8, Con 15, Int 6, Wis 10, Cha 7
Base Atk +3; CMB +9; CMD 18
Feats Iron Will, Toughness
Skills Climb +7, Perception +5
Languages Giant`,
  `Owlbear CR 4
XP 1,200
N Large magical beast
Init +5; Senses darkvision 60 ft., low-light vision, scent; Perception +12
DEFENSE
AC 15, touch 10, flat-footed 14 (+1 Dex, +5 natural, -1 size)
hp 47 (5d10+20)
Fort +8, Ref +5, Will +2
OFFENSE
Speed 30 ft.
Melee 2 claws +8 (1d6+4 plus grab), bite +8 (1d6+4)
Space 10 ft.; Reach 5 ft.
STATISTICS
Str 19, Dex 12, Con 18, Int 2, Wis 12, Cha 10
Base Atk +5; CMB +10 (+14 grapple); CMD 21 (25 vs. trip)
Feats Great Fortitude, Improved Initiative, Skill Focus (Perception)
Skills Perception +12`,
  `Gargoyle CR 4
XP 1,200
CE Medium monstrous humanoid (earth)
Init +6; Senses darkvision 60 ft.; Perception +5
DEFENSE
AC 16, touch 12, flat-footed 14 (+2 Dex, +4 natural)
hp 42 (5d10+15)
Fort +4, Ref +6, Will +4
DR 10/magic
OFFENSE
Speed 40 ft., fly 60 ft. (average)
Melee 2 claws +7 (1d6+2), bite +7 (1d4+2), gore +7 (1d4+2)
STATISTICS
Str 15, Dex 14, Con 16, Int 6, Wis 11, Cha 7
Base Atk +5; CMB +7; CMD 19
Feats Hover, Improved Initiative, Skill Focus (Fly)
Skills Fly +12, Stealth +11; Racial Modifiers +2 Stealth (+6 in stony areas)
Languages Common, Terran
SQ freeze`,
  `Minotaur CR 4
XP 1,200
CE Large monstrous humanoid
Init +0; Senses darkvision 60 ft.; Perception +10
DEFENSE
AC 14, touch 9, flat-footed 14 (+5 natural, -1 size)
hp 45 (6d10+12)
Fort +6, Ref +5, Will +5
Defensive Abilities natural cunning
OFFENSE
Speed 30 ft.
Melee greataxe +9/+4 (3d6+6/x3), gore +4 (1d6+2)
Space 10 ft.; Reach 10 ft.
Special Attacks powerful charge (gore +11, 2d6+6)
STATISTICS
Str 19, Dex 10, Con 15, Int 7, Wis 10, Cha 8
Base Atk +6; CMB +11; CMD 21
Feats Great Fortitude, Improved Bull Rush, Power Attack
Skills Intimidate +5, Perception +10, Stealth +2, Survival +10
Languages Giant`,
  `Mimic CR 4
XP 1,200
N Medium aberration (shapechanger)
Init +5; Senses darkvision 60 ft.; Perception +14
DEFENSE
AC 16, touch 11, flat-footed 15 (+1 Dex, +5 natural)
hp 52 (7d8+21)
Fort +5, Ref +5, Will +6
Immune acid
OFFENSE
Speed 10 ft.
Melee slam +10 (1d8+6 plus adhesive)
Special Attacks constrict (slam, 1d8+6)
STATISTICS
Str 19, Dex 12, Con 17, Int 10, Wis 13, Cha 10
Base Atk +5; CMB +9; CMD 20 (can't be tripped)
Feats Improved Initiative, Lightning Reflexes, Skill Focus (Perception), Weapon Focus (slam)
Skills Climb +14, Disguise +10 (+30 when mimicking objects), Knowledge (dungeoneering) +10, Perception +14
Languages Common
SQ mimic object
SPECIAL ABILITIES
Adhesive (Ex) A creature or weapon that touches the mimic sticks to it; a DC 17 Reflex save keeps a weapon free.`,
  `Basilisk CR 5
XP 1,600
N Medium magical beast
Init -1; Senses darkvision 60 ft., low-light vision; Perception +10
DEFENSE
AC 17, touch 9, flat-footed 17 (-1 Dex, +8 natural)
hp 52 (7d10+14)
Fort +9, Ref +4, Will +5
OFFENSE
Speed 20 ft.
Melee bite +10 (1d8+4)
Special Attacks gaze
STATISTICS
Str 16, Dex 8, Con 15, Int 2, Wis 13, Cha 11
Base Atk +7; CMB +10; CMD 19 (31 vs. trip)
Feats Blind-Fight, Great Fortitude, Iron Will, Skill Focus (Perception)
Skills Perception +10, Stealth +10; Racial Modifiers +4 Stealth
SPECIAL ABILITIES
Gaze (Su) Turns creatures within 30 feet to stone permanently; Fortitude DC 15 negates.`,
  `Troll CR 5
XP 1,600
CE Large humanoid (giant)
Init +2; Senses darkvision 60 ft., low-light vision, scent; Perception +8
DEFENSE
AC 16, touch 11, flat-footed 14 (+2 Dex, +5 natural, -1 size)
hp 63 (6d8+36); regeneration 5 (acid or fire)
Fort +11, Ref +4, Will +3
OFFENSE
Speed 30 ft.
Melee bite +8 (1d8+5), 2 claws +8 (1d6+5)
Space 10 ft.; Reach 10 ft.
Special Attacks rend (2 claws, 1d6+7)
STATISTICS
Str 21, Dex 14, Con 23, Int 6, Wis 9, Cha 6
Base Atk +4; CMB +10; CMD 22
Feats Intimidating Prowess, Iron Will, Skill Focus (Perception)
Skills Intimidate +9, Perception +8
Languages Giant
SPECIAL ABILITIES
Regeneration (Ex) Heals 5 hit points each round and cannot die unless its regeneration is stopped by acid or fire.`,
  `Imp CR 2
XP 600
LE Tiny outsider (devil, evil, extraplanar, lawful)
Init +3; Senses darkvision 60 ft., detect good, detect magic, see in darkness; Perception +7
DEFENSE
AC 17, touch 16, flat-footed 13 (+3 Dex, +1 dodge, +1 natural, +2 size)
hp 16 (3d10); fast healing 2
Fort +1, Ref +6, Will +4
DR 5/good or silver; Immune fire, poison; Resist acid 10, cold 10
OFFENSE
Speed 20 ft., fly 50 ft. (perfect)
Melee sting +8 (1d4 plus poison)
Space 2-1/2 ft.; Reach 0 ft.
Spell-Like Abilities (CL 6th)
Constant - detect good, detect magic
At will - invisibility (self only)
1/day - augury, suggestion (DC 15)
STATISTICS
Str 10, Dex 17, Con 10, Int 13, Wis 12, Cha 14
Base Atk +3; CMB +4; CMD 15
Feats Dodge, Weapon Finesse
Skills Acrobatics +9, Bluff +8, Fly +21, Knowledge (arcana) +7, Knowledge (planes) +7, Perception +7, Spellcraft +7
Languages Common, Infernal
SQ change shape
SPECIAL ABILITIES
Poison (Ex) Sting: Fortitude DC 13, frequency 1/round for 6 rounds, effect 1d2 Dexterity damage, cure 1 save.`,
  `Medium Fire Elemental CR 3
XP 800
N Medium outsider (elemental, extraplanar, fire)
Init +7; Senses darkvision 60 ft.; Perception +7
DEFENSE
AC 17, touch 14, flat-footed 13 (+3 Dex, +1 dodge, +3 natural)
hp 30 (4d10+8)
Fort +6, Ref +7, Will +1
Immune elemental traits, fire
Weaknesses vulnerability to cold
OFFENSE
Speed 50 ft.
Melee slam +7 (1d6+1 plus burn)
Special Attacks burn (1d6, DC 14)
STATISTICS
Str 12, Dex 17, Con 14, Int 4, Wis 11, Cha 11
Base Atk +4; CMB +5; CMD 19
Feats Dodge, Improved Initiative, Mobility, Weapon Finesse
Skills Acrobatics +8, Climb +5, Escape Artist +8, Intimidate +5, Perception +7
Languages Ignan`,
  `Hill Giant CR 7
XP 3,200
CE Large humanoid (giant)
Init -1; Senses low-light vision; Perception +6
DEFENSE
AC 21, touch 8, flat-footed 21 (+4 armor, -1 Dex, +9 natural, -1 size)
hp 85 (10d8+40)
Fort +11, Ref +2, Will +3
Defensive Abilities rock catching
OFFENSE
Speed 40 ft.
Melee greatclub +14/+9 (2d8+10) or 2 slams +13 (1d8+7)
Ranged rock +6 (1d8+10)
Space 10 ft.; Reach 10 ft.
Special Attacks rock throwing (120 ft.)
STATISTICS
Str 25, Dex 8, Con 19, Int 6, Wis 10, Cha 7
Base Atk +7; CMB +15; CMD 24
Feats Cleave, Intimidating Prowess, Martial Weapon Proficiency (greatclub), Power Attack, Weapon Focus (greatclub)
Skills Climb +10, Intimidate +9, Perception +6
Languages Giant`,
  `Young Red Dragon CR 10
XP 9,600
CE Large dragon (fire)
Init +4; Senses dragon senses, smoke vision; Perception +16
DEFENSE
AC 22, touch 9, flat-footed 22 (+13 natural, -1 size)
hp 115 (11d12+44)
Fort +11, Ref +7, Will +9
Immune fire, paralysis, sleep
Weaknesses vulnerability to cold
OFFENSE
Speed 40 ft., fly 200 ft. (poor)
Melee bite +18 (2d6+10), 2 claws +17 (1d8+7), 2 wings +12 (1d6+3), tail slap +12 (1d8+10)
Space 10 ft.; Reach 5 ft. (10 ft. with bite)
Special Attacks breath weapon (40-ft. cone, DC 19, 8d10 fire)
STATISTICS
Str 25, Dex 10, Con 19, Int 14, Wis 15, Cha 14
Base Atk +11; CMB +19; CMD 29 (33 vs. trip)
Feats Cleave, Improved Initiative, Improved Iron Will, Iron Will, Power Attack, Vital Strike
Skills Appraise +16, Bluff +16, Fly +8, Intimidate +16, Knowledge (arcana) +16, Perception +16, Sense Motive +16, Stealth +10
Languages Common, Draconic, Dwarven
SPECIAL ABILITIES
Breath Weapon (Su) A 40-foot cone of fire deals 8d10 fire damage (Reflex DC 19 half), usable once every 1d4 rounds.`,
];

export default BLOCKS.map((block) => monsterEntry(block));
