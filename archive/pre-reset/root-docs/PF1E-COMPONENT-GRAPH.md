# PF1e component graph

The diagrams below record the structure before VTT integration. For the updated graph, Actor inheritance, interaction roles and live bindings, see [the current integration document](Easel/design/pf1e-vtt.md).

This is an editable architecture map, not an implementation plan. Current graphs describe the source inspected on October 29, 2026. The final graph describes the existing requirements, not an approved replacement architecture.

Arrows run from a provider to its consumer: `A --> B` means B is built using A. Dashed arrows describe intended connections that do not currently exist. Grouped boxes collect related interfaces; they do not imply one implementation or dependency between every member. Runtime flows are explicitly labeled separately.

## 1. Current package structure

```mermaid
flowchart BT
    Platform["Easel platform<br/>Go / Sobek / records / security / events / automations"]
    DB[(PostgreSQL)]
    CoreRules["Core server kits<br/>dice / effects / rules / characters / resources"]
    CoreViews["Core browser kits<br/>layout / narrative / collections / combat"]
    D20["d20 kit<br/>calculators and browser widgets"]
    Maps["Map and visibility kits<br/>geometry / vision / projection / map view"]
    Pixi["Pixi rendering kit"]
    PFServer["pf1e.rules module: server<br/>records / policies / rules / game / session / automations"]
    PFClient["pf1e.rules module: browser<br/>controller / sheets / editor / tab panels"]
    App["pf1e.game application<br/>server and browser entry points"]
    VTT["vtt.table module<br/>records / policies / server table operations"]
    DB --> Platform
    Platform --> PFServer
    Platform --> VTT
    CoreRules --> PFServer
    D20 --> PFServer
    Maps --> PFServer
    CoreViews --> PFClient
    D20 --> PFClient
    Pixi --> Maps
    Maps --> PFClient
    PFServer --> App
    PFClient --> App
    Maps --> VTT
    VTT -. "not connected" .-> App
```

The platform provides runtime and persistence services; it is not another gameplay kit. Core kits are independently selectable tools. The d20 kit is also a set of independent tools, not a runtime that owns the game. Most PF1e behavior currently lives in the module rather than the application.

Locations relative to `Easel/server/easel/`:

| Box | Source |
|---|---|
| Core kits | `server/library/<kit>/` |
| d20 | `server/library/d20/` |
| Pixi | `modules/pixi/` |
| PF1e server/browser module | `modules/pf1e/` |
| VTT server module | `modules/vtt/` |
| PF1e application | `applications/pf1e/` |

## 2. Current server construction

```mermaid
flowchart BT
    Schema["schemas.json<br/>Actor / Character / NPC / Item / Feature<br/>Class / ClassLevel / Spellbook / Spell / Buff / Action"]
    Generated["Easel record classes"]
    Base["ActorBase<br/>collect modifiers and context notes"]
    Conditions["ActorConditions<br/>expand conditions and state flags"]
    Derived["ActorDerived<br/>procedural derived-stat calculation"]
    Config["rules-config.mjs<br/>PF1e tables / helper calculations<br/>declarative derived definitions"]
    Stack["effects.stacking@1"]
    D20Math["d20 abilities@1 / defense@1<br/>health@1 / spellbook@1 requested too"]
    Layers["library.mjs<br/>export record subclasses and mix in layer methods<br/>define automations during loading"]
    Session["session.mjs<br/>event handlers / record edits / viewer state"]
    Game["game.mjs<br/>start session / roll coordination / automation calls"]
    Dice["dice roller@1 / notation@1<br/>d20 check@1"]
    Auto["automations.mjs<br/>damage / uses / rest / turn effects / transfer item"]
    Security["security.mjs<br/>policies and viewer projection"]
    Parser["statblock.mjs<br/>text-to-data parser"]
    Entry["applications/pf1e/server/application.mjs"]
    Schema --> Generated
    Base --> Conditions
    Conditions --> Derived
    Config --> Conditions
    Config --> Derived
    Stack --> Derived
    D20Math --> Derived
    Derived --> Layers
    Generated --> Layers
    Auto --> Layers
    Layers --> Session
    Security --> Session
    Session --> Game
    Dice --> Game
    Auto --> Game
    Parser --> Game
    Game --> Entry
```

Important qualifications:

- `ActorDerived` requests health and spellbook tools but does not actually use those tool instances to build its returned derived state.
- `characters.derived@1` exists in the core library, but the current actor calculation does not run through it. The declarative definitions and procedural calculation are separate paths.
- The graph shows construction, not a clean separation of responsibilities. Game and Session also call one another at runtime.
- Statblock parsing is present; live import into saved actor/child records is not connected.
- Items have a parallel physical-layer branch: `ItemPhysical`, `WeaponPhysical`, `ArmorPhysical`, mixed into exported record classes by `library.mjs`.

## 3. Current browser composition

```mermaid
flowchart BT
    Pixi["graphics.pixi@1"]
    Map["maps.map@1"]
    Workspace["layout.vttworkspace@1<br/>canvas / tools / windows / sidebar / HUD / dice overlay slots"]
    Chrome["layout.window@1 / tabs@1 / toolstrip@1"]
    Sidebar["narrative.chatlog@1<br/>combat.encounter@1<br/>collections.directory@1 / compendium@1<br/>dice.dicesettings@1"]
    Dice["dice.dicebox@1"]
    D20Widgets["d20 abilityblock / defensebanner / vitality<br/>equipmentslots / spellbook / rolldialog"]
    GenericWidgets["rules.modifierlist@1<br/>narrative.richtext@1"]
    Panels["PF1e tab rendering functions<br/>Summary / Attributes / Combat / Inventory<br/>Features / Skills / Spellbooks / Buffs<br/>Biography / Notes / Settings"]
    Sheet["PF1e CharacterSheet<br/>tab navigation / panel assembly / named widget slots"]
    NPC["PF1e NPCSheet<br/>full / lite / loot views"]
    Editor["PF1e RecordEditor<br/>description / details / actions / modifiers / charges"]
    Controller["PF1e Controller<br/>construct views / fill slots / connect UI events<br/>send intents / receive state"]
    Entry["applications/pf1e/client/application.mjs"]
    Pixi --> Map
    Panels --> Sheet
    Sheet --> NPC
    Sheet --> Controller
    NPC --> Controller
    Editor --> Controller
    D20Widgets --> Controller
    GenericWidgets --> Controller
    GenericWidgets --> Editor
    Map --> Controller
    Workspace --> Controller
    Chrome --> Controller
    Sidebar --> Controller
    Dice --> Controller
    Controller --> Entry
```

The controller creates many of the widgets and attaches them to slots exposed by the sheet. The sheet does not independently build all of its contents. Character tab navigation is handwritten in `charactersheet.mjs` despite the manifest requiring the generic tabs interface. The directory currently opens the character-sheet route for every actor; a separate NPC route exists in the controller but is not selected there.

Map, encounter and compendium components are mounted, but mounting does not establish saved scenes, combat behavior or content loading. Several sheet events have no controller listener; several controller requests have no registered server handler.

## 4. Current record-edit runtime flow

This diagram uses arrows for execution/data flow, not dependency direction.

```mermaid
sequenceDiagram
    participant View as Browser widget or sheet
    participant Controller as PF1e controller
    participant Transport as Easel event transport
    participant Session as PF1e server session
    participant Records as Easel records / security / PostgreSQL
    View->>Controller: Local intent
    Controller->>Transport: PF1e application event
    Transport->>Session: Authorized connection and payload
    Session->>Records: Check permission, assign fields, save
    Session-->>Transport: changed notification
    Transport-->>Controller: changed
    Controller->>Transport: refresh
    Transport->>Session: refresh for this viewer
    Session->>Records: Load records and calculate/project sheet state
    Session-->>Transport: Viewer-specific state
    Transport-->>Controller: state
    Controller->>View: Update properties
```

The reusable widget emits an intent; the controller connects it to the application's server event. Browser widgets should not directly persist game records. Current PF1e refresh rebuilds actor/child state, rather than delivering incremental record updates.

## 5. Structure described by the existing requirements

This is a design under discussion. It is not the current implementation and is not a request to approve it unchanged.

```mermaid
flowchart BT
    Platform["Easel platform<br/>record schemas / persistence / security<br/>events / transactions / automations / interfaces"]
    Math["Core calculation kits<br/>formula / modifier / stacking / derived graph<br/>dice / resources"]
    MapTools["Core map and disclosure kits<br/>geometry / movement / vision / fog / projection"]
    UI["Core browser kits<br/>workspace / windows / tabs / directories<br/>chat / dice / map rendering"]
    D20["d20 kit<br/>stateless d20 calculators and UI widgets"]
    VTT["VTT module<br/>scene / token / wall / fog / combat / chat<br/>journal / folder / settings records<br/>server behavior and browser binders"]
    Shared["WotC OGL 3.5 module<br/>shared actor and item records / layers / policies<br/>progression / conditions / actions / spellcasting<br/>automations and shared sheet panels"]
    PF["PF1e application<br/>PF1e records and rule overrides<br/>skills / CMB-CMD / traits / favored class<br/>sheets / workspace composition / importers / content"]
    Platform --> VTT
    Platform --> Shared
    Platform --> PF
    Math --> D20
    Math --> Shared
    MapTools --> VTT
    UI --> VTT
    D20 --> Shared
    Shared --> PF
    VTT --> PF
    D20 --> PF
    UI --> PF
```

Dependencies on a grouped kit box mean selected tools as needed, not that every interface depends on every other tool. VTT and shared rules are sibling modules. The application composes them and supplies actor, initiative, movement and visibility hooks; VTT should not import PF1e rules. The exact owner of each adapter is still a design choice.

| Tier | Owns | Does not own |
|---|---|---|
| Platform | Runtime, schema enforcement, storage, permission engine, transaction and event infrastructure | Pathfinder rules |
| Core server kit | Pure calculations over supplied values | Record loading/saving, game ownership or networking |
| Core browser kit | Rendering, local interaction and declared UI events | Authoritative game state or persistence |
| d20 kit | Reusable d20 math and widgets | Campaign records or the game session |
| VTT module | Persistent tabletop entities and their behavior | Pathfinder-specific character rules |
| Shared rules module | Shared 3.5/PF1e records, mechanics, mutations and panels | PF1e-only differences or workspace layout |
| PF1e application | Game-specific rules, records, presentation and composition | Generic tools already owned below it |

## 6. Boundaries available to rearrange

- Whether to introduce the shared 3.5 module now, or keep PF1e rules in the application until another game needs them. The existing requirements choose the shared module; the current implementation has neither that split nor application ownership.
- Whether character calculations should be composed from record layers, a declarative derived graph, or layers that supply inputs/configuration to one graph. Avoid two independent authoritative calculations for the same statistic.
- Whether shared panels belong in the rules module or a separate presentation package. Pure generic widgets should remain in kits either way.
- Where the application-to-VTT adapters live and exactly what actor, initiative, vision and turn-effect contracts they expose.
- Whether content importing is a separate component from content storage/browsing. Text parsing, validated record creation, pack management and drag-and-drop are distinct responsibilities.

These are architectural choices to settle bottom up before adding more features. No source code or requirement files were changed to impose an answer.
