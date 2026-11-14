# Easel Kit Library Catalog — Revised Recommendation

**Status:** Architectural recommendation and member inventory, not frozen method signatures.  
**Owner:** `easel` for every name in this catalog.  
**Goal:** Supply a large selection of reusable, independently usable server interfaces and browser components for Eurogames, card games, simulation-heavy RPGs (such as GURPS), fiction-first RPGs (such as Blades in the Dark), and related applications.

## 1. What a Kit is

A **Kit is a library**: a named collection of related **individual building blocks**. Its contents are server interfaces and/or browser components. A Kit is **not** itself a building block, a unified behavior, a game subsystem, or an application feature. A module may compose building blocks to add a coherent feature; an application may select building blocks from many Kits and supply game-specific rules.

Importing a Kit makes the *catalog of available capabilities* visible. **Library implementation files are lazy-loaded**: importing the entire Kit does not load every interface/component implementation. Loading a selected member brings in only the implementation files required by that member. Members within a Kit may use one another, but they must not all become mandatory dependencies merely because they share a Kit name.

Kits do not require paired server and browser functionality. A purely visual component is valid; a calculation-only server interface is valid. A Kit's value comes from the choice of building blocks it offers.

### Terminology and naming

- Public qualified interface/component names use exactly `<owner>.<library>.<name>`, here `easel.cards.card` or `easel.cards.deck`.
- In the existing Easel terminology, the middle segment is the **host** (`cards`); the **namespace** is `owner.host` (`easel.cards`). The optional implementation-host argument accepted by `Easel.Interfaces.create(...)` is still a *two-segment* `owner.host`, not a public three-segment name.
- Server interface versions retain the existing `@integer` suffix: `easel.cards.deck@1`. The exact version is not a fourth name segment.
- Browser component and server-interface namespaces are separate; the same qualified name can exist in each registry when useful.
- A package/Kit may expose many qualified names. The Kit's package name and its members' public identifiers must not be confused.

### Composition example

A deck-building game might use `easel.cards.card`, `easel.cards.hand`, `easel.collections.ordered@1`, `easel.cards.shuffle@1`, `easel.resources.cost@1`, and `easel.turns.sequence@1`. The game or a purpose-built **module** decides what a purchase means, which cards are legal, how to score, what players may see, and how actions are wired. There is no `Kit.RunDeckbuildingGame()` and no requirement to load the rest of these libraries.

## 2. Requirements for an individual member

Each **member**, rather than each Kit as a whole, should be specified and implemented as a reusable unit:

1. **Identity:** public name, type (`server interface` or `browser component`), and interface version where applicable.
2. **Contract:** server methods with parameter/return/error descriptions; browser properties, locally emitted events, and slots.
3. **Behavior:** what the member provides, what it explicitly leaves to its consumer, and its handling of empty/invalid input.
4. **Dependencies:** precisely which other interfaces/components or core facilities it needs; no implicit dependency on every member of its Kit.
5. **Loading:** implementation entry/file(s) registered through the existing manifests and load stages; verify lazy loading and reuse of cached implementations.
6. **Tests:** contract, failure, independent-use, game-isolation and composition tests relevant to this member.

The entries below are the **recommended member inventory with brief responsibilities**. The coding agent must inspect the actual repository and turn each approved member into exact contracts before writing that member. Do not infer a complete server mutation API from a display component's presence or invent a new underlying infrastructure merely to complete the list.

## 3. Existing-engine boundaries

- **Sobek server code** implements server-side interfaces; HTML browser components own their visuals and emit local events. An application wires component events to authoritative server requests. Components do not execute game rules or write authoritative state.
- **Automations remain optional implementation tools**, not a mandatory part of a Kit. A module or an individual stateful member can use an automation when transactional game-record changes benefit from it. The existing automation engine cannot create, delete or enumerate records, invoke Sobek interfaces from its steps, or supply RNG. Do not invent these capabilities in a Kit.
- **Record schemas are optional and member-specific.** Importing a library of controls must not create game records. Do not require one record per card or one enormous table record; choose partitioning from update frequency, concurrency, ownership, membership and serialization requirements. For a 1,200–5,000-card table, benchmark realistic partitioning instead of assuming one shape.
- **Visibility is per-viewer server projection**, with permission to access/modify records handled by existing record/action security. There is no per-field database authorization. Secret values must be omitted from client-bound properties, events, previews and diffs; the server validates actions against complete authoritative state.
- **Membership has one authoritative representation per relationship.** Independent views such as hands, piles, regions and equipment panels should not each independently persist contradictory copies of who belongs where; consume a suitable collection/member representation or define one clear source of truth.
- **Randomness** used for fair dice, shuffles, weighted tables or random setup needs an approved server-side random service; the previously identified absence of such a service is a separate core prerequisite, not a mandate to add an RNG to each Kit.
- **Existing names are protected.** In particular, the current `easel.board` package and its `easel.board.Move`, `easel.board.Seat`, and `easel.board.Reset` automations must not be replaced or registered a second time. Use `easel.surfaces` for proposed general tabletop abstractions until compatibility is intentionally addressed.
- **Authorization remains operation-specific.** Do not grant all Kit automations to all members via a broad `automation.run` policy; checks must include the automation name, principal and permitted targets. Public cross-library calls use versioned server interfaces, not unversioned automation names.
- **Existing timers** are available through `Server.events.after/cancel`; a visual timer member should not build a replacement scheduler.

## 4. Recommended Kit catalog

Each entry below is a **library category**, not an integrated implementation requirement. `Server interfaces` and `Browser components` are independent member lists. The agent may implement a member without first implementing every other member listed in its Kit.

### Foundation and browser utility libraries

#### `easel.layout` — Containers and application layout widgets; rendering only unless the consumer elects to save layout preferences.

**Server interfaces** (each is independently versioned):
- `easel.layout.workspace@1` — Describe or validate a viewer's saved layout configuration; optional support for applications that persist layouts.

**Browser components:**
- `easel.layout.panel` — Collapsible panel with header/body/footer slots; emits open-change requests.
- `easel.layout.window` — Movable/resizable window with content and toolbar slots; emits move, resize and close requests.
- `easel.layout.tabs` — Tabbed content selector with per-tab slots and active-tab change events.
- `easel.layout.dialog` — Modal/nonmodal decision surface with content slot and action/cancel events.
- `easel.layout.split` — Resizable two-pane layout with first/second slots and ratio-change events.
- `easel.layout.sheet` — Responsive form/sheet container with configurable sections and field slots.

#### `easel.input` — Reusable local interaction controls; these report intent and never grant server permissions.

**Server interfaces** (each is independently versioned):
- `easel.input.intent@1` — Optional interface for describing/validating the shape of a client-requested interaction; not a game action executor.

**Browser components:**
- `easel.input.selection` — Single/multi-selection controller that emits selected identifiers.
- `easel.input.dragdrop` — Pointer/touch/keyboard drag source and target; emits requested drops and cancellation.
- `easel.input.contextmenu` — Contextual action list that emits the chosen action ID.
- `easel.input.targetpicker` — Choose one or several visible targets; reports the selection, not a completed action.
- `easel.input.shortcut` — Keyboard shortcut binding with conflict and focus handling.
- `easel.input.popover` — Anchored popup with outside-click and dismiss events.

#### `easel.display` — Small visual components that remain useful in any game genre.

**Server interfaces:** None required.

**Browser components:**
- `easel.display.image` — Image renderer with crop, aspect, placeholder and alternate-text properties.
- `easel.display.label` — Text label with icon, tooltip and style properties.
- `easel.display.badge` — Compact status/count/keyword indicator.
- `easel.display.tooltip` — Accessible hover/focus descriptive overlay.
- `easel.display.notification` — Dismissible notification/toast queue driven by caller-provided messages.
- `easel.display.portrait` — Framed image/avatar with optional status and overlay slots.

#### `easel.objects` — Generic identity, metadata and presentation helpers; not a mandatory base class for every game record.

**Server interfaces** (each is independently versioned):
- `easel.objects.reference@1` — Validate, format and resolve typed game references without treating IDs as authorization.
- `easel.objects.properties@1` — Read/write allowed generic object properties through the caller's chosen record model.
- `easel.objects.transform@1` — Compute orientation, scale and transforms without prescribing board rules.

**Browser components:**
- `easel.objects.inspector` — Display caller-provided projected properties and contextual actions.
- `easel.objects.propertylist` — Render a configurable read-only/editable property list and emit edit requests.
- `easel.objects.objecticon` — Small object representation with image, counters and state badges.

#### `easel.collections` — Independent ordered/unordered member containers, membership queries and transfer primitives.

**Server interfaces** (each is independently versioned):
- `easel.collections.ordered@1` — Create, query, insert, remove and reorder members in an ordered container.
- `easel.collections.set@1` — Create, query, add and remove unordered unique membership.
- `easel.collections.transfer@1` — Atomically move references between participating containers; do not duplicate membership ownership.
- `easel.collections.partition@1` — Represent paged or partitioned collections without assuming one record per member or one record per game.

**Browser components:**
- `easel.collections.list` — Render a sequence and emit selection/reorder requests.
- `easel.collections.strip` — Compact horizontal/vertical member presentation with overflow behavior.
- `easel.collections.stack` — Visual overlapping collection with count and top-item slots.
- `easel.collections.browser` — Searchable, sortable, filterable view of caller-supplied collection entries.

#### `easel.visibility` — Viewer-specific projection and disclosure helpers for game information; not database field ACLs.

**Server interfaces** (each is independently versioned):
- `easel.visibility.projection@1` — Build or assist in building an actor-specific safe representation from authoritative game state.
- `easel.visibility.disclosure@1` — Model in-game reveals/concealment and audiences without granting record permissions.

**Browser components:**
- `easel.visibility.concealed` — Show an already-projected known/unknown/face-down representation; never receives secret data.
- `easel.visibility.mask` — Render a visual mask over caller-authorized presentation data.
- `easel.visibility.reveal` — Temporary presentation of disclosed content, with close/request events.

### Tabletop and spatial libraries

#### `easel.surfaces` — Generic tabletop surfaces, coordinate systems and camera controls; separate from the existing Chess/Checkers board package.

**Server interfaces** (each is independently versioned):
- `easel.surfaces.geometry@1` — Coordinate transforms and bounds checks for freeform, square and hexagonal spaces.
- `easel.surfaces.position@1` — Query/update supported object positions using a consumer-chosen persistence model.
- `easel.surfaces.distance@1` — Measure distances and neighborhood relations under selectable geometry.

**Browser components:**
- `easel.surfaces.table` — Pan/zoom/rotate a freeform tabletop with scene/object/overlay slots.
- `easel.surfaces.squaregrid` — Draw and interact with square cells and optional coordinate labels.
- `easel.surfaces.hexgrid` — Draw and interact with pointy/flat hex cells and optional labels.
- `easel.surfaces.camera` — Reusable camera pan/zoom/rotation/focus controls with change events.
- `easel.surfaces.placement` — Preview a proposed placement and emit a requested position.

#### `easel.zones` — Spatial or logical regions used as drop targets, attachment points or group boundaries.

**Server interfaces** (each is independently versioned):
- `easel.zones.zone@1` — Describe region capacity, labels and acceptable member categories without defining game-specific legality.
- `easel.zones.slots@1` — Compute slot layouts and positions for a region.

**Browser components:**
- `easel.zones.region` — Draw a labeled game region using supplied geometry.
- `easel.zones.dropzone` — Drop target with allowed/denied/hover presentation and request events.
- `easel.zones.slots` — Arrange supplied member views in configured spatial slots.
- `easel.zones.highlight` — Draw temporary active/eligible/selected region highlight.

#### `easel.pieces` — Physical-looking movable artifacts: tokens, counters, tiles, meeples and miniatures.

**Server interfaces** (each is independently versioned):
- `easel.pieces.orientation@1` — Turn/flip/orient pieces under declared orientations.
- `easel.pieces.stacking@1` — Compute visual stack order and split intent while delegating actual membership to the chosen collection primitive.
- `easel.pieces.faces@1` — Select between predefined piece faces, when the game permits a flip.

**Browser components:**
- `easel.pieces.token` — Image/color/shape token with badges and select/move events.
- `easel.pieces.meeple` — Meeple representation with owner color, rotation and size.
- `easel.pieces.miniature` — Miniature/sprite view with facing, base, elevation and status overlays.
- `easel.pieces.tile` — One- or multi-face tile with edge/connector metadata supplied by the caller.
- `easel.pieces.stack` — Overlapping piece pile with count and split/take request events.

#### `easel.cards` — Independent card and collection presentations plus reusable card manipulations; no prescribed card-game rules.

**Server interfaces** (each is independently versioned):
- `easel.cards.card@1` — Card face/back, orientation and inspectable metadata operations on caller-selected records.
- `easel.cards.deck@1` — Deck ordering, top/bottom insertion, draw/deal intents and shuffle of an ordered collection.
- `easel.cards.hand@1` — Hand-oriented presentation/order support, including hand visibility conventions.
- `easel.cards.shuffle@1` — Randomize a sequence using an approved server-side random source; no hard-coded card model.

**Browser components:**
- `easel.cards.card` — Single front/back card renderer, selected state and inspect/flip request events.
- `easel.cards.hand` — Fan/row/stack card arrangement with selection and reorder requests.
- `easel.cards.pile` — Stacked card group with count, top/back visual and draw/drop requests.
- `easel.cards.deck` — Deck-back presentation with count and draw/shuffle action requests.
- `easel.cards.inspector` — Upright card examination independent of tabletop camera rotation.
- `easel.cards.fan` — Generic overlapping-card fan layout; can be reused outside hands.

#### `easel.dice` — Dice generation, representation and outcome interpretation utilities.

**Server interfaces** (each is independently versioned):
- `easel.dice.roller@1` — Generate server-authoritative standard/custom dice outcomes from the approved random source.
- `easel.dice.pool@1` — Describe and evaluate collections of heterogeneous dice, including reroll/keep/drop.
- `easel.dice.notation@1` — Parse and evaluate permitted dice expressions; explicitly define supported notation.
- `easel.dice.results@1` — Normalize, summarize and compare roll outcomes without choosing a game's success rule.

**Browser components:**
- `easel.dice.die` — 2D die face/shape renderer with roll request event.
- `easel.dice.tray` — Multi-die display with roll/reroll/clear requests.
- `easel.dice.results` — Outcome list showing individual dice and optional totals/details.
- `easel.dice.poolbuilder` — Controls to select counts and die types.

#### `easel.tracks` — Independent value, progress, segmented-clock and meter primitives.

**Server interfaces** (each is independently versioned):
- `easel.tracks.counter@1` — Adjust/reset a numeric value with declared bounds and overflow policy.
- `easel.tracks.progress@1` — Advance a linear sequence/track with completion thresholds.
- `easel.tracks.clock@1` — Advance or reduce segmented progress; supports fiction-first clocks without encoding a specific RPG.
- `easel.tracks.threshold@1` — Find crossings and milestones in a value progression.

**Browser components:**
- `easel.tracks.counter` — Numeric readout with optional plus/minus requests.
- `easel.tracks.meter` — Horizontal/vertical gauge with bounds, labels and thresholds.
- `easel.tracks.clock` — Segmented radial or linear progress clock with advance/retreat requests.
- `easel.tracks.track` — Numbered/ordered scoring or advancement track.
- `easel.tracks.timer` — Countdown/elapsed-time presentation; scheduling uses existing Server.events.after/cancel.

#### `easel.maps` — Exploration/tactical spatial representations, separate from any mandatory combat subsystem.

**Server interfaces** (each is independently versioned):
- `easel.maps.terrain@1` — Read terrain and movement-cost data from caller-supplied map regions.
- `easel.maps.geometry@1` — Line-of-sight, range, area and path geometry calculations.
- `easel.maps.path@1` — Find bounded routes across graph/grid terrain under supplied constraints.
- `easel.maps.vision@1` — Compute visible areas from supplied obstructions and observers.

**Browser components:**
- `easel.maps.map` — Layered map viewport with camera, tiles, features, objects and overlays.
- `easel.maps.ruler` — Measure distance or path length with interactive endpoints.
- `easel.maps.fog` — Render server-projected known/unknown map areas; not a security boundary itself.
- `easel.maps.waypoint` — Selectable path-node and waypoint overlays.

#### `easel.territory` — Area ownership, influence and control representations, useful beyond wargames.

**Server interfaces** (each is independently versioned):
- `easel.territory.influence@1` — Calculate influence distributions from supplied actors, weights and regions.
- `easel.territory.control@1` — Determine controller/contested status by a specified deterministic rule.

**Browser components:**
- `easel.territory.controlmap` — Color or pattern regions by projected ownership/control.
- `easel.territory.influence` — Display influence levels and contest indicators.
- `easel.territory.regionmarker` — Overlay an area label, scoring value or owner icon.

#### `easel.networks` — Graph and route primitives for train games, trade paths, skill trees and map navigation.

**Server interfaces** (each is independently versioned):
- `easel.networks.graph@1` — Nodes, edges, adjacency and connectivity operations.
- `easel.networks.route@1` — Find/test routes under supplied restrictions and costs.
- `easel.networks.capacity@1` — Evaluate edge/node capacity and utilization.

**Browser components:**
- `easel.networks.network` — Render nodes and edges with selection/connect request events.
- `easel.networks.route` — Highlight a selected path and alternative links.
- `easel.networks.node` — Standalone labeled node/connection anchor widget.

### Rules, state and play-flow utility libraries

#### `easel.resources` — Balances, prices and conversions shared by RPGs, card games and Eurogames.

**Server interfaces** (each is independently versioned):
- `easel.resources.pool@1` — Balance and debit/credit primitives for fungible resource types.
- `easel.resources.cost@1` — Validate/quote resource costs and affordability without performing a game-specific purchase.
- `easel.resources.exchange@1` — Evaluate resource conversions under supplied price and rounding rules.

**Browser components:**
- `easel.resources.resource` — Single resource icon/count with tooltip.
- `easel.resources.pool` — Display several resource balances.
- `easel.resources.cost` — List resource requirements with available/unavailable presentation.
- `easel.resources.exchange` — Choose quantities and preview a conversion.

#### `easel.turns` — Turn ordering, phases, round and priority primitives; individual games decide when advancement is legal.

**Server interfaces** (each is independently versioned):
- `easel.turns.sequence@1` — Determine active actor and next actor under a supplied ordering policy.
- `easel.turns.phase@1` — Represent and advance a configured sequence of named phases.
- `easel.turns.priority@1` — Track passing/claiming priority in interactive windows.
- `easel.turns.simultaneous@1` — Track per-participant submission/ready state for simultaneous phases.

**Browser components:**
- `easel.turns.turnorder` — Ordered players/participants with active/highlight states.
- `easel.turns.phase` — Phase progress indicator and advance request.
- `easel.turns.priority` — Show holders/pass states and emit pass/claim requests.
- `easel.turns.ready` — Per-participant waiting/ready indicators.

#### `easel.actions` — Candidate actions and decision presentation; no universal game action executor.

**Server interfaces** (each is independently versioned):
- `easel.actions.availability@1` — Evaluate caller-defined action availability from a provided context.
- `easel.actions.choice@1` — Represent enumerated options, prerequisites and selection constraints.
- `easel.actions.targeting@1` — Validate requested target shapes against caller-supplied allowed targets.

**Browser components:**
- `easel.actions.menu` — Show possible actions and emit selected action IDs.
- `easel.actions.chooser` — Choose one/many supplied options with descriptive content slots.
- `easel.actions.targetselector` — Select eligible visible targets and report the request.
- `easel.actions.actionbar` — Contextual buttons for currently available actions.

#### `easel.rules` — Small evaluation building blocks, not a general replacement for Easel automations or a universal rules engine.

**Server interfaces** (each is independently versioned):
- `easel.rules.predicate@1` — Evaluate reusable deterministic comparisons/conditions against supplied values.
- `easel.rules.modifier@1` — Compose ordered additive/multiplicative/override modifiers with explicit precedence.
- `easel.rules.threshold@1` — Evaluate success bands, degrees and graduated outcomes.
- `easel.rules.lookup@1` — Map rule symbols or statuses to resolved values.

**Browser components:**
- `easel.rules.modifierlist` — Explain applied bonuses, penalties and ordering.
- `easel.rules.outcome` — Present success, failure and partial-success results.
- `easel.rules.condition` — Display supplied rule conditions and why they hold/do not hold.

#### `easel.effects` — Status/effect presentation and timing helpers, with game-defined meaning.

**Server interfaces** (each is independently versioned):
- `easel.effects.duration@1` — Compute duration/expiry from a declared time or phase basis.
- `easel.effects.stacking@1` — Combine/reject overlapping effects according to selected policy.
- `easel.effects.status@1` — Read/project the current effect descriptors of a subject.

**Browser components:**
- `easel.effects.status` — Status icon/chip with details and duration.
- `easel.effects.effectlist` — List active effects with dispel/inspect requests.
- `easel.effects.duration` — Human-friendly remaining-duration badge.

#### `easel.tables` — Lookup, weighted-choice and reference-table utilities, from loot tables to board-game events.

**Server interfaces** (each is independently versioned):
- `easel.tables.lookup@1` — Evaluate keyed/ranged table entries.
- `easel.tables.weighted@1` — Choose weighted entries using approved server randomness.
- `easel.tables.rolltable@1` — Interpret a dice outcome against a configured range table.

**Browser components:**
- `easel.tables.table` — Generic sortable reference/lookup table.
- `easel.tables.rolltable` — Present an entry, roll request and resolved result.
- `easel.tables.entry` — Compact row/card for a resolved table item.

#### `easel.workflow` — Presentation and state helpers for multi-step decisions; the game/module supplies the actual process.

**Server interfaces** (each is independently versioned):
- `easel.workflow.steps@1` — Validate/configure a named ordered set of prompts and transitions.
- `easel.workflow.responses@1` — Aggregate per-participant answer states and detect completion.
- `easel.workflow.timeout@1` — Compute deadline/expiry outcomes, using existing scheduling for callbacks.

**Browser components:**
- `easel.workflow.wizard` — Multi-step form flow with next/back/cancel requests.
- `easel.workflow.prompt` — Choice/input prompt with validation errors and response request.
- `easel.workflow.waiting` — Display outstanding responders and ready states.
- `easel.workflow.review` — Review collected answers before submit/commit request.

### RPG, economic and progression libraries

#### `easel.characters` — Character presentation and stat-related utilities; no prescribed GURPS/BitD schema.

**Server interfaces** (each is independently versioned):
- `easel.characters.attributes@1` — Read/evaluate typed primary or derived attribute descriptors.
- `easel.characters.skills@1` — Evaluate skill ranks/ratings and their contributing modifiers.
- `easel.characters.traits@1` — Enumerate and query traits, tags and qualities.
- `easel.characters.derived@1` — Compute derived values from explicitly supplied inputs/dependency rules.

**Browser components:**
- `easel.characters.sheet` — Configurable character-sheet layout, supplied fields and actions.
- `easel.characters.attribute` — Labeled attribute value/editor widget.
- `easel.characters.skilllist` — List skills/ratings and optional modifiers.
- `easel.characters.traitlist` — Display tags, traits and descriptors.
- `easel.characters.playbook` — Configurable narrative-style character/playbook layout; no game-specific moves.

#### `easel.inventory` — Item organization and equipment displays; actual membership may use Collections.

**Server interfaces** (each is independently versioned):
- `easel.inventory.capacity@1` — Calculate weight, volume or slot usage under supplied rules.
- `easel.inventory.equipment@1` — Represent occupied equipment slots and equipment conflicts.
- `easel.inventory.container@1` — Represent nested holding places through collection references.

**Browser components:**
- `easel.inventory.inventory` — Grid/list of item views with move/equip request events.
- `easel.inventory.equipment` — Equipment slot display with equip/unequip requests.
- `easel.inventory.container` — Expandable nested items view.
- `easel.inventory.item` — Item summary with quantity, tags and actions.

#### `easel.combat` — Generic tactical/combat calculations and UI, not a required model of combat for all RPGs.

**Server interfaces** (each is independently versioned):
- `easel.combat.initiative@1` — Determine order/priority from a supplied system policy.
- `easel.combat.attack@1` — Resolve supplied attack/defense inputs; detailed semantics defined by consuming game.
- `easel.combat.damage@1` — Apply deterministic reductions/thresholds to a supplied damage result.
- `easel.combat.range@1` — Compute attack distances, arcs and cover from supplied geometry.

**Browser components:**
- `easel.combat.encounter` — List participants, encounter status and turn controls.
- `easel.combat.initiative` — Initiative or priority order strip.
- `easel.combat.target` — Show selected targets, ranges and cover.
- `easel.combat.damage` — Damage, armor, resistance and consequence breakdown.

#### `easel.narrative` — Text/scene/story presentations and general collaborative note utilities.

**Server interfaces** (each is independently versioned):
- `easel.narrative.scene@1` — Read/organize named scenes and references without imposing a storytelling process.
- `easel.narrative.journal@1` — Format/search entry metadata supplied by the game.
- `easel.narrative.tags@1` — Index/filter descriptive tags and relationships.

**Browser components:**
- `easel.narrative.journal` — Rich journal/notes reader with edit requests.
- `easel.narrative.scene` — Scene header/participants/description layout.
- `easel.narrative.handout` — Viewer-projected handout/document presentation.
- `easel.narrative.relationship` — Relationship/connection view for factions or characters.

#### `easel.economy` — Prices, offers and bids as reusable independent primitives, not a marketplace subsystem.

**Server interfaces** (each is independently versioned):
- `easel.economy.quote@1` — Calculate/revalidate a price quote from supplied inputs.
- `easel.economy.offer@1` — Describe, validate and expire an exchange offer.
- `easel.economy.bid@1` — Represent bid comparison, winning bid and minimum increment rules.
- `easel.economy.allocation@1` — Compute distribution for a completed bidding or sale round.

**Browser components:**
- `easel.economy.market` — Offer grid/list with quote and buy requests.
- `easel.economy.offer` — A tradable offer with accepted quantities and response actions.
- `easel.economy.auction` — Auction display with bids, countdown and bid request.
- `easel.economy.price` — Compact price/cost display with currency/resource icons.

#### `easel.progression` — Independent advancement trees, budgets, point buy and milestone utilities.

**Server interfaces** (each is independently versioned):
- `easel.progression.tree@1` — Check prerequisite relationships and available nodes in a directed graph.
- `easel.progression.budget@1` — Evaluate point budgets and stepped purchase/refund costs.
- `easel.progression.milestone@1` — Track eligible milestones and thresholds.
- `easel.progression.allocation@1` — Compute purchasable distributions under caps and prerequisites.

**Browser components:**
- `easel.progression.tree` — Interactive unlock/skill/technology tree with node selection requests.
- `easel.progression.pointbuy` — Attribute/ability cost builder with remaining-point calculation.
- `easel.progression.milestones` — Progression milestones and unlock state.
- `easel.progression.buildsummary` — Cost breakdown and selected-build review.

## 5. What should be a module rather than a Kit

A **module** is appropriate for a coherent behavior assembled from member building blocks, with rules, records, events, permissions, and possibly automations. Examples:

| Feature/module example | Possible reusable library members |
| --- | --- |
| Worker placement | `easel.zones.slots`, `easel.pieces.meeple`, `easel.actions.availability@1`, `easel.resources.cost@1` |
| Deck building | `easel.cards.deck@1`, `easel.cards.hand`, `easel.collections.ordered@1`, `easel.economy.market`, `easel.resources.pool@1` |
| Card drafting | `easel.cards.hand`, `easel.actions.chooser`, `easel.collections.transfer@1`, `easel.turns.simultaneous@1` |
| Area control rules | `easel.territory.control@1`, `easel.territory.controlmap`, `easel.resources.pool@1` |
| Eurogame auction | `easel.economy.bid@1`, `easel.economy.auction`, `easel.resources.cost@1` |
| GURPS-like tactical play | `easel.characters.sheet`, `easel.maps.geometry@1`, `easel.dice.roller@1`, `easel.combat.damage@1` |
| Blades-like score / downtime | `easel.characters.playbook`, `easel.dice.pool@1`, `easel.tracks.clock`, `easel.workflow.prompt` |

There should **not** be a required all-in-one Kit implementing each of these. A game may make its own composition or install a convenient module that already composes them.

## 6. Coding-agent execution plan

1. **Audit before creating names.** Inspect `Easel/` (not `_Easel/`), the existing Kit manifests and loading stages, `design/interfaces.md`, `design/component.md`, `manifest.md`, the Board and Pixi Kits, and the core automation/security APIs. Inventory implemented, partial and conflicting member names.
2. **Prove lazy loading.** Import one Kit containing multiple declared members and verify that importing it loads no member implementation files. Access exactly one member and verify only its required files load. Access another, verify additional on-demand loading; subsequent access should reuse the already-loaded implementation.
3. **Start with a small set of useful building blocks:** selection/drag-and-drop, ordered collections, card/card-hand/card-pile visual components, shuffle/deck functions, viewer projections, tabletop camera. Implement each as an independent member with its own tested contract. Do not turn them into a monolithic Cards or Table subsystem.
4. **Use the existing MTG Table application as an integration test**, not as a request to make a new sample game or to hard-code Magic rules into libraries. Consume selected members and verify six-seat interactions, private hands, face-up/down rendering, inspection and camera behavior. Benchmark partitioned state with realistic card counts and concurrent actions.
5. **Add members on demand** from the catalog. Complete and stabilize the exact contracts of members actually used before freezing the rest. Do not build all the contents of one Kit simply because one member is wanted.
6. **Separate module work.** If the agent begins coding a complete game mechanic, pause and classify it: is it a generic independently usable interface/component, or a module/application composition? Put it in the correct place.
7. **Maintain a member-by-member inventory** with status (`planned`, `specified`, `implemented`, `tested`, `used`), declared dependencies, load entry, and contract location. Success is measured in usable library members, not '35 Kits completed'.

## 7. Definition of done

**For a member:** It is publicly declared under the exact three-part name, loads lazily, has its contract documented, has working behavior and relevant tests, uses existing Easel lifecycle/security/services correctly, can be consumed independently, and does not accidentally load unrelated Kit members.

**For a Kit:** It presents a coherent, discoverable catalog of such members, all accessible by import without eager implementation loading. The Kit need not have a shared database schema, shared state, automation suite, or singular purpose beyond grouping related building blocks.

**For a module:** It combines chosen members to implement behavior, includes any necessary game-specific coordination and state changes, and is tested as a functional unit. A module is not part of this library-member completion criterion.

## 8. Items requiring explicit decisions before implementation

- Verify manifest/client loading details against current code rather than inventing new manifest fields or a new importer.
- Confirm or implement an approved server random source before shipping shuffled decks, dice rolls or weighted random tables.
- Define concrete data partitioning and collection membership for high-cardinality tabletops from measurements, not from a universal object schema.
- Choose individual method signatures and JSON schemas as each member becomes approved; this catalog intentionally does not freeze them all at once.
