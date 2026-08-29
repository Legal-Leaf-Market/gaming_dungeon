# The Lantern Quarter: painted plates

This is the brief for the one thing this repository cannot make for itself.

`tools/city.mjs` draws the background as five flat silhouettes and the site
looks good with them. But drawn geometry has a ceiling. It does silhouette
well and it does painted light not at all, and two attempts to close that gap
inside the vectors were built, judged against the flat version and reverted:
an `feDiffuseLighting` pass bleached the scene, and a multiplied fractal grain
muddied it. Multiply-blended noise over flat colour reads as dirt, not paint.

So the ceiling is raised from outside. Deliver any one of the five files
below and the site upgrades that layer and leaves the rest alone. There is
nothing to configure, no flag, no build step. **Committing the file at
`public/assets/paint/<name>.webp` is the entire integration.**

---

## What the scene is

A cultivation city at blue hour, seen from a terrace above it. Cool sky,
warm city. It is not a real place and it is not the studio's game: the brief
is deliberately "our own city, not that one".

Five layers, back to front. Each is a separate file and each is optional.

| File | What it holds | Transparency |
|---|---|---|
| `crag.webp` | distant peaks | sky above them is transparent |
| `far.webp` | the upper city: pagoda towers on a terrace wall | transparent above the roofline |
| `mid.webp` | the quarter: the great hall, the bridge, lit windows | transparent above the roofline |
| `near.webp` | foreground eaves, hung lanterns, a lantern string | transparent above the roofline |
| `bough.webp` | a cherry branch entering from the top-left corner | transparent everywhere but the branch |

The vector versions of all five are committed in `public/assets/city-*.svg`.
**Open them first.** They are the composition, and a painted plate that
matches their silhouette and proportions drops straight in. One that does not
will not line up with the layers around it.

---

## The hard requirements

These are not style notes. Break one and the plate will not composite.

**1. Aspect ratio, exactly.** Each plate tiles horizontally forever, and the
site derives the tile width from the plate's height and this ratio. A plate
delivered at a different ratio will jump once per drift cycle.

| File | Ratio | A good delivery size |
|---|---|---|
| `crag.webp` | 2400 x 760 | 4800 x 1520 |
| `far.webp` | 2400 x 620 | 4800 x 1240 |
| `mid.webp` | 2400 x 560 | 4800 x 1120 |
| `near.webp` | 2400 x 420 | 4800 x 840 |
| `bough.webp` | 1000 x 620 | 2000 x 1240 |

**2. The four band plates must TILE.** The left edge and the right edge join
seamlessly: put the same content at both, or leave both edges quiet. The
bough does not tile, and must not.

**3. The bottom row of each band plate is a flat colour**, held for the last
2 to 3 percent of the height, within a shade of the hex below. The site
continues that colour down to the bottom of the window, and a plate that
fades out at its own bottom edge leaves a visible seam.

| File | Bottom row |
|---|---|
| `crag.webp` | `#3a4f68` |
| `far.webp` | `#243a52` |
| `mid.webp` | `#141f2f` |
| `near.webp` | `#070c14` |

**4. Transparent, real alpha.** Not a sky painted in. The sky is a CSS
gradient behind everything and the haze between the layers is drawn by the
site; a plate with its own sky baked in will sit as a visible rectangle.

**5. Budget.** Under 400 KB each, under 1.4 MB for all five. These load on a
phone before anything else on the page is worth looking at.

---

## The look

**Value carries the depth, not detail.** Each layer sits closer to the SKY
the further back it is. That is the whole trick, and adding contrast to a
distant layer destroys it faster than any amount of good brushwork saves it.

**The only light is emitted.** Lanterns, lit windows, the moon. Nothing is
lit by a key light and nothing casts a shadow: at blue hour there is no sun
left to cast one. Windows are sparse. Every window lit is a hotel, not a
city.

**Warm against cool.** The horizon behind the far city is warm, the sky above
it is cool, and that single contrast is what makes the picture look lit. It
is the first thing to protect and the easiest thing to lose.

**Architecture.** Curved eaves that dip in the middle and flick UP at the
tips, concave roof slopes, tiered pagodas that narrow as they rise, hanging
banners, an arched stone bridge. Look at `city-mid.svg` for the vocabulary.
Straight rafter lines turn the whole thing into a circus tent.

**The bough is not candy floss.** Small separated bunches of blossom riding
along the last two orders of twig, with the wood crossing IN FRONT of half of
them, so the branch stays visible through the bloom. Dusty rose, low value,
never bright pink. This note is here because the first version of it was a
lump of fluff and got that exact word back.

---

## Prompts, one per plate

Each is written to be run as-is in an image model. Every one of them ends
with the same three clauses on purpose; they are the requirements above and
they are the half that gets dropped.

> **crag.webp** — Distant mountain range at blue hour, flat stylised
> silhouette, single desaturated slate-blue value `#3a4f68`, no shading, no
> texture, no detail inside the shapes. Two overlapping ranges: one tall and
> widely spaced behind, one low and busy in front. Asymmetric peaks with
> eroded shoulders and notched flanks, one dominant summit. Transparent sky
> above the ridgeline. Horizontally tileable, exact 2400:760 aspect, flat
> `#3a4f68` across the bottom 3 percent, transparent PNG or WebP with real
> alpha.

> **far.webp** — A distant Chinese cultivation city on a long stepped stone
> terrace, seen at blue hour from far away. Flat silhouette in a single
> slate-blue `#243a52`, almost no internal contrast, atmospheric and hazy.
> Three tiered pagoda towers of five to seven roofs, each narrowing as it
> rises, spread widely apart; rows of smaller halls with curved flicked
> eaves at four or five different heights between them. A handful of tiny
> warm lantern points, sparse. Transparent above the roofline. Horizontally
> tileable, exact 2400:620 aspect, flat `#243a52` across the bottom 3
> percent, real alpha.

> **mid.webp** — A dense cultivation city quarter at blue hour, near-black
> blue silhouette `#141f2f`, seen from across a valley. A great hall with
> double curved eaves left of centre on a raised stone stair; an arched
> stone bridge to its right with a string of paper lanterns hung across it;
> a street of tiled roofs at varying heights climbing a slow hillside, with
> hanging cloth banners. Small warm windows glowing amber, scattered and
> sparse, each with a soft bloom. No shading on the architecture, silhouette
> only, all the light emitted. Transparent above the roofline. Horizontally
> tileable, exact 2400:560 aspect, flat `#141f2f` across the bottom 3
> percent, real alpha.

> **near.webp** — Foreground rooftops of a Chinese city at night, seen from
> among them, almost black `#070c14`. Overlapping curved eaves with sharply
> flicked tips filling the frame, a long sagging string of glowing paper
> lanterns crossing the whole width, pairs of larger lanterns hung from
> individual eave tips. Warm amber light with soft bloom, everything else in
> pure silhouette with no shading. Transparent above the roofline.
> Horizontally tileable, exact 2400:420 aspect, flat `#070c14` across the
> bottom 3 percent, real alpha.

> **bough.webp** — A cherry blossom branch entering from the top-left corner
> against nothing, painted for a dark night scene. Near-black bark
> `#0a1119`, bowed limbs that fork two or three ways, no straight lines.
> Blossom in small separated bunches along the last two orders of twig in
> dusty muted rose, low value, never bright pink, with the dark wood
> crossing in front of about half the flowers so the branch reads through
> the bloom. Not a solid mass of blossom, not candy floss. Fully transparent
> background, exact 1000:620 aspect, real alpha, does NOT tile.

---

## Delivering

1. Save as WebP with alpha, at one of the sizes in the table.
2. Commit to `public/assets/paint/` under the exact filename.
3. That is all. Load the site, hard reload once, and the layer is painted.

If a plate looks wrong in place, the fault is almost always one of the five
hard requirements rather than the painting: check the aspect ratio and the
bottom row first.
