# MTG

`easel.mtgtable.game` duplicates the Tabletop Simulator workshop mod "MTG 6 player table - scripted" (workshop id 2293586471) as an Easel application. It keeps the mod's six colored seats, table art, table objects and scripted tools, and reproduces them as a top-down PixiJS table. Like the mod, it is a manual tabletop: it moves cards and counters and automates the mod's table buttons, but it does not enforce the rules of Magic.

## Play

An installation administrator opens Applications, selects MTG and starts a table. Players join, then click a seat color in the toolbar (White, Red, Yellow, Green, Blue, Purple). Players at the top of the table see the table rotated toward them. Game roles work as in the other games: spectators watch and chat, but cannot take a seat.

The Deck importer accepts a deck link or a standard text deck list with optional Commander and Sideboard sections. Links work for Moxfield, Archidekt, TappedOut, MTGGoldfish, Scryfall, Deckstats, Deckbox, CubeCobra and Pastebin, and any other address that returns a plain deck list. Cards are looked up on Scryfall. The library is shuffled into the seat's library zone, commanders go to the two commander zones, and the sideboard goes beside the playmat. The Card spawner reproduces the mod's Scryfall search panel (name, CMC, power, toughness, colors, token/emblem/other).

The mod's chat commands also work:

- `scryfall <cardname>`, `print`, `text`, `legal`, `rules`, `search` and `random`
- `scryfall <deck link>` imports a deck
- `scryfall <image URL> <cardname>` spawns a card with custom art
- `scryfall back <image URL>` and `scryfall clear back` set or reset your card backs
- `playmat <image URL>` and `playmat clear` set or remove your seat's playmat, which everyone sees

Each seat has the mod's Draw, Scry, Mill, Untap and Reveal buttons and its Mulligan tile:

- Left click acts on one card, right click on three, and typing a number while hovering acts on that many.
- Scry puts cards into the seat's second hand zone.
- Reveal fans cards out in rows of twelve, or stacks them; right click switches between the two modes.
- Untap straightens every card on the playmat, with the mod's exceptions: Frozen, exerted and stunned cards, Mana Vault and the monoliths, "doesn't untap" text, and battles.
- Mulligan returns the hand, shuffles and deals seven. A right click deals one fewer each time. If cards are already on the playmat, it asks for confirmation.
- The numpad scripting keys match the mod: untap, draw, scry, mill, fanned reveal, stacked reveal, graveyard, exile, bottom of library, and end turn.

The library deck's context menu offers Cascade for X, Reveal until Type (both with a repeat count, accepted or declined with ✓/✗ on the revealed card) and Get Basic Land. Battlefield cards offer Make Token Copy and Cascade. Hand cards offer Sort Hand by CMC and Random Discard. The table menu offers the mod's "have a response", "could you not" and "hand counts".

Life trackers start at 40 and support the mod's ▲, ▼, ±20 and reset buttons. Commander zones count commander tax in steps of two. Each seat has a turn timer and turn counter, and its playmat is highlighted during its turn. Chat commands handle turns (`my turn`, `your turn blue`) and timers (`timers on/off`). The life commands are `everyone loses X`, `opponents lose X`, `drain X`, `extort X`, `set life X`, `reset life X` and `double my life X`. Turn Skipper pucks skip a player's turns while flipped.

The infinite bags along both sides of the table hand out commander damage counters, dice (d2–d20), keyword markers, Renowned/Monstrous/Frozen/Haste markers, suspend and mana counters, loyalty, +X/+Y and plain counters, text counters, notecards, drop-on-card counters, energy, experience and poison counters, Rhystic Block and Turn Skipper pucks, and Krark's Coin Flipper. The loose reminder cards are on the Green side: the dungeons, The Ring, Day/Night, Monarch, City's Blessing, the adventure, foretell, morph and manifest cards, and the turn order references. The dungeon and Ring cards track their room or level. Planechase unpacks its plane and phenomenon decks with a planar die. The Who goes first die picks a seated player.

Cards on the table also carry the Card Encoder modules from the mod's instructions: +1/+1 counters, a counter, power/toughness, keywords, stun counters, transform, exact copies, rulings, and Scryfall tokens and emblems.

Generic Tabletop Simulator handling also works:

- Drag a deck to take its top card; drag with Shift to move the whole deck.
- Dropping cards on a card or deck stacks them.
- F flips, Q and E rotate, R shuffles or rolls, G groups, Delete removes.
- Box select picks up several objects at once.
- Hold Alt over any visible card to enlarge it upright, or choose Inspect card from its context menu. Click a pinned inspection or press Escape to close.
- Rotate view left/right or the [ and ] keys rotate the camera in 45-degree steps around the current view center. Wheel zoom stays anchored under the pointer at every angle.
- View player area focuses and orients the camera toward any of the six seats. My seat and Whole table restore the standard views. Camera changes are private to your browser.

The table uses cast shadows, raised playmat edges, card highlights and layered deck edges to distinguish objects from the surface.

## Architecture

`server/rules.mjs` is the authoritative table. It stores every object, both hand zones for each seat, life totals, commander tax, turn and timer state, and the log in one `easel.mtgtable.Table` record. Each change is committed through the revision-checked `easel.mtgtable.Commit` automation. Each viewer receives a filtered snapshot. Other players' hands, the contents of every deck and the faces of face-down cards are never sent. A deck shows its top card only while it is face up. Deck searches are returned only to the player who searched, and are announced in the log.

`scripts/build-mtgtable.mjs` generates the table from the original save. It reads the workshop JSON and the Tabletop Simulator asset cache (by default `../Mods/Workshop/2293586471.json` and `../Mods`). It writes `client/layout.json` and `server/layout.mjs`, which hold the seat geometry, button positions, bags and loose objects. It also writes the cropped and resized images in `client/assets/`. The image work uses System.Drawing through Windows PowerShell. Card images the cache does not hold are loaded from `cards.scryfall.io`, because the mod's card CDN uses Scryfall's paths. The keyword icons are copied from the Magic application with their license.

```powershell
node scripts/build-mtgtable.mjs
```

Deck sites, custom card backs and playmats are read through Easel's `GET /api/fetch?url=` endpoint (`internal/server/fetch.go`). Most deck sites refuse direct browser requests, so the server fetches the address for a signed-in user and returns it from the same origin. This means the browser's security policy needs no extra hosts. The endpoint:

- accepts only `http` and `https` and follows at most five redirects
- times out after 20 seconds and caps responses at 16 MB
- refuses loopback, private, link-local and carrier-grade NAT addresses at connect time, so a table member cannot use the server to reach your local network
- marks returned content `nosniff` and sandboxed

The mod's Lua scripts are not executed. Their behavior was ported to JavaScript. Some parts of the mod are not reproduced:

- Its 3D room, physics and asset bundles.
- The experimental tools in "Pie's MTG Enablers", the draft hand rotators and the Eternities map.
- The Pirate Cannon.

## Verification

`TestTabletopMagicGame` covers the following against PostgreSQL:

- seating, deck import, mulligan, draw and scry
- seat button ownership and hand and library privacy
- mill, cascade, life chat commands and turns
- spectator chat and denial
- taking a die from a bag, persistence across a restart, and administrator reset

`TestTabletopMagicBrowser` runs `scripts/test-mtgtable-browser.mjs` in two Edge contexts. It creates the table from Applications, seats two players and imports a deck with mocked Scryfall responses. It then clicks the Draw and Mulligan buttons, drags a hand card onto the playmat, taps it with E and untaps it with the Untap button. It also checks hand privacy, sends chat life and turn commands, drags a d20 out of its bag, and checks phone width. It saves `bin/mtgtable.png`, `bin/mtgtable-guest.png` and `bin/mtgtable-mobile.png`.
