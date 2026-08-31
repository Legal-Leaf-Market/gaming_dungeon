# Art brief: Verda Studio

Everything here is **optional**. verdastudio.store is live and complete without a
single one of these files. Each row says what it adds, so you can do one, all, or
none, in any order.

The site is a map of a valley with ten doors in it. Each door is a room that
sells one kind of thing, and the whole conceit is that you are looking at a place
rather than at a shop. The hero already does that. **Everything below the hero
does not yet**, and that is the job: the page is a 1180px column centred in a
dark window, and on the desktop screens this site is actually read on there are
roughly 370 empty pixels down each side. Those gutters are the brief.

## How to hand art back

1. Generate it.
2. Drop the file in **`public/art/`** in the GitHub repo, using the **exact
   filename** in the tables below.
3. Tell me it is there.

The filenames are wired in already, so a file dropped at the right name appears
with no code change. Anything with a NEW filename needs one line from me, so tell
me which ones you added.

**Format:** PNG, transparent where the table says transparent. Send the biggest
version you have; I convert to WebP and size on my side, so do not optimise
first.

---

## The four rules that matter

**1. Never letter the artwork.** No words, no logos, no room names, no runes that
read as a real script. Every word on this site is HTML so it can be translated,
searched, read aloud and edited in a second. A picture with a name baked into it
is a picture I cannot change.

**2. No real game, console or franchise IP.** This is a gaming storefront, which
makes this the rule an image model will break without being asked to. No
recognisable character, console silhouette, controller shape that names a brand,
box art, logo, or costume. Draw **the feeling of the hobby**, never the products
of it. The test: if somebody can name it, regenerate it.

**3. Everything sits on near-black.** The page is `#12100f` and `#1a181d`. Art
must read on that, which means light-on-dark, generous rim light, and no white
backgrounds. Transparent PNG unless the table says otherwise. A piece that only
works on white is a piece I cannot place.

**4. Nothing may look like a UI element.** No buttons, panels, cursors, health
bars or icons that a visitor might try to click. The gutters are scenery. The
moment scenery looks interactive, the real interface gets harder to find.

---

## The world, so the art agrees with itself

This is the part worth reading twice. The site already has a consistent world and
the art needs to belong to it rather than decorate it.

**The valley.** A wide green river valley at the blue hour, cherry trees in
blossom, lanterns coming on. Mountains north and east. A river down the middle. A
few small settlements, one larger city far off, and an arcade in a corner that is
not selling anything. It is late, it is warm, and nothing is on fire. **This is
not a battlefield and not a dungeon.** The epic register here is *awe and depth
of history*, not danger.

**The five regions**, which are labelled on the map and are the strongest lore
hooks the site has. Somebody asked "what IS the Northern Wall?" without being
prompted, which is exactly the reaction to design for. Draw them as though the
answer exists and nobody has written it down:

| Region | What it is, for the art |
|---|---|
| **The Northern Wall** | The mountain range along the top. Read it as a wall somebody *built*, not a range that happened: too regular, too deliberate, with the seams of enormous stonework showing through the rock where the snow has come off. Nobody alive stacked those. Do not explain it. |
| **Greensleep** | The forested west. Old growth, deep moss, light coming down in shafts. The name says the forest is not dead, it is asleep, and the art should make you unsure which. Ruins under the roots, never in the open. |
| **The Eastern Reach** | The dry high country east. Thinner air, fewer trees, standing stones and long sightlines. The furthest edge of anything anybody maintains. |
| **The Lantern Quarter** | The settled south, where the map's scale bar sits. Warm, lived in, lantern light in windows, washing lines, boats. The only region with people in it. |
| **The Still Water** | The lake in the southeast. Absolutely flat, reflecting perfectly, and colder in tone than everything around it. Something is under it. Do not show what. |

**Lantern Water** is the river running north to south through the middle,
carrying reflected lantern light.

**The ten realms.** Every room flies a realm, and the realms are a cultivation
ladder borrowed from the owner's own game project. This is the spine of the whole
look: the ladder ascends, so the art should get **thinner, cleaner and colder as
the number goes up**. Realm 1 is earth and iron. Realm 10 is almost nothing at
all, and that is the point.

| # | Realm | Room | Band | The room's own line |
|---|---|---|---|---|
| 1 | Body Tempering | The Workshop | `#9b948a` | Flesh is the first furnace. |
| 2 | Qi Gathering | Play | `#78aadc` | Breath by breath, the sea fills. |
| 3 | Foundation Establishment | The Table | `#60b496` | What is built on stone endures. |
| 4 | Core Formation | Battlestation | `#5896eb` | A whirlpool learns to hold its center. |
| 5 | Golden Core | The Arcade Floor | `#e8be50` | A sun the size of a seed. |
| 6 | Nascent Soul | The Vault | `#be82eb` | The self that steps outside the self. |
| 7 | Soul Transformation | The Wardrobe | `#e278b4` | The river forgets it was rain. |
| 8 | Void Refinement | Power | `#6e6ea0` | Emptiness, polished until it shines. |
| 9 | Dao Integration | Audio | `#8cdcdc` | The way walks with you now. |
| 10 | Tribulation Transcendence | The Walls | `#f0f0fa` | The heavens themselves object. |

There is an eleventh band, `#ffe2a0`, Immortal Ascension, spent on the arcade:
"the last stair has no rail." It is the only room that sells nothing, and it gets
the highest colour on the ladder for that reason. If you make one piece warmer
and stranger than everything else, make it that one.

**The palette.** Work inside this. It is the site's, not a suggestion.

| Token | Hex | Use |
|---|---|---|
| void | `#12100f` | The deepest ground |
| night | `#1a181d` | Page background |
| surface | `#23212a` | Raised panels |
| jade | `#7fd0b0` | The primary living colour |
| lantern | `#fabf8e` | Warm light, windows, flame |
| blossom | `#c6968e` | Cherry, dusty rose |
| bough | `#453036` | Branch and shadow |
| text | `#f4ece6` | Warm off-white |

---

## Priority 1: the gutters

**This is the whole reason for the brief.** Everything below the hero is a
centred column on empty black, and on a 1920-wide screen that is ~370px of
nothing down each side. Filling it is the single biggest change available to how
this site feels.

Tall, narrow, transparent, and **deliberately quiet**: these sit beside body text
and must lose every fight with it. Think of them as the illuminated margin of a
manuscript rather than as a picture hung next to one.

| Filename | Size | Transparent | What it shows |
|---|---|---|---|
| `rail-left.webp` | 380 x 2400 | Yes | A vertical strip of valley read from top to bottom: the Northern Wall's stonework at the top, forest below it, the river entering, lanterns at the bottom. Very low contrast. Fades to nothing at both ends. |
| `rail-right.webp` | 380 x 2400 | Yes | Its counterpart on the east side: high country, standing stones, the lake, one far-off city silhouette. Same restraint. |

They must **fade out top and bottom** rather than ending on a hard edge, because
the page scrolls and they will be cut at an unpredictable point. Nothing
important within 200px of either end.

If tall art proves awkward, an alternative that also works: **six to eight small
transparent vignettes** I can scatter down the gutters at intervals, each
150-260px, named `gut-1.webp` through `gut-8.webp`. Say which you did.

---

## Priority 2: the ten room plates

Each room page has a header with the room's name, its epithet and its band
colour, and no art at all. A plate sits behind that header as texture.

Transparent, **1400 x 320**, and each one built around its realm's band colour
from the table above, on near-black. The composition should read from left to
right as *approach*, so the strongest part sits left where the heading is not.

| Filename | Room | Direction |
|---|---|---|
| `plate-workshop.webp` | The Workshop | Forge light, anvils, iron filings, a hand-built machine half finished. Realm 1: heaviest and most physical of the ten. |
| `plate-play.webp` | Play | Wind, breath, kites, the first air of morning. Realm 2: light and gathering. |
| `plate-tabletop.webp` | The Table | Cut stone, a long table, dice as carved knucklebones. Realm 3: foundation, solidity. |
| `plate-battlestation.webp` | Battlestation | A whirlpool held still. Concentric order, a calm centre. Realm 4. |
| `plate-arcade.webp` | The Arcade Floor | A small sun in a dark hall. Golden, warm, the only lit thing. Realm 5. |
| `plate-vault.webp` | The Vault | A figure and its double stepping out of it. Sealed boxes, shelves in the dark. Realm 6. |
| `plate-wardrobe.webp` | The Wardrobe | Cloth in motion, rain becoming river. Hanging fabric, no bodies. Realm 7. |
| `plate-power.webp` | Power | Polished emptiness. A single perfect void shape, cold and violet. Realm 8. |
| `plate-audio.webp` | Audio | A path walking itself. Ripples, standing waves, no equipment. Realm 9. |
| `plate-walls.webp` | The Walls | Sky objecting: lightning behind cloud, almost white, almost nothing. Realm 10 is the thinnest of the ten. |

**No product photography and no gear.** A speaker in the Audio plate would date
instantly and would compete with the real products underneath it. Draw the realm,
not the category.

---

## Priority 3: the ten realm sigils

Small marks, one per realm, used beside room names and in the map legend.

| Filename | Size | Transparent |
|---|---|---|
| `sigil-1.webp` … `sigil-10.webp` | 256 x 256 each | Yes |

One design language across all ten, ascending: **sigil 1 is thick, carved and
earthbound; sigil 10 is a single hairline that barely closes.** Each in its band
colour on transparent. They must be legible at 28px, which means very few
strokes. These are the most reusable thing in the brief.

---

## Priority 4: dividers and frame

| Filename | Size | Transparent | What |
|---|---|---|---|
| `divider-branch.webp` | 1400 x 120 | Yes | A blossom branch that tiles horizontally between sections. |
| `divider-range.webp` | 1400 x 90 | Yes | A distant mountain silhouette, very low contrast, for section breaks. |
| `corner-tl.webp` | 400 x 400 | Yes | An ornamental corner for the top-left of the map frame. I mirror it for the other three, so make it work mirrored. |
| `paper.webp` | 1200 x 1200 | No | A seamless dark parchment texture, used at very low opacity over panels. Must tile. |
| `compass.webp` | 512 x 512 | Yes | A compass rose in the site's language, replacing the plain one on the map. |

---

## Priority 5: the five region cartouches

Transparent, roughly 600 x 400, one per region, sitting faintly behind that
region's label on the map. These are where the "what IS the Northern Wall"
feeling gets made, so put the most thought here and the least detail.

`region-northern-wall.webp`, `region-greensleep.webp`,
`region-eastern-reach.webp`, `region-lantern-quarter.webp`,
`region-still-water.webp`

---

## Priority 6: social

Not used on the site.

| Filename | Size | Use |
|---|---|---|
| `social-square.webp` | 1080x1080 | Instagram, Pinterest |
| `social-story.webp` | 1080x1920 | Stories |
| `social-wide.webp` | 1200x630 | Link previews |

Leave the top ~15% and bottom ~20% of the story frame quiet: that is where the
platform puts its own caption and reply bar.

---

## What I am deliberately not asking for

- **Anything with words in it.** See rule 1.
- **A logo or wordmark.** The mark exists and the type is CSS.
- **Any real game, console or franchise.** Rule 2, repeated at the bottom because
  it is the one that will get broken.
- **Product photography or renders of gear.** Every product image comes live from
  the maker's own shop. A generated one would be inventing stock.
- **Characters or a cast.** The sister site has a cast; this one deliberately does
  not. The valley is empty of people at the scale we draw it, and that emptiness
  is doing work. Lantern light in a window implies somebody without showing them.
- **Anything frightening.** No monsters, no ruin-as-threat, no red skies. The
  register is *old, deep, and quiet*, which is a harder note to hit than menace
  and is worth much more here.
