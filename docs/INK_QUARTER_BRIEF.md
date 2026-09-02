# The Ink Quarter: brief for the black and white redesign

For the image model that made the current art. Everything this repository
cannot make for itself is in here: the exact files, the exact pixel sizes, one
prompt each, and the words.

Read section 0, then section 6, then the file you are about to draw. Sections
1 to 5 are the specification; section 7 onward is what happens on this side
once the files land, and is here so you can see which of your decisions cost
code and which cost nothing.

---

## 0. The instruction, and the two halves of it

The owner, looking at the live front page and at `/battlestation`:

> Keep the website in these photos exactly the same format, but change the
> wording, the outlines and the photo in the background to a calligraphy inky
> black and white design. And remember this is a gaming website.

**"Same format" is the constraint and it is the easy half to lose.** The
layout does not move. Same hero at the same aspect, same header, same map,
same room heading, same search row, same two facet rows, same card grid, same
footer. This is a change of MEDIUM, not of structure. A plate that arrives at
a different aspect ratio, or a comp that adds a section, is out of scope and
gets sent back, however good it is.

**"Remember this is a gaming website"** resolved, in the room, to: *you are
designing for gamers.* That is section 6, and it is the section to read if you
only read one.

Three things are being changed and they are separable. Do them in this order,
because each one makes the next easier to judge:

| | What | Where |
|---|---|---|
| **1** | The background art | the hero plate, the seven city plates, ten room plates, two gutter rails |
| **2** | The outlines | every border, frame, chip and card edge becomes a brush edge |
| **3** | The wording | the hero copy, the ten room lines, the meta description |

---

## 1. How to hand work back

1. Generate it.
2. Drop the file in the GitHub repo at the **exact path and exact filename**
   in the tables below. Most of them are wired in already, so a file at the
   right name appears with no code change at all.
3. Say which ones you added. Anything with a new filename needs a line of CSS
   on this side, and a plate at the wrong aspect needs a conversation.

**Format:** WebP with real alpha where the table says transparent, PNG where
it says opaque. Send the biggest version you have; conversion and sizing
happen here.

**Never optimise first, and never hand back a file this repository generates.**
`favicon.ico`, every `icon-*.png`, `og.png`, `manifest.webmanifest`,
`public/sitemap.xml`, `public/assets/ink-frame.svg`, `enso.svg`, `paper.svg`
and all nine `city-*.svg` are outputs of `npm run branding`, `npm run sitemap`,
`npm run ink` and `node tools/city.mjs`. A hand-made copy of a generated file
is a fork nobody can see is a fork, and a byte-compare test fails on it.

---

## 2. The one decision that comes before any drawing

Black and white on this site can mean two opposite pictures, and only one of
them is a redesign rather than a rebuild.

**WHITE INK ON BLACK. A rubbing, not a scroll.** The site's ground stays dark
and the brushwork is the pale thing on it.

Three reasons, and the third is the one that decides it:

1. **Every reading surface here is already light on dark.** Text, hairlines,
   card edges, the whole of `tokens.css`. Inverting the ground means rewriting
   every one of them and re-checking contrast on 1,368 product cards.
2. **The hero's own machinery paints dark over the art.** The panel that holds
   the live headline is a near-opaque `rgba(12,20,32,...)` gradient laid across
   the left of the painting. On a paper-toned plate that panel is a black box
   sitting on a white page.
3. **Because the ink layer already owns paper, and it should keep it.** Hover
   anything on this site today and it turns to paper and ink for as long as
   you touch it. If the resting page is already paper, that gesture has
   nothing left to reveal and the best idea the site has had is deleted by the
   redesign that was supposed to extend it.

So: **the page is a stone rubbing, and hover flips it to the paper positive.**
Same drawing, negative and positive, one gesture apart. That costs zero lines
in `public/css/ink.css`, which is the file that would otherwise have been
thrown away.

### The palette, once and for all

Warm-neutral, because sumi ink is a warm black and a cool grey reads as
photography rather than as pigment.

| Token | Now | Becomes | Is |
|---|---|---|---|
| `--void` | `#12100f` | `#0c0b0a` | deepest ground |
| `--night` | `#1a181d` | `#131211` | page |
| `--surface` | `#23212a` | `#1c1a19` | raised panels |
| `--surface-2` | `#2a2c38` | `#262422` | |
| `--surface-3` | `#343446` | `#33302d` | |
| `--text` | `#f4ece6` | `#f2efe4` | the paper colour, now the ink-white |
| `--text-dim` | `#c2aca6` | `#b8b2a4` | |
| `--text-faint` | `#8a7477` | `#7d7870` | |
| `--line` | rose at .14 | `rgba(242,239,228,.14)` | hairlines, three steps |

### The one colour that survives, and why it is not zero

**Seal vermilion, `#c8442e`.** One colour, in the one place a calligrapher
puts one: the chop.

This is not a compromise on "black and white". The site runs a category rule
that is load-bearing: **jade is us, amber is the world.** Anything you can
press is the interface colour; money and warmth are the world's colour. Strip
both to grey and a price looks like a button. So vermilion inherits jade's
job exactly, on the interface and nothing else, and the world's warmth is
carried by VALUE instead of hue: prices and counts sit at a bone white, one
step brighter than body copy.

If the owner wants literally zero colour, that is one edit here and the
fallback is written down: pressable things take the enso ring (`enso.svg`,
already in the repo) as their tell instead. Shape carries what hue was
carrying. Do not simply grey the vermilion out and leave it there; that is the
version where nothing tells a button from a price.

### The twelve realm bands, which are DATA and nearly got deleted

Every room flies one of twelve realms from the owner's game, and the band
colour is a claim about meaning, not decoration. Twelve hues cannot survive
a monochrome pass as hues, and greying them to one value silently kills the
room identity system.

So the ladder becomes a **value ladder**, which is what the ladder already
meant: realm 1 is earth and iron, realm 12 is almost nothing at all. Dark and
heavy at the bottom, near-paper and hairline at the top.

```
 1 #5c564d   2 #6a645a   3 #787167   4 #857f74
 5 #938c81   6 #a19a8e   7 #afa89b   8 #bdb5a8
 9 #cbc3b5  10 #d8d0c2  11 #e6decf  12 #f4ecdc
```

The four rarity grades on a card's left edge do the same: `common #7d7870`,
`fine #a49c8f`, `rare #cfc6b4`, `precious #f2ead8`, and precious additionally
gets the seal dot, because the top grade needs to survive a glance.

---

## 3. The four things that make it read as drawn

Any one of these dropped and the whole thing collapses back into a greyscale
filter, which is the exact failure this site has already paid for once.

| | |
|---|---|
| **Paper, not white** | `#f2efe4` with grain, blended multiply. A flat `#fff` is a dialog box; paper is a material. This is the ink-white on the dark ground too. |
| **Ink, not black** | `#15120e`. The colour of a dried stroke, never `#000`. |
| **An edge that swells and thins** | A drawn line has no single width, and one width is precisely what "sterile" means. Every border in the brief is a stroke, not a rule. |
| **Nothing floats** | Ink on paper casts no shadow. Where the art has a lift or a glow, it is wrong. |

Four more that belong to calligraphy specifically:

- **Negative space is a subject.** The mist, the sky and the water are
  unpainted paper, not painted grey. The most valuable thing you can put in
  the far half of any of these plates is nothing.
- **Flying white.** A fast dry stroke tears and leaves streaks of ground
  inside itself. It is the single cheapest tell that a human hand made the
  mark, and an image model will smooth it away unless it is asked for.
- **One gesture per object.** A pagoda roof is one loaded stroke that lifts at
  the tip, not an outline filled in. If a shape looks traced, it is traced.
- **The value ladder does the depth, not the haze.** Each layer sits about 40
  percent of the way from the one in front toward the mist. Step them too far
  apart and four bands read as one dark mass. This site learned that on the
  vector scene and it is just as true in wash.

---

## 4. The art, file by file

### 4a. THE HERO. This is the big one

`public/verda-hero/`, artboard **1680 x 936, exactly.** It is the largest
thing anybody sees and it is what the whole page is coloured from.

**Deliver it WITHOUT any lettering in the artwork, and read this before
deciding otherwise.**

The current hero has the headline, the body copy, both buttons, the brand and
the badge painted into the image. That decision costs 430 lines of CSS whose
whole job is compensating for it: the live words are clipped out of view but
kept in the document for screen readers, two transparent anchors are
positioned over the painted buttons by percentage, a near-opaque panel blots
the painted copy at every window under 1280px, and the live header is turned
invisible so it does not print the brand name twice a few pixels off the
painted one.

**And it makes the wording unchangeable, which is one of the three things this
brief was commissioned to change.** Every edit to the hero copy becomes a new
render.

So the ask is a plate with the left third QUIET: a wash, mist, unpainted paper
tone, nothing that competes with type. The live HTML copy sits on it, the
buttons become real buttons again, and the wording is editable forever after.

| File | Size | Opaque | What |
|---|---|---|---|
| `hero-ink.png` | 1680 x 936 | yes | The quarter from up in the cherry, in ink |

> **hero-ink.png** — Sumi-e ink wash landscape, warm-black ink on a dark
> stone-rubbing ground, no colour anywhere. Seen from up inside an old cherry
> tree on a ridge, looking down through its branches at a mountain town: a
> single snow-capped peak right of centre, a low disc of sun behind it as an
> unpainted circle, tiered pagoda roofs and tiled eaves stepping down a valley
> below, a few paper lanterns as small unpainted points. Cherry branches enter
> from the top-left and top-right corners in wet black wood with blossom drawn
> as small dry-brush rings, the wood crossing in front of half the flowers so
> the branch reads through the bloom. The left third of the frame is quiet:
> mist and unpainted ground, no detail, nothing that competes with type. Bold
> loaded strokes in the near branches, pale broken strokes in the far
> mountains, flying white in the fast strokes, no outline-and-fill anywhere,
> no shading, no gradient mesh, no texture overlay. Absolutely no text, no
> letters, no calligraphy characters, no signature, no seal. Exact 1680:936
> aspect, fully opaque, warm-black and paper-white only.

**If lettering is kept in the plate anyway**, these four numbers are not
negotiable and everything that reads them is percentages of the artboard:

- Painted header bottom edge at or above **8%** of the height.
- Rightmost painted word ends at or before **43%** of the width.
- "Walk the map" button box: **left 6.55%, top 85.55%, width 10.42%, height 6.73%.**
- "The arcade" button box: **left 17.70%, top 85.55%, width 9.05%, height 6.73%.**

And the painted words must be the words in section 5 **verbatim**, because the
live copy in the document has to say exactly what the picture says.

### 4b. THE SEVEN CITY PLATES

The background of every page that is not the front page, including the
`/battlestation` screenshot. Seven layers, back to front, each optional, each
dropping in with no code change at `public/assets/paint/<name>.webp`.

`docs/SCENE_ART_BRIEF.md` is the full brief for these and **every hard
requirement in it still holds**: exact aspect, horizontal tiling, a flat
bottom row, real alpha, the budget. Only the palette changes. The vector
versions are committed at `public/assets/city-*.svg`; open them first, because
a plate that matches their silhouette drops straight in and one that does not
will not line up with the layers around it.

| File | Ratio | Bottom row | What |
|---|---|---|---|
| `crag.webp` | 2400 x 760 | `#5a554c` | distant peaks, palest, mostly unpainted |
| `far.webp` | 2400 x 620 | `#3d3934` | the upper city, pagoda towers on a terrace |
| `mid.webp` | 2400 x 560 | `#262320` | the quarter, the great hall, the bridge |
| `near.webp` | 2400 x 420 | `#100f0e` | foreground eaves, hung lanterns, wettest ink |
| `canopy-far.webp` | 2400 x 1500 | transparent | cherry, furthest: thin pale wood, full height |
| `canopy-mid.webp` | 2400 x 1120 | transparent | cherry, middle: most of the mass |
| `canopy-near.webp` | 2400 x 780 | transparent | cherry, nearest: heavy black wood |

Under 400 KB each, under 1.6 MB for all seven. These load on a phone before
anything else on the page is worth looking at.

**Paint the distance IN.** The three canopies are separated by pigment, not by
opacity: the far one is a pale grey wash, the near one is wet black. Do not
hand back the same drawing three times and expect the site to fade it, because
opacity bleeds the city through the flowers when the brief is to see it
through the gaps.

**Blossom in ink is drawn by what you leave unpainted.** A thin broken ring
and a dry dot, five to a flower, separation between them. Two earlier attempts
at these in colour came back with the words "cotton candy" and "clouds"; the
fix both times was separation and visible branches through the gaps.

### 4c. THE TEN ROOM PLATES

`public/art/plate-<key>.webp`, **1400 x 320, transparent**, sitting behind a
room's heading at 22 percent opacity. Composition reads left to right as
approach, with the mass on the left where the heading is not.

They are already committed in colour and each needs an ink counterpart at the
same filename. Keys, in the order they appear on the map:

`plate-arcade`, `plate-play`, `plate-tabletop`, `plate-battlestation`,
`plate-workshop`, `plate-audio`, `plate-power`, `plate-vault`,
`plate-wardrobe`, `plate-walls`.

`VERDA_ART_BRIEF.md` holds what each one shows and the realm behind it. In ink
they get one further rule: **the plate is one gesture and some space.** At 22
percent on a near-black page, detail is invisible and only silhouette and
value survive. A plate you notice before the heading has won a fight it was
supposed to lose.

### 4d. THE GUTTER RAILS

`public/art/rail-left.webp` and `rail-right.webp`, **380 x 2400,
transparent**, shown at 42 percent down the empty sides of the page above
1420px wide.

A vertical ink scroll read top to bottom: mountain, forest, river, lanterns on
the left; high country, standing stones, still water, a far city on the right.
Very low contrast, fading to nothing at both ends, nothing important within
200px of either end because the page scrolls and they are cut at an
unpredictable point.

### 4e. THE TEN SIGILS AND THE FURNITURE

| File | Size | Transparent | What |
|---|---|---|---|
| `art/sigil-1.webp` … `sigil-10.webp` | 256 x 256 | yes | one brush mark per realm |
| `art/divider-branch.webp` | 1400 x 120 | yes | a blossom branch, tiles horizontally |
| `art/divider-range.webp` | 1400 x 90 | yes | a distant range, very low contrast |
| `art/corner-tl.webp` | 400 x 400 | yes | map frame corner, must work mirrored |
| `art/paper.webp` | 1200 x 1200 | no | seamless dark ink-stone texture, must tile |
| `art/compass.webp` | 512 x 512 | yes | a compass rose in brush |

The sigils are the most reusable thing in the brief and the hardest. One
design language across all ten, ascending: **sigil 1 is a thick wet mark that
barely lifts off the paper; sigil 10 is a single dry hairline that does not
quite close.** They must be legible at 28px, which means very few strokes.

### 4f. THE OUTLINES, and what NOT to send

The frames, the card edges, the chip borders. There is already a brush frame
in this repo and it is **generated**: `npm run ink` writes
`public/assets/ink-frame.svg` (240 x 240 viewBox, consumed as a `border-image`
with a 34-unit slice), `enso.svg` (200 x 200) and `paper.svg` (a 180px
turbulence tile), and six inked keyframes are inlined into
`public/css/ink-anim.css` as data URIs.

**So do not hand back replacements for those three files.** They would be
overwritten by the next generator run, and the animation frames would go out
of step with them silently.

Send reference instead, and the generator gets retuned here to match it:

| File | Size | Transparent | What |
|---|---|---|---|
| `ref/ink-strokes.png` | 2048 x 2048 | yes | a sheet of real brush marks |

One sheet, warm-black on transparent, containing: four horizontal strokes at
different speeds (one wet, one dry with flying white, two between); four
vertical; two square corners where the brush overruns the turn; one full enso
ring closed with a gap; one small filled seal square; one hairline stroke at
the thinnest a brush holds. Nothing arranged prettily, no page design. It is a
specimen, and what it is for is getting the swell, the tear and the overrun
right in `tools/ink.mjs` rather than approximating them.

---

## 5. The wording

The hero copy today is set at golden hour and says so: lanterns going on, the
makers setting out what they carry. In an ink world "lanterns going on" is a
line about a picture that is no longer there, so the copy moves with the art.

**The rules, and two of them are enforced by tests:**

- **No em dashes.** Anywhere in shipped copy. Comma, colon or full stop.
  `test/copy.test.mjs` fails on one.
- **The workshop does not talk in front of the customer.** No file names, no
  source paths, no operator instructions in anything a shopper can load. Same
  test.
- **The words stay in the document.** Whatever the art says, the HTML says
  too. A screen reader, find-in-page and a crawler all have to reach it.
- **The room lines live in two files and the two must agree**: `ROOMS` in
  `public/js/app.js` and `ROOMS_META` in `api/_scene.js`. Change one, change
  both, same commit.

### The hero

| | Now | Proposed |
|---|---|---|
| Headline | A room to *wander*. | A room to *wander*. |
| Buttons | Walk the map / The arcade | Walk the map / The arcade |

The headline and both buttons stay. They are three words, four words and two
words, they are already right, and changing a working headline because the
paint changed is how a redesign turns into a rewrite.

The lede is the part that moves:

> You climbed the old cherry on the ridge and never came down. The whole
> quarter is laid out below in wet ink: the makers setting out what they
> carry, and an arcade in the corner that is not selling you anything.
> Nothing here takes your money. Every door opens onto the maker's own shop.

That last sentence is the affiliate disclosure doing double duty as scene
setting, and it stays in whatever the rewrite. It is the honest version of a
thing most sites bury in a footnote.

`<meta name="description">` and `og:description` in `index.html`,
`disclosure.html`, `privacy.html` and `terms.html` follow the same edit. So
does `og:image:alt`, which currently describes a coin door.

### The ten room lines

The names and the epithets do not change. The epithets are verbatim from the
owner's own game and they are the one piece of writing on this site nobody
should touch.

The blurbs are already in the right voice and they are the reason section 6
exists. Leave them alone:

```
The Arcade Floor  Cabinets, sticks, and everything that used to eat quarters.
Play              Games, keys and the things you actually play.
The Table         Dice, decks, minis and the four hours you lost to them.
Battlestation     The desk. Boards, mice, screens, chairs.
The Workshop      Parts, printers and the rig you keep almost finishing.
Audio             Amps, cans and speakers worth the shelf.
Power             Chargers, cables, and the brick you keep losing.
The Vault         Figures, manga, plush and things kept in the box.
The Wardrobe      What you wear to the thing.
The Walls         Canvas, wallpaper and the things that make it a room.
```

**If you propose a rewrite of these, propose one that is MORE concrete, never
less.** See below.

---

## 6. Who this is for

This is a shop for people who own arcade sticks, keycap sets, dice, 3D
printers, figures and a chair they researched for a week. The brief was
"GameStop meets Disc Replay meets every arcade you have ever loved". It is a
room to wander, not a search box over a price table, and the arcade in the
corner is not a novelty feature, it is the thesis.

**Five things follow from that, and the first one is the whole section.**

**1. The ink is the frame. The gear is the subject. Never abstract the nouns.**
The single most likely way this redesign fails is that "calligraphy" gets
applied to the writing as well as to the pictures, and "Dice, decks, minis and
the four hours you lost to them" becomes something about brushes and scrolls
and the way of the wanderer. That line is good precisely because it is a list
of objects and a joke about a Saturday. A shopper needs to know what is in the
room. Ink is a look, not a vocabulary.

**2. No real game, console or franchise IP.** This is the rule an image model
breaks without being asked to. No recognisable character, no console
silhouette, no controller shape that names a brand, no box art, no logo, no
costume. Draw the FEELING of the hobby: the glow off a cabinet marquee, a
six-button layout, a keycap profile, the facets of a twenty-sided die, a
printer gantry mid-move. The test: **if somebody can name it, draw it again.**

**3. The products are full-colour photographs and they always will be.** Every
card on the shelf is a photo from the merchant's own shop, 1,368 of them on
the battlestation page alone, shot by fifty different people under fifty
different lights. That is the real argument for this whole direction: a
monochrome chrome makes fifty mismatched photo styles read as a deliberate
collection instead of a jumble, which is something the current colour build
cannot do. So the art must never compete with a product photo, and the card
edge must frame one without tinting it.

**4. It is read at night, at speed, on a big screen.** People scroll a grid.
Everything in the gutters and behind the headings has to lose every fight with
the type and the photographs. If you can point at where the haze starts, it is
too strong.

**5. The register is old, deep and quiet.** Not danger. No monsters, no red
sky, no ruin as threat. Somebody asked "what IS the Northern Wall?" without
being prompted, and that reaction is worth more than any amount of menace.

---

## 7. What happens on this side when the files land

Listed so you can see which of your choices are free and which are not.

| Your delivery | Costs here |
|---|---|
| Any `art/*.webp` or `assets/paint/*.webp` at the right name and ratio | nothing. It appears. |
| A hero with no lettering | `hero-golden.css` loses the hit areas, the cover gradients and the clip; `test/hero.test.mjs` is rewritten to assert the live copy is visible rather than compensated for |
| A hero with lettering | the four percentages in section 4a get re-measured against the new plate, and the live copy is retyped to match it word for word |
| The palette in section 2 | `public/css/tokens.css`, and `city-sky.css` regenerated from `tools/city.mjs` |
| Brush edges at rest instead of on hover | `tools/ink.mjs` emits a paper-white frame beside the dark one; `ink.css` is untouched and keeps the hover flip |
| `ref/ink-strokes.png` | `tools/ink.mjs` retuned, `npm run ink`, six keyframes regenerated |
| A redrawn brand mark | `public/assets/mark.svg` is parsed by `tools/branding.mjs`, which draws **axis-aligned rects, circles and ellipses only and throws on a `<path>`**. A brush mark cannot go in it without teaching that file to draw one. Send the mark as `brand-logo.png` instead, which is what the large icons and the share card are already cut from, then `npm run branding` |

Everything else in section 12 of `CLAUDE.md` still applies, and three of those
bite here specifically: `ink.css` stays the last stylesheet on every page, no
build step is ever added, and nothing hand-edits a generated file.

---

## 8. The order to work in

1. **The hero.** It is the largest surface, it is what the palette gets
   sampled from, and it is the one file that settles whether the direction is
   right. Nothing else is worth drawing until it is approved.
2. **`ref/ink-strokes.png`.** Cheap, and it unblocks every border on the site.
3. **`mid.webp` and `near.webp`**, the two city plates that carry the room
   pages. Judge them on `/battlestation`, not in isolation.
4. **The three canopies**, which are the hardest and the most likely to come
   back as cotton candy.
5. **`crag.webp` and `far.webp`.**
6. **The two rails**, then the ten room plates, then the ten sigils.
7. The furniture in 4e, last, and only if the rest has landed.

## 9. Verifying

- `npm test` is 166 cases. **14 of them are already red on this branch** for
  reasons that have nothing to do with the art: AWIN link building, the ingest
  chain, the probe, and one dev-server route. Compare against that baseline
  rather than expecting green, and do not "fix" them as part of this work. The
  ones that will speak up if something in this brief is done wrong: `hero`,
  `ink`, `copy`, `branding`, `canopy`.
- `npm run dev`, then load `/`, `/battlestation` and `/arcade`. The arcade
  page is a fork of the sister sites' and it broke silently in the last
  redesign, three times, all the same way: a CSS rule that hard-coded a colour
  instead of asking for the token. Check it every time.
- Look at the deployed shelf, not the payload. The last redesign shipped eight
  3D printer accessories filed under Audio and nobody saw it in a diff.
