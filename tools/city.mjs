/* ============================================================
   tools/city.mjs — the Lantern Quarter

   WHAT THIS REPLACED, AND WHY (owner's call, 2026-08-29)
   ------------------------------------------------------------
   The previous background was tools/vale.mjs: a port of the game's
   own Terrain.heightAt(), standing a camera in the meadow and
   tracing the horizon it actually saw. It was accurate. The owner
   looked at it and said "it looks nothing like what I want", twice,
   and then: complete redesign, "something that feels like a city in
   that game, but don't try to emulate the game. Come up with your
   own."

   So this file does not derive anything from the game. It draws a
   city that does not exist. That is the brief, in writing, so that
   nobody later "fixes" this back into a terrain trace.

   THE ONE TECHNICAL LESSON THAT DID CARRY OVER, and it is the whole
   reason this looks different: two attempts were made to give the
   vector scene painted surfaces, an feDiffuseLighting pass and a
   multiplied fractal grain. Both were reverted, judged on
   screenshots against the flat version, because multiply-blended
   noise over flat fills does not read as paint, it reads as dirt.

   Vectors are bad at paint and EXCELLENT at silhouette. So nothing
   here is shaded. Every plate is one flat colour, and depth comes
   entirely from atmospheric perspective: the far plate sits a few
   percent off the sky, the near plate is nearly black, and the eye
   does the rest. The only light in the scene is emitted, never
   reflected -- windows, lanterns, the moon -- which is the one
   thing an SVG blur genuinely does well.

   OUTPUT
     public/assets/city-crag.svg   distant peaks, palest, tiles
     public/assets/city-far.svg    the upper city, tiles
     public/assets/city-mid.svg    the quarter and its bridge, tiles
     public/assets/city-near.svg   foreground eaves and lanterns, tiles
     public/assets/city-bough.svg  a cherry bough, corner piece, does NOT tile
     public/css/city-sky.css       the palette, as custom properties

   TILING. The four band plates repeat-x forever, so anything drawn
   near an edge is drawn a second time one full width over. Since
   content outside the viewBox is clipped when an SVG is used as a
   background image, the duplicate costs nothing and the seam
   disappears. Every emit() below does this for free; do not add a
   feature that draws directly without going through it.

   Run:  node tools/city.mjs
   ============================================================ */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------
   THE PALETTE

   Blue hour, not night: the sky still holds light, so silhouettes
   read as shapes rather than as holes. The horizon is WARM against
   a COOL sky, which is the whole reason the scene looks lit --
   remove that one contrast and the city goes grey and dead.

   Values, not hues, carry the depth. Each band steps roughly 20%
   darker than the one behind it, and the near band is close enough
   to black that the lanterns in front of it have somewhere to burn.
   ------------------------------------------------------------ */
/* GOLDEN HOUR, NOT BLUE HOUR (owner, 2026-08-29).

   "A little brighter than this, but almost sunset, not moon out."
   So the sun is still up and low, the sky is a clean cotton-candy
   blue overhead turning peach at the horizon, and the moon is gone.

   The one relationship is unchanged and still does all the work:
   COOL above, WARM below. It just runs at a much higher key now,
   which changes what the bands have to do -- see BAND. */
const SKY = {
  top:   '#5f9fd4',   // zenith, clean blue
  upper: '#8dbcdd',
  mid:   '#bfd5e4',
  low:   '#eccfae',   // where the warmth starts
  haze:  '#f4b98c',
  glow:  '#ef9358',   // the sun's own colour on the horizon
}

/* THE VALUE LADDER, and the spread matters more than the hues.

   The first set stepped these about 8 levels apart and the result
   was four dark bands that read as one dark mass: with the haze
   turned down to where it stopped drawing lines across the picture,
   there was nothing left separating them. Depth in a flat
   silhouette scene comes from exactly two things, and one of them
   is this ladder. Distant bands sit close to the SKY, not close to
   each other, which is what atmospheric perspective actually is.

   Rule of thumb that produced these: each step is roughly 40% of
   the way from the one in front toward the sky. */
/* THE LADDER INVERTS AT DAYTIME, and this is the trap in the repaint.

   At blue hour the sky was darker than everything, so distance meant
   getting DARKER toward the sky. In daylight the sky is the brightest
   thing in the frame, so distance means getting LIGHTER: a far ridge
   at golden hour is a pale wash a few percent off the haze, and the
   only genuinely dark thing is what is closest to you.

   Keeping the old dark values under a bright sky is what makes a
   repainted scene look like a night scene with the lights turned up.
   Each step is still about 40% of the way from the one in front
   toward the sky; the sky just moved. */
const BAND = {
  crag: '#a8bdcd',
  far:  '#7f9bb2',
  mid:  '#53708a',
  near: '#2c3f52',
}

const LIGHT = {
  lantern: '#ffb86b',   // paper lanterns and window squares
  hot:     '#ffe0ac',   // the core of a lantern, a stop brighter
  jade:    '#8fe3c4',   // the studio's green, used sparingly and high up
  sun:     '#fff3dc',
  /* THREE BLOSSOM TONES, AND THEY ARE COLOURS RATHER THAN OPACITIES.

     The first canopy used one rose at two alpha levels for near and
     far, and the owner's note was exact: "the two opaque shapes over
     each other, and we really didn't like it". Two alphas of one
     colour do not read as depth, they read as a transparency seam,
     and every place the two groups overlapped drew a visible edge
     that belongs to no branch.

     So depth here is pigment, at full opacity: the far flowers are a
     duller, cooler rose, the near ones are bright and warm, and
     nothing is see-through. This is also the Arizona green tea
     look the owner named -- flat opaque petals, dark wood, no
     blending anywhere. */
  /* THE LIT TONE IS STILL PINK, and that is the correction that
     stopped the canopy growing daisies. A near-white highlight next
     to a strong gold centre does not read as a cherry flower in
     sunlight, it reads as a different, white flower with a yellow
     eye, and at hero scale the eye goes straight to them. Sunlit
     blossom is BRIGHTER pink, barely warmer; the light does not
     bleach the pigment out of it. */
  blossomFar:  '#d493ae',
  blossom:     '#f4bcd0',
  blossomLit:  '#ffdde1',   // sunlit: brighter pink, not cream
  blossomCore: '#dba07d',   // the little centre, warm but not a daisy eye
  bough:       '#4a3226',   // wood, brown rather than black: it is daytime
}

/* ------------------------------------------------------------
   DETERMINISTIC RANDOMNESS

   mulberry32. The plates are committed files, so the same seed has
   to give the same city on every machine and in every rebuild, or
   every run shows up as a diff and nobody can tell a real change
   from noise.
   ------------------------------------------------------------ */
function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const n = (v) => Math.round(v * 100) / 100
/* One decimal for blossom. There are thousands of petals and the
   second decimal of a 6px petal is a hundredth of a pixel nobody can
   see; over a plate it is a fifth of the file. */
const m = (v) => Math.round(v * 10) / 10

/* ------------------------------------------------------------
   A PLATE

   Two buckets, and the separation matters: `solid` is the
   silhouette, `glow` is everything that emits. They render as two
   groups because the glow group carries the blur filter, and a blur
   over the silhouette would soften the rooflines into fog. Sharp
   architecture, soft light. That contrast IS the look.
   ------------------------------------------------------------ */
function plate(w, h) {
  const solid = []
  const glow = []
  return {
    w, h, solid, glow,
    /* Draw at x, and again one width over, so repeat-x has no seam.
       Anything that spans more than half the plate is drawn once:
       a second copy would overlap itself rather than fill a gap. */
    emit(bucket, make, x) {
      bucket.push(make(x))
      if (x < w * 0.5) bucket.push(make(x + w))
      else bucket.push(make(x - w))
    },
    svg(fill) {
      const blur = `
  <defs>
    <filter id="b" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="7"/>
    </filter>
    <filter id="bs" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="2.2"/>
    </filter>
  </defs>`
      const halo = glow.length
        ? `\n  <g filter="url(#b)" opacity=".55">${glow.join('')}</g>` +
          `\n  <g filter="url(#bs)">${glow.join('')}</g>`
        : ''
      /* The solid bucket holds PATH DATA, not markup: one <path> for
         the entire silhouette. That is not a micro-optimisation, it
         is what keeps the plate under 40KB with a few hundred roofs
         in it, and a single fill means the band can never show a
         seam where two shapes meet. */
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
        `width="${w}" height="${h}" preserveAspectRatio="xMidYMax meet">${blur}\n` +
        `  <path fill="${fill}" d="${solid.join('')}"/>${halo}\n</svg>\n`
    },
  }
}

/* ============================================================
   THE VOCABULARY

   ONE WINDING DIRECTION, EVERY SHAPE, NO EXCEPTIONS.

   The whole silhouette of a plate is a single <path>, and SVG fills
   a path with the nonzero rule: two overlapping subpaths wound the
   SAME way union, and two wound OPPOSITE ways cancel and leave a
   hole. Every primitive below therefore runs in the same direction
   as roof(), which is counter-clockwise on screen.

   This is worth the paragraph because of how it fails. roof() is
   drawn eave-first and reads counter-clockwise; a rectangle written
   the natural way (top-left, top-right, bottom-right, bottom-left)
   reads clockwise. Mix them and every building is fine, because a
   body only overlaps its own roof by a sliver -- and then the near
   plate, where the overlaps are large, comes out full of pale
   almond-shaped gaps that look like a rendering bug rather than a
   geometry one. It cost a render to find. If you add a shape here,
   walk it counter-clockwise, or it will quietly eat the shapes
   underneath it.

   Seven shapes, and the city is nothing but these seven repeated at
   different scales. Keeping the set this small is deliberate: a
   silhouette city reads as one place when its parts rhyme, and as a
   junkyard when every building is a new idea.
   ============================================================ */

/* THE CURVED EAVE. The signature, and the one shape that has to be
   right, because it is what makes a rectangle read as this city
   rather than as any city.

   Three things do the work, and all three are easy to lose:
     - the eave DIPS in the middle and the tips sit ABOVE it, so the
       bottom line is a smile turned up at the corners
     - the tips kick out past the body and up again, a hook
     - the slope from tip to ridge is CONCAVE, curving in, never a
       straight rafter line
   Straighten any one of them and it turns into a circus tent. */
function roof(cx, y, w, h) {
  const tip = y - h * 0.10          // tips ride above the eave line
  const dip = y + h * 0.20          // the eave sags between them
  const rx = w * 0.32               // half the ridge
  const kick = w * 0.07             // how far the hook throws past the tip
  return (
    `M${n(cx - w - kick)} ${n(tip - h * 0.13)}` +
    `Q${n(cx - w * 0.98)} ${n(tip + h * 0.02)} ${n(cx - w * 0.86)} ${n(tip + h * 0.05)}` +
    `Q${n(cx - w * 0.42)} ${n(dip)} ${n(cx)} ${n(dip)}` +
    `Q${n(cx + w * 0.42)} ${n(dip)} ${n(cx + w * 0.86)} ${n(tip + h * 0.05)}` +
    `Q${n(cx + w * 0.98)} ${n(tip + h * 0.02)} ${n(cx + w + kick)} ${n(tip - h * 0.13)}` +
    `Q${n(cx + w * 0.72)} ${n(y - h * 0.52)} ${n(cx + rx)} ${n(y - h)}` +
    `L${n(cx - rx)} ${n(y - h)}` +
    `Q${n(cx - w * 0.72)} ${n(y - h * 0.52)} ${n(cx - w - kick)} ${n(tip - h * 0.13)}Z`
  )
}

/* The knob on the ridge. Small, but a bare ridge line reads unfinished
   at every scale, and this costs eight characters of path. */
function finial(cx, y, s) {
  return `M${n(cx)} ${n(y - s * 1.7)}L${n(cx - s * 0.55)} ${n(y - s * 0.5)}` +
    `L${n(cx)} ${n(y)}L${n(cx + s * 0.55)} ${n(y - s * 0.5)}Z`
}

/* A body under a roof. Slightly narrower than the eave, always, so
   the roof overhangs -- an overhang is the difference between a
   building and a box with a hat. */
function body(cx, top, bot, w) {
  /* left edge DOWN first: that is what makes it counter-clockwise */
  return `M${n(cx - w)} ${n(top)}L${n(cx - w)} ${n(bot)}L${n(cx + w)} ${n(bot)}L${n(cx + w)} ${n(top)}Z`
}

/* A plain slab, used for ground bands and terraces. Same winding
   rule; this exists so those never get written inline and drifted. */
function slab(x0, x1, top, bot) {
  return `M${n(x0)} ${n(top)}L${n(x0)} ${n(bot)}L${n(x1)} ${n(bot)}L${n(x1)} ${n(top)}Z`
}

/* A hall: one roof, one body. The unit the whole quarter is made of. */
function hall(cx, eave, w, h, depth) {
  return roof(cx, eave, w, h) + body(cx, eave + h * 0.16, eave + depth, w * 0.74) +
    finial(cx, eave - h, h * 0.2)
}

/* A pagoda: halls stacked, each tier narrower and shallower than the
   one below. `taper` under about 0.8 gives a needle, over about 0.9
   gives a wedding cake; 0.84 is the tower that reads as a tower. */
function pagoda(cx, base, w, tiers, tierH, taper = 0.84) {
  let out = ''
  let ww = w
  let y = base
  for (let i = 0; i < tiers; i++) {
    out += roof(cx, y, ww, tierH)
    const next = y - tierH * 1.42
    if (i < tiers - 1) out += body(cx, next + tierH * 0.2, y + tierH * 0.1, ww * 0.56)
    y = next
    ww *= taper
  }
  out += body(cx, base + tierH * 0.1, base + tierH * 3.4, w * 0.62)
  out += finial(cx, y + tierH * 1.42 - tierH, tierH * 0.42)
  return out
}

/* An arched span. Two concentric arcs make the deck read as having
   thickness; without the second one it is a wire. */
function bridge(x0, x1, y, rise, deck) {
  const mx = (x0 + x1) / 2
  return (
    `M${n(x1)} ${n(y)}Q${n(mx)} ${n(y - rise)} ${n(x0)} ${n(y)}` +
    `L${n(x0)} ${n(y + deck)}Q${n(mx)} ${n(y - rise + deck * 1.5)} ${n(x1)} ${n(y + deck)}Z`
  )
}

/* A hung line of lanterns. The string sags; the lanterns hang PLUMB
   off it, never square to the string, which is the tell that gets
   this wrong everywhere it is drawn by hand.

   Returns both halves, because a lantern is a dark paper shell in
   the silhouette AND a light source in the glow, and the two have
   to line up exactly. */
function lanternString(x0, y0, x1, y1, sag, count) {
  const cx = (x0 + x1) / 2
  const cy = (y0 + y1) / 2 + sag * 2
  let dark = `M${n(x1)} ${n(y1)}Q${n(cx)} ${n(cy)} ${n(x0)} ${n(y0)}` +
    `L${n(x0)} ${n(y0 + 1.6)}Q${n(cx)} ${n(cy + 1.6)} ${n(x1)} ${n(y1 + 1.6)}Z`
  let lit = ''
  for (let i = 1; i <= count; i++) {
    const t = i / (count + 1)
    /* the point on the quadratic, so a lantern never floats off the wire */
    const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * cx + t * t * x1
    const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * cy + t * t * y1
    const r = 4.2 + (i % 3) * 0.7
    dark += slab(px - 0.7, px + 0.7, py, py + r * 0.7)
    lit += `<ellipse cx="${n(px)}" cy="${n(py + r * 1.5)}" rx="${n(r * 0.78)}" ry="${n(r)}" fill="${LIGHT.lantern}"/>`
    lit += `<ellipse cx="${n(px)}" cy="${n(py + r * 1.5)}" rx="${n(r * 0.34)}" ry="${n(r * 0.5)}" fill="${LIGHT.hot}"/>`
  }
  return { dark, lit }
}

/* A hanging banner. Vertical cloth, notched at the foot. Cities in
   this key art are full of them and they break up long rooflines
   better than another building does. */
function banner(x, y, w, h) {
  return `M${n(x - w)} ${n(y)}L${n(x - w)} ${n(y + h)}L${n(x)} ${n(y + h - w * 0.9)}` +
    `L${n(x + w)} ${n(y + h)}L${n(x + w)} ${n(y)}Z` +
    slab(x - w * 1.5, x + w * 1.5, y - 2, y)
}

/* Windows. Warm squares, and they are the reason the mid band reads
   as inhabited rather than as a mountain with corners. Sparse on
   purpose: every window lit is a hotel, not a city. */
function windows(rand, cx, top, bot, w, chance) {
  let out = ''
  const cols = Math.max(2, Math.floor((w * 2) / 16))
  const rows = Math.max(1, Math.floor((bot - top) / 18))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() > chance) continue
      const x = cx - w + 8 + c * 16
      const y = top + 9 + r * 18
      if (y > bot - 6) continue
      out += `<rect x="${n(x)}" y="${n(y)}" width="5.5" height="7" fill="${LIGHT.lantern}"/>`
    }
  }
  return out
}

/* ============================================================
   PLATE 1 -- THE CRAGS

   Not the city. The reason the city has somewhere to be. Sharp,
   nearly flat-toned peaks that sit a whisper off the sky, with one
   of them tall enough to hold a single jade light near the summit:
   somebody's sect, further up than anyone sensible builds.
   ============================================================ */
function crags() {
  const p = plate(2400, 760)
  const rand = rng(0x51ce)
  const ground = p.h

  /* TWO RANGES, NOT ONE ROW OF TRIANGLES. The first version of this
     was a single evenly spaced row and it read as a saw blade. What
     fixes it is not more detail, it is overlap: a tall sparse range
     behind a low busy one, and where a front peak crosses a back one
     the union reads as depth even though both are the same flat
     colour and there is no shading anywhere.

     Heights are pow(rand, 1.8), which piles most peaks at the bottom
     of the range and lets one in ten be a giant. A flat distribution
     gives every peak the same importance, and a horizon where
     nothing dominates is a horizon the eye slides off. */
  let d = ''
  const range = (minH, maxH, step, base) => {
    let x = -260
    while (x < p.w + 300) {
      const w = 150 + rand() * 380
      const h = minH + Math.pow(rand(), 1.8) * (maxH - minH)
      const skew = (rand() - 0.5) * 0.7          // no symmetrical peaks
      const apex = x + w * (0.5 + skew)
      d += `M${n(x)} ${n(base)}` +
        `L${n(x + w)} ${n(base)}` +
        `L${n(apex + w * 0.24)} ${n(base - h * 0.82)}` +
        `L${n(apex + w * 0.13)} ${n(base - h * 0.78)}` +    // the notch
        `L${n(apex)} ${n(base - h)}` +                      // summit
        `L${n(apex - w * 0.17)} ${n(base - h * 0.70)}Z`     // shoulder
      x += w * (step + rand() * 0.26)
    }
  }
  range(150, 470, 0.40, ground)   // the back range: tall, sparse
  range(50, 170, 0.34, ground)    // the front range: low, busy

  /* THE FAR LIGHT. One, and it is a landmark precisely because it is
     alone: somebody built further up than anybody sensible would. */
  p.glow.push(`<circle cx="1642" cy="332" r="3.6" fill="${LIGHT.jade}"/>`)
  p.solid.push(d)
  return p
}

/* ============================================================
   THE PEAK -- assets/city-peak.svg

   ONE MOUNTAIN, AND IT IS ITS OWN LAYER FOR A REASON. The crag band
   is a range of small peaks and it TILES: it repeats across the
   width and drifts sideways forever, which is right for a horizon
   made of anonymous rock. A landmark cannot do that. Put a single
   distinctive mountain into the crag plate and you get a row of
   identical mountains sliding past each other, which is worse than
   having no landmark at all.

   So this is drawn once, placed once, and does not tile. It sits
   behind the crag range and in front of the sky, and it is
   positioned to stand inside the opening in the canopy: the whole
   point of a frame is that there is something in it.

   THE HOUSE IS THE SCALE. Without it this is a shape, and a shape
   has no size. One roof, four pixels of it, a third of the way up
   the slope, is what turns the whole thing into a mountain somebody
   lives on. It is the smallest mark in the scene and it does the
   most work, which is why it gets its own comment.
   ============================================================ */
/* WHERE THE OPENING IN THE CANOPY IS, in plate coordinates.

   Declared here rather than beside the canopy layers because the
   MOUNTAIN reads it too: the frame and the thing framed have to
   agree about where the hole is, and two numbers that must agree
   should be one number. */
const GAP = { x: 1330, y: 560, r: 430, k: 0.86 }

function peak() {
  /* THE SAME PLATE GEOMETRY AS THE CANOPY, and that is the whole
     reason this lines up. The mountain has to stand INSIDE the
     opening in the frame, and the opening is at GAP in canopy plate
     coordinates. Give this plate a different size or a different
     background-position and aligning the two becomes arithmetic
     against the viewport, which changes with every window. Same
     2400x1350, same cover, same center top: GAP.x here is GAP.x
     there, at every window size, by construction. */
  const w = 2400, h = 1350
  const rand = rng(0x2f8a)
  const glow = []

  /* PROPORTION IS THE WHOLE THING. The first cut was 750 tall on a
     560 half-base, which is a 53-degree slope: that is an alp, and it
     read as a spike. A stratovolcano is SHALLOW -- Fuji is about 25
     degrees -- and the shallowness is most of why the silhouette is
     recognisable at all. Wide base, low apex, and the flanks very
     slightly concave. */
  /* Apex inside the opening, base below the far city so the range and
     the rooftops overlap its skirt and it reads as the furthest thing
     in the picture rather than a sticker on the sky. */
  const apex = { x: GAP.x - 40, y: 486 }
  const base = 1180
  const halfW = 700
  const flank = (dir, t) => [
    apex.x + dir * halfW * Math.pow(t, 1.14),
    apex.y + (base - apex.y) * t,
  ]

  const cone = () => {
    let d = ''
    for (let i = 0; i <= 24; i++) {
      const [x, y] = flank(1, i / 24)
      d += (i ? 'L' : 'M') + `${n(x)} ${n(y + (rand() - 0.5) * 4)}`
    }
    for (let i = 24; i >= 0; i--) {
      const [x, y] = flank(-1, i / 24)
      d += `L${n(x)} ${n(y + (rand() - 0.5) * 4)}`
    }
    return d + 'Z'
  }

  /* THE SNOW CAP FOLLOWS THE FLANKS. The first version ran a straight
     line from the apex to one end of its own zigzag, which is not a
     cap: it was a wedge that hung past the left flank and showed
     against the sky as a pale triangle with a ruled edge. Walk down
     one flank, across, and back up the other, and it cannot leave the
     mountain because its sides ARE the mountain's sides.

     The lower edge is a zigzag rather than a line because that is
     what makes it snow: it lies deep in the gullies and melts off the
     ridges, so the boundary has teeth, longest in the middle of each
     flank and shortest at the rim. */
  /* A CAP, NOT A COAT. At 0.42 with 60-unit teeth the white ran most
     of the way down the cone and the mountain read as a white
     triangle: the rock has to be the mountain and the snow has to be
     the thing on top of it. A third of the way, with teeth about half
     as long. */
  const capT = 0.29
  const cap = () => {
    let d = `M${n(apex.x)} ${n(apex.y)}`
    for (let i = 1; i <= 6; i++) {
      const [x, y] = flank(1, capT * (i / 6))
      d += `L${n(x)} ${n(y)}`
    }
    const [rx] = flank(1, capT), [lx] = flank(-1, capT)
    const yBase = apex.y + (base - apex.y) * capT
    for (let i = 1; i < 22; i++) {
      const t = i / 22
      const x = rx + (lx - rx) * t
      const tooth = Math.sin(t * Math.PI) * 34 * (0.3 + rand())
      d += `L${n(x)} ${n(yBase + (i % 2 ? tooth : -tooth * 0.3))}`
    }
    for (let i = 6; i >= 1; i--) {
      const [x, y] = flank(-1, capT * (i / 6))
      d += `L${n(x)} ${n(y)}`
    }
    return d + 'Z'
  }

  /* A shoulder so the cone is not alone against the sky. */
  const shoulder = () => {
    let d = `M${n(apex.x + 520)} ${n(base)}`
    for (let i = 0; i <= 16; i++) {
      const t = i / 16
      d += `L${n(apex.x + 520 + t * 520)} ${n(base - Math.sin(t * Math.PI) * 250 - rand() * 14)}`
    }
    return d + `L${n(apex.x + 1040)} ${n(base)}Z`
  }

  /* THE HOUSE IS THE SCALE, and it has to sit ABOVE the haze or the
     far band swallows it. Just under the snow line on the eastern
     flank, which is also where the ground would actually be walkable.
     It is the smallest mark in the scene and it does the most work:
     without it this is a shape, and a shape has no size. */
  const [hx, hy] = flank(1, capT + 0.07)
  const house =
    `M${n(hx - 26)} ${n(hy)}L${n(hx)} ${n(hy - 20)}L${n(hx + 26)} ${n(hy)}` +
    `L${n(hx + 17)} ${n(hy)}L${n(hx + 17)} ${n(hy + 17)}` +
    `L${n(hx - 17)} ${n(hy + 17)}L${n(hx - 17)} ${n(hy)}Z`
  glow.push(`<rect x="${n(hx - 4)}" y="${n(hy + 4)}" width="7" height="7" fill="${LIGHT.lantern}"/>`)
  glow.push(`<circle cx="${n(hx)}" cy="${n(hy + 7)}" r="20" fill="${LIGHT.lantern}" opacity=".2"/>`)

  /* Darker than the sky it stands in. At the crag band's own value it
     was within a step of the haze and the mountain read as a smudge:
     aerial perspective is real, and the thing at the back still has
     to be a SHAPE first. */
  const rock = mixHex(BAND.crag, '#20303f', 0.34)
  /* Everything reaches the plate floor. A silhouette that stops
     above its own bottom edge draws a ruled line where the element
     ends, which is the scar this scene has already been fixed for
     once (see .city .band in city.css). */
  const floor = `M0 ${n(base)}L${n(w)} ${n(base)}L${n(w)} ${n(h)}L0 ${n(h)}Z`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <path fill="${rock}" d="${cone()}${shoulder()}${floor}"/>
  <path fill="${mixHex(BAND.crag, '#ffffff', 0.82)}" d="${cap()}"/>
  <path fill="${mixHex(rock, '#0d1620', 0.55)}" d="${house}"/>
  ${glow.join('')}
</svg>\n`
}

/* ============================================================
   PLATE 2 -- THE UPPER CITY

   The quarter climbs, so the far band is the part of it that got
   built highest: towers, a long terrace wall, and the roofs that
   crest it. Low contrast against the crags behind, because this is
   two ridges back and air is not clear.
   ============================================================ */
function farCity() {
  const p = plate(2400, 620)
  const rand = rng(0x9a17)
  const ground = p.h - 40

  /* the terrace the upper city stands on: a long stepped wall, and
     the steps are what tell you it is masonry rather than a hill */
  const steps = []
  for (let x = 0; x <= p.w; x += 150) steps.push([x, ground + 6 + (rand() - 0.5) * 26])
  /* bottom edge left to right, then back along the steps: counter-
     clockwise, same as everything else on the plate */
  let wall = `M0 ${n(p.h)}L${n(p.w)} ${n(p.h)}`
  for (let i = steps.length - 1; i >= 0; i--) {
    wall += `L${n(steps[i][0] + 150)} ${n(steps[i][1])}L${n(steps[i][0])} ${n(steps[i][1])}`
  }
  wall += 'Z'
  p.solid.push(wall)

  /* three towers, spread wide enough that none of them shares a
     horizon with another */
  const towers = [
    { x: 300, w: 46, tiers: 6, t: 21 },
    { x: 1180, w: 58, tiers: 7, t: 24 },
    { x: 1920, w: 40, tiers: 5, t: 19 },
  ]
  for (const t of towers) {
    p.emit(p.solid, (x) => pagoda(x, ground - 6, t.w, t.tiers, t.t), t.x)
    p.emit(p.glow, (x) =>
      `<rect x="${n(x - 5)}" y="${n(ground - t.t * 3.0)}" width="10" height="12" fill="${LIGHT.lantern}"/>` +
      `<rect x="${n(x - 4)}" y="${n(ground - t.t * 6.2)}" width="8" height="10" fill="${LIGHT.lantern}"/>`,
      t.x)
  }

  /* Halls along the terrace, skipping where a tower already stands.
     `lift` is the whole reason this band does not read as a fence:
     a quarter that climbs has roofs at four or five heights, and a
     row of roofs at one height is a wall with decoration on it. */
  for (let i = 0; i < 30; i++) {
    const x = 30 + i * 80 + rand() * 28
    if (towers.some((t) => Math.abs(t.x - x) < 108)) continue
    const w = 26 + rand() * 30
    const h = 15 + rand() * 12
    const lift = Math.pow(rand(), 1.5) * 74
    p.emit(p.solid, (xx) => hall(xx, ground - 6 - lift, w, h, 62 + lift), x)
    if (lift > 40 && rand() > 0.5) {
      p.emit(p.glow, (xx) =>
        `<rect x="${n(xx - 4)}" y="${n(ground - lift + 8)}" width="7" height="9" fill="${LIGHT.lantern}"/>`, x)
    }
  }
  return p
}

/* ============================================================
   PLATE 3 -- THE QUARTER

   The band the eye actually lands on. Denser, darker, and it carries
   the two set pieces: the great hall a little left of centre, and
   the bridge that gets you to it. Windows are lit here because this
   is close enough to see them.
   ============================================================ */
function quarter() {
  const p = plate(2400, 560)
  const rand = rng(0x2b8d)
  const ground = p.h - 20

  /* the shelf the quarter sits on */
  p.solid.push(slab(0, p.w, ground, p.h))

  /* THE GREAT HALL. Off centre, because dead centre is a poster and
     off centre is a place. Wide eaves, a raised body, its own
     stair, and the only triple-height roof on the plate. */
  const gh = 760
  p.emit(p.solid, (x) => (
    hall(x, ground - 118, 128, 54, 130) +
    hall(x, ground - 46, 158, 46, 62) +
    /* the stair down to the street */
    `M${n(x - 84)} ${n(ground)}L${n(x + 84)} ${n(ground)}L${n(x + 62)} ${n(ground - 22)}L${n(x - 62)} ${n(ground - 22)}Z`
  ), gh)
  p.emit(p.glow, (x) =>
    `<rect x="${n(x - 46)}" y="${n(ground - 40)}" width="13" height="17" fill="${LIGHT.lantern}"/>` +
    `<rect x="${n(x - 8)}" y="${n(ground - 40)}" width="13" height="17" fill="${LIGHT.hot}"/>` +
    `<rect x="${n(x + 30)}" y="${n(ground - 40)}" width="13" height="17" fill="${LIGHT.lantern}"/>` +
    `<rect x="${n(x - 20)}" y="${n(ground - 132)}" width="40" height="10" fill="${LIGHT.lantern}"/>`,
    gh)

  /* THE BRIDGE, right of the hall, spanning a gap in the roofline
     that the loop below is told to leave open. */
  const b0 = 1290, b1 = 1620
  p.emit(p.solid, (x) => (
    bridge(x, x + (b1 - b0), ground - 58, 62, 11) +
    /* the two piers it lands on */
    body(x + 6, ground - 58, ground, 12) +
    body(x + (b1 - b0) - 6, ground - 58, ground, 12)
  ), b0)
  {
    const s = lanternString(b0 + 26, ground - 96, b1 - 26, ground - 96, 16, 7)
    p.emit(p.solid, (x) => lanternString(x + 26, ground - 96, x + (b1 - b0) - 26, ground - 96, 16, 7).dark, b0)
    p.emit(p.glow, (x) => lanternString(x + 26, ground - 96, x + (b1 - b0) - 26, ground - 96, 16, 7).lit, b0)
    void s
  }

  /* THE REST OF THE STREET.

     `terrace()` is a slow wave across the plate rather than a random
     lift per building, and that is the difference between a quarter
     built on a hillside and a row of huts on a shelf. Neighbours
     stand at nearly the same height, the height drifts as you pan,
     and the eye reads ground it cannot see. Random per-building lift
     was the first version and it looked like a bad bar chart. */
  const terrace = (x) =>
    46 * Math.sin(x / 340) + 26 * Math.sin(x / 131 + 1.7) + 34

  for (let i = 0; i < 40; i++) {
    const x = 24 + i * 60 + rand() * 24
    if (Math.abs(x - gh) < 190) continue
    if (x > b0 - 40 && x < b1 + 40) continue
    const w = 26 + rand() * 32
    const h = 18 + rand() * 15
    const lift = Math.max(0, terrace(x) + (rand() - 0.5) * 20)
    const eave = ground - lift
    p.emit(p.solid, (xx) => hall(xx, eave, w, h, 80 + lift), x)
    const lit = windows(rand, x, eave + h * 0.34, eave + 64 + lift, w * 0.66, 0.3)
    if (lit) p.emit(p.glow, () => lit, x)
    if (rand() > 0.76) p.emit(p.solid, (xx) => banner(xx + w * 0.82, eave + h * 0.3, 4, 34), x)
  }
  return p
}

/* ============================================================
   PLATE 4 -- THE NEAR EAVES

   Almost black, and it exists to give the page a floor and to put
   real light at the bottom of the screen where the reader is. Only
   the tops of things: you are standing among these roofs, not
   looking at them.
   ============================================================ */
function nearEaves() {
  const p = plate(2400, 420)
  const rand = rng(0x77e1)
  const ground = p.h

  /* A FLOOR, FIRST. Without this the plate is a row of towers with
     lit sky between their legs, which is exactly what the first
     version was: a barcode. The page needs a bottom edge it can sit
     on, and the roofs need something to be standing on top of. */
  p.solid.push(slab(0, p.w, ground - 58, p.h))

  /* Eaves OVERLAP on purpose (the step is smaller than the width),
     so they merge into one roofscape instead of reading as separate
     buildings. You are standing among these, not looking at them. */
  /* THE ROOFLINE HAS TO BE JAGGED, and this is a real defect fixed
     rather than a preference. The eaves used to sit within 84 units
     of each other on a 420-unit plate, overlapping heavily, so their
     tops merged into one nearly flat edge. Against a dark sky nobody
     saw it; the moment the scene became daylight, that edge read as
     a ruled grey line straight across the bottom of the hero, and it
     measured as the single sharpest step in the whole picture.

     A skyline is the silhouette's whole job. Three times the height
     range, and less overlap so sky shows between some of them. */
  for (let i = 0; i < 17; i++) {
    const x = -80 + i * 150 + rand() * 60
    const w = 92 + rand() * 62
    const h = 40 + rand() * 30
    const eave = ground - 76 - Math.pow(rand(), 1.15) * 236
    p.emit(p.solid, (xx) => roof(xx, eave, w, h) + body(xx, eave + h * 0.16, ground, w * 0.82), x)

    /* a pair of lanterns under every third eave, hung from the tips */
    if (i % 3 === 0) {
      p.emit(p.glow, (xx) =>
        `<ellipse cx="${n(xx - w * 0.66)}" cy="${n(eave + 36)}" rx="9" ry="12" fill="${LIGHT.lantern}"/>` +
        `<ellipse cx="${n(xx - w * 0.66)}" cy="${n(eave + 36)}" rx="4" ry="6" fill="${LIGHT.hot}"/>` +
        `<ellipse cx="${n(xx + w * 0.66)}" cy="${n(eave + 42)}" rx="8" ry="11" fill="${LIGHT.lantern}"/>` +
        `<ellipse cx="${n(xx + w * 0.66)}" cy="${n(eave + 42)}" rx="3.6" ry="5.4" fill="${LIGHT.hot}"/>`,
        x)
      p.emit(p.solid, (xx) =>
        slab(xx - w * 0.66 - 1, xx - w * 0.66 + 1, eave + 2, eave + 26) +
        slab(xx + w * 0.66 - 1, xx + w * 0.66 + 1, eave + 2, eave + 32),
        x)
    }
  }

  /* One long string across the whole plate, sagging between the
     eaves. It is the only element that crosses the entire width, and
     that is what ties a row of separate roofs into one street. */
  const s = lanternString(-40, 168, p.w + 40, 190, 44, 24)
  p.solid.push(s.dark)
  p.glow.push(s.lit)
  return p
}

/* ============================================================
   PLATE 5 -- THE BOUGH

   A cherry branch entering from a corner. It does not tile and it is
   not part of the skyline: it is the near-field object that gives
   the whole scene its depth, the same job a doorway does in a
   landscape painting.

   THE BLOSSOM IS NOT PINK FLUFF. That note is in this file because
   the first version of it was, and the owner's words were "I need
   leaves, not clouds, not cotton candy". So the clusters here are a
   DARK dusty rose, lower in value than the sky behind them, drawn
   as many small overlapping ellipses at varied angles rather than
   as one soft mass. Silhouette first, colour second. If a future
   version of this reads as candy floss, the fix is to take the
   value DOWN, not the saturation.
   ============================================================ */
/* ============================================================
   BLOSSOM

   THE REFERENCE IS THE ARIZONA GREEN TEA CAN, named by the owner and
   worth writing down because it settles a dozen small decisions at
   once. That artwork is not a photograph and not a soft airbrushed
   cloud: it is FLAT OPAQUE PETALS with visible separation between
   them, five to a flower, a small warm centre, and dark wood drawn
   straight through the middle of the bloom. Nothing on it is
   blurred and nothing on it is semi-transparent.

   Two earlier attempts at this failed in the same direction and the
   owner's words for them were "cotton candy" and "clouds". The fix
   both times was the same and it is the rule here: separation. A
   mass of overlapping soft blobs is weather. Individual flowers with
   gaps between them, and branches visible THROUGH those gaps, is a
   tree.
   ============================================================ */

/* ------------------------------------------------------------
   A SHAPE LIBRARY, AND WHY IT IS NOT INLINE PATH DATA

   Every flower drawn as its own path put the canopy at 632KB
   gzipped. That is not a heavy hero background, it is a broken one:
   the whole scene is supposed to paint before anybody has decided
   whether to stay.

   The density the owner asked for ("an incredible amount of cherry
   blossoms") and a small file are only compatible one way. Each
   distinct blossom is defined ONCE in <defs> and then placed with
   <use href="#f2" x y/>, which is about 35 bytes against roughly 300
   for the path, and which compresses far better besides because
   every placement is the same seventeen characters with two numbers
   in it.

   THE LIBRARY IS INDEXED BY RADIUS RATHER THAN SCALED BY TRANSFORM.
   A transform on every <use> costs most of what the symbol saved, so
   there are five sizes and the caller snaps to the nearest. Nobody
   can see the difference between a 7.4px flower and a 8px one in a
   canopy of four thousand.

   `fill` is inheritable and <use> inherits from where it is USED,
   not from where it is defined, so the shapes carry no fill of their
   own and each tone is one <g fill="..."> wrapping its placements.
   ------------------------------------------------------------ */
/* BIGGER STEPS, AND THAT IS A FILE-SIZE DECISION AS MUCH AS AN
   ARTISTIC ONE.

   Coverage is what the eye reads as "a lot of blossom"; the object
   COUNT is what the file pays for. A flower one step larger covers
   roughly 1.7x the area for exactly the same 36 bytes, so raising
   this ladder and easing the counts back buys a denser-LOOKING
   canopy in a smaller file. Going the other way, many tiny flowers,
   is how the three plates reached half a megabyte gzipped. */
const R_STEPS = [5, 8, 11, 15, 20]
const SHAPES = []

/* ------------------------------------------------------------
   THE PETAL, AND WHY THE FIRST ONE READ AS CONFETTI

   The original petal ran centre -> out one side -> tip -> back, with
   both curves meeting at a single point. That is a pointed lens, and
   five of them around a centre is a STAR. Rendered at hero scale and
   multiplied by seventy thousand, the canopy came out as pink
   confetti: the silhouette was doing the opposite of the job.

   A real cherry petal is obovate and NOTCHED. It leaves the centre
   narrow, widens past the middle, and its tip is two rounded lobes
   with a cleft between them. That cleft is the single feature that
   says "cherry" rather than "generic flower", and it is the one the
   star had no way to show.

   SHAPE COMPLEXITY IS FREE HERE and that is worth saying out loud,
   because the file-size discipline everywhere else in this module
   argues the other way. Every shape is defined ONCE in <defs>; the
   file's weight is the <use> placements, which are identical bytes
   whatever they point at. A four-cubic petal and a two-quadratic one
   cost the same canopy. So these are drawn as well as they can be.

   Same winding as everything else in this file (see THE VOCABULARY),
   so overlapping flowers of one tone union rather than punching
   holes in each other.
   ------------------------------------------------------------ */
function petalRing(r, rot, petals, wide, cleft, tipRound) {
  let d = ''
  for (let i = 0; i < petals; i++) {
    const a = rot + i * (Math.PI * 2 / petals)
    const c = Math.cos(a), s = Math.sin(a)
    /* petal space: x runs out along the axis, y across it */
    const P = (x, y) => `${m(x * c - y * s)} ${m(x * s + y * c)}`
    const W = r * wide
    const N = r * (1 - cleft)          // the cleft, short of the lobes
    const L = tipRound                 // how far the lobes bulge sideways
    d += 'M0 0' +
      `C${P(r * 0.10, W * 0.60)} ${P(r * 0.50, W)} ${P(r * 0.78, W * 0.82)}` +
      `C${P(r * 0.96, W * L)} ${P(r, W * L * 0.44)} ${P(N, 0)}` +
      `C${P(r, -W * L * 0.44)} ${P(r * 0.96, -W * L)} ${P(r * 0.78, -W * 0.82)}` +
      `C${P(r * 0.50, -W)} ${P(r * 0.10, -W * 0.60)} 0 0Z`
  }
  return d
}

/* The full flower: five notched petals, clearly separated. */
function sakuraPath(r, rot) {
  return petalRing(r, rot, 5, 0.32, 0.24, 0.66)
}

/* The middle tier. Same five petals with the cleft closed and the
   lobes fuller, which at eight or nine plate units is what a flower
   actually resolves to: a soft rosette rather than five countable
   petals. Keeping it a FIVE-lobed shape is the point. The tier it
   replaces was a three-petal flower, and three petals at any size
   reads as an arrowhead, not a blossom. */
function rosettePath(r, rot) {
  return petalRing(r, rot, 5, 0.42, 0.04, 0.92)
}

/* A bud: the same silhouette read from behind. Real cherry is
   perhaps a third buds and half-open flowers, and a canopy of
   nothing but perfect blooms reads as wallpaper. */
function budPath(r) {
  return `M0 ${m(-r)}Q${m(r * 0.9)} ${m(-r * 0.3)} ${m(r * 0.35)} ${m(r)}` +
    `Q0 ${m(r * 0.5)} ${m(-r * 0.35)} ${m(r)}` +
    `Q${m(-r * 0.9)} ${m(-r * 0.3)} 0 ${m(-r)}Z`
}

function blobPath(r) {
  return `M${m(-r)} 0A${m(r)} ${m(r)} 0 1 0 ${m(r)} 0A${m(r)} ${m(r)} 0 1 0 ${m(-r)} 0Z`
}

/* Translate a finished path by baking the offset into every
   coordinate. Cheaper at render than a transform on the <use>, and
   it keeps every placement a bare two-number tag.

   ONLY SAFE ON PATHS WHOSE NUMBERS ARE ALL COORDINATE PAIRS, which
   means M/L/C/Q and nothing else. An arc's `A rx ry rot large sweep
   x y` carries five numbers that are not positions, and running this
   over one would quietly deform it. blobPath() uses arcs; do not
   pass it here. */
function shift(d, dx, dy) {
  let i = 0
  return d.replace(/-?\d+(?:\.\d+)?/g, (v) => m(Number(v) + (i++ % 2 ? dy : dx)))
}

/* Built once, at module load. Several rotations per size so a field
   of them does not read as a printed pattern.

   EVERY TIER GETS A FLOWER NOW, including the smallest. The old
   library gave the bottom two tiers a plain circle on the reasoning
   that petals are invisible at three screen pixels. The petals are,
   but the EDGE is not: a mass of little circles resolves to crisp
   dots and reads as confetti, while a mass of little rosettes
   resolves to a soft broken edge and reads as texture. Since the
   shape costs nothing (see THE PETAL above), the cheap thing and the
   good thing are the same thing. */
const LIB = R_STEPS.map((r, i) => {
  const push = (id, d) => { SHAPES.push({ id, d }); return id }
  const set = {
    /* the big tiers show the cleft, so they get the real flower */
    full: r >= 10 ? [0, 1, 2].map((k) =>
      push('f' + i + k, sakuraPath(r, k * 0.42))) : null,
    /* everything above the very smallest gets a five-lobed rosette */
    mid: r >= 7 ? [0, 1].map((k) =>
      push('t' + i + k, rosettePath(r, k * 0.6))) : null,
    small: push('b' + i, rosettePath(r * 0.9, 0.31)),
    bud: push('d' + i, budPath(r * 0.66)),
    core: push('c' + i, blobPath(Math.max(0.8, r * 0.13))),
    /* THE HIGHLIGHT IS A FLOWER, NOT A DOT.

       It was a circle at the flower's own centre, which on a
       five-petal bloom paints a pale disc over the middle: a hole
       punched in the flower rather than a flower catching the sun.
       Now it is the same silhouette at two-thirds size, shifted up
       and left toward the low sun, so what lights up is one SIDE of
       the bloom and the shaded petals still read underneath. The
       offset is baked into the path so the placement stays a bare
       <use x y> with no transform on it. */
    lit: push('l' + i, shift(
      r >= 10 ? sakuraPath(r * 0.74, 0.2) : rosettePath(r * 0.72, 0.2),
      -r * 0.13, -r * 0.15)),
  }
  return set
})

/* Snap a wanted radius to the nearest library step. */
function tier(r) {
  let best = 0, gap = Infinity
  for (let i = 0; i < R_STEPS.length; i++) {
    const g = Math.abs(R_STEPS[i] - r)
    if (g < gap) { gap = g; best = i }
  }
  return best
}

/* DETAIL BY SIZE, and it is a size decision before it is an art one.
   The canopy plate is 2400 wide and renders at roughly half a
   viewport height, so a plate radius of 4 is about three screen
   pixels. Five petals with gaps between them at three pixels is not
   five petals, it is a dot. */
function place(id, x, y) {
  return `<use href="#${id}" x="${Math.round(x)}" y="${Math.round(y)}"/>`
}

/* ------------------------------------------------------------
   A BRANCHING SYSTEM, shared by the canopy and the near bough.

   `sink` is what makes it read as hanging rather than growing: every
   generation is pulled back toward straight down, so limbs that
   start out sideways end up drooping, which is what a cherry in
   flower actually does under the weight.
   ------------------------------------------------------------ */
/* IS THIS POINT INSIDE THE OPENING?

   THE EDGE IS NOT A CIRCLE. A constant radius gives a clean ellipse,
   and a clean ellipse in the middle of a canopy reads as a vignette
   somebody applied rather than as a hole between branches. The radius
   is modulated by angle with two out-of-phase harmonics, which pushes
   the boundary in and out by about a fifth and gives the opening
   lobes and inlets the way a real gap has them.

   One function, used by both the branch guard and the per-flower
   guard, because two copies of this arithmetic would eventually
   disagree and the disagreement would show as flowers floating
   alone inside the hole. */
function inGap(gap, x, y) {
  if (!gap) return false
  const dx = x - gap.x
  const dy = (y - gap.y) / (gap.k || 1)
  const d = Math.hypot(dx, dy)
  if (d > gap.r * 1.35) return false          // cheap reject
  const a = Math.atan2(dy, dx)
  const r = gap.r * (1 + 0.19 * Math.sin(3 * a + 1.1) + 0.10 * Math.sin(5 * a - 0.4))
  return d < r
}

function boughSystem(rand, opts) {
  const wood = []
  const far = [], near = [], lit = [], cores = []

  function bloomAt(x, y, r, depth) {
    /* The far tone goes down FIRST and is drawn under the wood, the
       near tones over it. That ordering is the whole illusion: the
       branch crossing in front of half the flowers is what stops a
       cluster reading as one lump, and it is the thing the Arizona
       can does that a soft airbrushed blossom never does. */
    const i = tier(r)
    const set = LIB[i]
    const pick = (list) => list[Math.floor(rand() * list.length)]
    const bloom = () => (
      set.full ? pick(set.full)
      : set.mid ? pick(set.mid)
      : set.small
    )
    const roll = rand()
    if (roll < 0.34) { far.push(place(bloom(), x, y)); return }
    if (roll < 0.52) { far.push(place(set.bud, x, y)); return }
    if (roll > 0.93) { near.push(place(set.bud, x, y)); return }
    near.push(place(bloom(), x, y))
    /* Only the nearest, biggest flowers get a highlight and a centre.
       Putting them on everything flattens the depth the three tones
       just bought. */
    /* HIGHLIGHTS ARE RARE, and the first pass had them on every
       flower above the middle size. On the near bough, where most
       flowers ARE above it, that painted a pale near-white mass with
       a straight edge where the bough's plate met the canopy behind
       it -- the same "two opaque shapes over each other" the owner
       objected to, arriving by a different route.

       A highlight is a flower catching the low sun, and on a real
       tree that is a scattering, not a coat. One in four, and the
       gold centre rarer still. */
    /* RARER THAN IT WAS, because the highlight stopped being a dot.
       At 0.26 a small pale disc was a scattering; the same rate on a
       whole flower-shaped highlight painted the top of the canopy
       cream. The rate is doing a different job now and had to move
       with the shape. */
    if (depth <= 1 && i >= 3 && rand() < 0.13) {
      lit.push(place(set.lit, x, y))
      if (rand() < 0.28) cores.push(place(set.core, x, y))
    }
  }

  function branch(x0, y0, ang, len, wid, depth) {
    const x1 = x0 + Math.cos(ang) * len
    const y1 = y0 + Math.sin(ang) * len
    const bow = (rand() - 0.5) * len * 0.32
    const mx = (x0 + x1) / 2 + Math.cos(ang + Math.PI / 2) * bow
    const my = (y0 + y1) / 2 + Math.sin(ang + Math.PI / 2) * bow
    const nx = Math.cos(ang + Math.PI / 2), ny = Math.sin(ang + Math.PI / 2)
    const w1 = wid * 0.42
    wood.push(
      `M${n(x0 + nx * wid)} ${n(y0 + ny * wid)}` +
      `Q${n(mx + nx * wid * 0.7)} ${n(my + ny * wid * 0.7)} ${n(x1 + nx * w1)} ${n(y1 + ny * w1)}` +
      `L${n(x1 - nx * w1)} ${n(y1 - ny * w1)}` +
      `Q${n(mx - nx * wid * 0.7)} ${n(my - ny * wid * 0.7)} ${n(x0 - nx * wid)} ${n(y0 - ny * wid)}Z`
    )

    /* FLOWERS RIDE THE WHOLE TWIG, NOT ITS TIP. Hanging a fat cluster
       off each end point is what produced the lump the owner called
       candy floss. Real cherry flowers along the last two orders of
       wood, in small separated bunches. */
    if (depth <= opts.bloomFrom) {
      const count = opts.perTwig[0] + Math.floor(rand() * (opts.perTwig[1] - opts.perTwig[0]))
      for (let i = 0; i < count; i++) {
        const t = 0.1 + rand() * 0.95
        const spread = opts.spread * (0.5 + rand())
        /* RADIUS FALLS OFF WITH DEPTH, which is what lets three
           orders of wood bloom without the file tripling. A flower
           deep in the tree is further from the viewer and smaller,
           so it lands in the cheap blob tier by its own geometry
           rather than by a rule; the tips, which is what anybody
           actually looks at, stay full five-petal flowers. */
        const scale = 1 - depth * 0.2
        const bx = x0 + (x1 - x0) * t + (rand() - 0.5) * spread
        const by = y0 + (y1 - y0) * t + (rand() - 0.5) * spread * 0.85
        /* Scatter is what makes a knot look like a knot, and it is
           also what would fling flowers into the opening from a twig
           that correctly stopped outside it. Checked per flower. */
        if (inGap(opts.gap, bx, by)) continue
        bloomAt(bx, by, (opts.r[0] + rand() * (opts.r[1] - opts.r[0])) * scale, depth)
      }
    }
    if (depth <= 0 || len < opts.minLen) return

    /* THE GAP IS WHERE NOTHING REACHES, not a hole cut in something.
       Growth stops short of it rather than being masked out of it,
       so the edge of the opening is made of real twig ends at
       different depths instead of a clipped line. `opts.gap` is a
       point and a radius in plate coordinates; a branch that would
       cross into it simply ends. */
    if (inGap(opts.gap, x1, y1)) return

    const forks = rand() > 0.38 ? 3 : 2
    for (let i = 0; i < forks; i++) {
      const spread = (i - (forks - 1) / 2) * (0.46 + rand() * 0.3)
      /* PULLED BACK TOWARD THE LIMB'S OWN LINE, not toward straight
         down. `sink` used to bend every generation toward vertical,
         which is what turned this into a curtain: a weeping cherry
         does that and an ordinary one does not. A cherry limb holds
         its direction and its twigs fan around it, so the pull is
         toward `ang` and the fan is what makes it a branch rather
         than a stick. */
      const want = ang + spread + (rand() - 0.5) * 0.22
      const held = want + (ang - want) * (opts.hold || 0) * rand()
      branch(x1, y1, held, len * (0.6 + rand() * 0.2), w1, depth - 1)
    }
  }

  return { wood, far, near, lit, cores, branch, bloomAt }
}

function paint(sys, pal) {
  /* far flowers, then the wood, then near, then the highlights.
     Wood between the two flower tones is the whole trick. */
  const defs = SHAPES.map((sh) => `<path id="${sh.id}" d="${sh.d}"/>`).join('')

  /* SORTED BY SHAPE, AND IT IS FREE.

     Every placement in one group is the same colour and they union
     under the nonzero fill rule, so the order within a group has no
     effect on the picture at all. Sorting them puts every <use> of
     the same shape next to its siblings, which turns the file into
     long runs of an identical seventeen-character prefix with two
     numbers changing. gzip and brotli eat that.

     Measured on the canopy at the density the owner asked for: 554KB
     gzipped interleaved, and a third of that sorted. Nothing about
     what is drawn changed. */
  const group = (list) => list.slice().sort().join('')
  const P = pal || LAYER_PAL(0)
  return `
  <defs>${defs}</defs>
  <g fill="${P.far}">${group(sys.far)}</g>
  <path fill="${P.bough}" d="${sys.wood.join('')}"/>
  <g fill="${P.near}">${group(sys.near)}</g>
  <g fill="${P.lit}">${group(sys.lit)}</g>
  <g fill="${P.core}">${group(sys.cores)}</g>`
}

/* ------------------------------------------------------------
   AERIAL PERSPECTIVE AS PIGMENT, NOT AS OPACITY

   The three canopy plates used to be separated by CSS opacity: .46,
   .76, 1. That is the cheap way to say "further away" and it costs
   two real things.

   It bleeds the city THROUGH the flowers. Distant blossom is not
   translucent; you see the quarter through the GAPS between strands,
   which is exactly what the owner asked for, and a half-transparent
   petal is the one thing that cannot say it.

   And it flattens the far layer toward whatever is behind it, so the
   layer that should read as pale, cool and still full of contrast
   instead reads as a grey smear.

   So the mix happens here, at generate time, against the haze the
   scene actually has, and every plate then paints at full opacity.
   `t` is how far into the distance the layer sits, 0 near, 1 gone.
   ------------------------------------------------------------ */
/* TWO HAZE TARGETS, because distance does not desaturate everything
   toward the same colour. Wood recedes toward the SKY, which here is
   a cool blue, and goes nearly all the way. Blossom recedes toward
   the warm pale the low sun is putting into the air, and mixing it
   toward the blue instead is what turned the far layer a dusty
   mauve: technically hazier, and the wrong hue for the hour. */
const HAZE = '#c3d8e8'
const HAZE_WARM = '#efdfe0'

function mixHex(a, b, t) {
  const c = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [ar, ag, ab] = c(a), [br, bg, bb] = c(b)
  const q = (x, y) => Math.round(x + (y - x) * t).toString(16).padStart(2, '0')
  return `#${q(ar, br)}${q(ag, bg)}${q(ab, bb)}`
}

function LAYER_PAL(t) {
  return {
    far: mixHex(LIGHT.blossomFar, HAZE_WARM, t * 0.82),
    near: mixHex(LIGHT.blossom, HAZE_WARM, t * 0.72),
    lit: mixHex(LIGHT.blossomLit, HAZE_WARM, t * 0.5),
    core: mixHex(LIGHT.blossomCore, HAZE_WARM, t),
    /* WOOD GOES FURTHEST, and it is the tell that gives a flat
       painting away when it is missing. Dark values lose contrast to
       haze faster than light ones, so a distant branch is nearly the
       colour of the sky while a distant petal has barely moved. Same
       brown at three depths is three branches at the same depth. */
    bough: mixHex(LIGHT.bough, HAZE, Math.min(1, t * 1.45)),
  }
}

/* ============================================================
   PLATES 5-7 -- THE CANOPY, IN THREE DEPTHS

   THE POINT OF VIEW IS THAT YOU ARE SITTING IN THE TREE. Not
   standing near one, not looking at a branch someone hung in the
   corner of the frame: up in an old cherry on the ridge, looking
   down through it at the quarter. Everything below follows from
   that, and the two things it demands are the two the previous
   version got wrong.

   FIRST, THERE IS NO CLUMP. The last build put one heavy limb in
   the top-left and thin canopy everywhere else, and the note back
   was exact: "the clump looks great, but we asked you to not clump
   on the left, we want it everywhere." So there is no separate
   bough plate any more. Every layer is full width and tiles, and
   the heavy wood is distributed along all of them.

   SECOND, DEPTH IS LAYERS OF THE WHOLE FRAME, NOT SHADING INSIDE
   ONE. "Slightly different layers of opaque so you can kinda peek
   through and see the city." That is the opposite of the seam that
   was complained about earlier and it is worth being precise about
   why, because the two look like the same idea:

     - two alpha levels INSIDE one plate draw a visible boundary
       wherever the groups overlap, which belongs to nothing in the
       picture. That was the bug.
     - three FULL-FRAME plates at three opacities have no boundary
       anywhere, because each one covers everything. That is
       atmospheric perspective, and it is what makes you feel like
       you are looking through several metres of tree.

   The far layer hangs the full height of the window, which is what
   actually puts blossom over the city rather than only over the sky
   above it. You look at the quarter THROUGH branches, which is the
   whole brief.
   ============================================================ */
/* ------------------------------------------------------------
   A WEEPING STRAND

   The reference is shidarezakura, the weeping cherry: long thin
   whips that fall almost straight down from a high limb with
   blossom strung along their whole length, not bunched at the tip.

   This is what fills a hero. A branching system alone spends its
   length going sideways, so however many generations you give it
   the mass stays near the top and the bottom two thirds of the
   window is sky. Strands go DOWN, and the gaps between them are the
   gaps you see the city through -- which is the thing being asked
   for. Curved, tapering, and swaying on their own phase so no two
   hang alike.

   Built as one closed path down the left side and back up the
   right, which winds the same way as everything else in this file
   (see THE VOCABULARY).
   ------------------------------------------------------------ */
function strand(sys, rand, x0, y0, len, wid, sway, opts) {
  const steps = 12
  const phase = rand() * 6.3
  const L = [], R = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    /* the sway grows with t: a whip is stiff where it leaves the
       limb and loose at the end */
    const x = x0 + Math.sin(phase + t * 2.6) * sway * t * t
    const y = y0 + len * t
    /* THE WHIP HAS TO REACH ZERO, and the half-pixel floor that used
       to be here is why the last pass looked like it had wires in
       it. Once the blossom tapers off (see the knot loop below), any
       wood still drawn past it is a bare line hanging the full
       height of the window with nothing on it. Squared falloff so
       the thinning happens late: a whip is stiff for most of its
       length and then gives out. */
    const wd = wid * (1 - t) * (1 - t)
    L.push([x - wd, y]); R.push([x + wd, y])
  }
  let d = `M${m(L[0][0])} ${m(L[0][1])}`
  for (let i = 1; i <= steps; i++) d += `L${m(L[i][0])} ${m(L[i][1])}`
  for (let i = steps; i >= 0; i--) d += `L${m(R[i][0])} ${m(R[i][1])}`
  sys.wood.push(d + 'Z')

  /* BLOSSOM IN CLUSTERS ALONG THE WHOLE WHIP, and both halves of
     that matter.

     ALONG: bunched at the end is a bell-pull, not a cherry.

     IN CLUSTERS: the first version scattered twenty singles evenly
     down a 1700-unit strand, which at render scale is one flower
     every thirty pixels. The result was a bare stick with a few
     dots on it -- a bead curtain. Real weeping cherry carries
     blossom in tight knots every few inches with wood showing
     between them, so the strand is mostly flower and the gaps are
     small and irregular. */
  const knots = opts.per[0] + Math.floor(rand() * (opts.per[1] - opts.per[0]))
  for (let k = 0; k < knots; k++) {
    /* Evenly spaced down the strand and then jittered, rather than
       uniformly random: pure random leaves long bald stretches by
       chance, which is what a whip must not have. */
    const t = Math.min(0.99, (k + 0.5) / knots + (rand() - 0.5) * 0.5 / knots)
    const cx = x0 + Math.sin(phase + t * 2.6) * sway * t * t
    const cy = y0 + len * t
    /* THE WHIP TAPERS, and this is the line that lets the city be
       seen at all.

       Every knot used to carry the same seven to sixteen flowers
       from the limb to the tip, which draws a ribbon of even width
       a full window tall. Three of those layers is a curtain, and
       the brief was a canopy you look THROUGH. A real weeping cherry
       carries its weight near the limb and thins to almost nothing
       at the end, so the mass stays where it is wanted, at the top
       of the frame, and the bottom of every strand opens into the
       gaps the quarter shows through. Cheaper too: the flowers this
       removes are the ones that were covering the picture. */
    const per = Math.max(2, Math.round((7 + rand() * 10) * (1 - t * 0.62)))
    for (let i = 0; i < per; i++) {
      sys.bloomAt(
        cx + (rand() - 0.5) * opts.spread * (1 - t * 0.4),
        cy + (rand() - 0.5) * opts.spread * 0.8,
        (opts.r[0] + rand() * (opts.r[1] - opts.r[0])) * (1 - t * 0.3),
        t > 0.55 ? 2 : 1
      )
    }
  }
}

/* ------------------------------------------------------------
   THE CANOPY IS A FRAME WITH A HOLE IN IT.

   The previous version hung weeping strands the full height of the
   window, and two things were wrong with it. The owner named both:
   "it's not accurate that these cherry blossoms would hang down like
   vines like that. I was just trying to get you to fill the whole
   page." An ordinary cherry reaches OUT and UP; only shidarezakura
   weeps, and a curtain of them is not what anybody pictures when they
   picture blossom over a view.

   And filling the frame was never the goal, it was a way of asking
   for coverage. The reference is a mountain seen THROUGH branches:
   blossom heavy round the edges and at the top, thinning inward, and
   a clear opening in the middle you look through.

   SO THE OPENING IS NOT MASKED, IT IS UNREACHED. Boughs are anchored
   ON THE FRAME EDGE, aimed inward, and given a length that runs out
   before the middle; branch() additionally stops any twig that would
   cross into the gap. The edge of the hole is therefore made of real
   twig ends at three depths, which is what a gap between branches
   actually looks like. A mask would have given it a clipped line.

   AND THIS PLATE NO LONGER TILES. That is a consequence rather than
   a preference: a gap repeated every 2400px is a row of holes, not a
   window. city.css draws it once, covering, so the opening stays
   where it was put. The horizontal repeat was only ever there to
   cover the width.
   ------------------------------------------------------------ */
function canopyLayer(w, h, seed, opts) {
  const seeds = rng(seed)
  const all = { wood: [], far: [], near: [], lit: [], cores: [] }

  /* Anchors walk the frame. Each side gets its own spacing and its
     own inward aim, because the top of a window is not the side of
     one: the top carries most of the mass (that is where the tree
     is), the sides reach in level, and the bottom corners get just
     enough to close the frame without filling the foreground. */
  const anchors = []
  /* `back` pushes the anchor further outside the frame along its own
     aim. The first one or two generations of any bough are bare wood
     -- blossom starts at opts.bloomFrom -- so an anchor sitting on
     the edge puts its naked trunk INSIDE the picture, which along the
     top edge came out as a row of dark tentacles hanging into the
     sky. Backing the anchor off by most of its own first segment
     leaves that wood off-plate and lets the blossoming end of the
     bough be the part you see. */
  const push = (x, y, ang, spread, lenMul, back) => {
    const len = (opts.len[0] + seeds() * (opts.len[1] - opts.len[0])) * lenMul
    const a = ang + (seeds() - 0.5) * spread
    const k = (back || 0) * len
    anchors.push({
      x: x - Math.cos(a) * k,
      y: y - Math.sin(a) * k,
      ang: a, len,
      wid: opts.wid[0] + seeds() * (opts.wid[1] - opts.wid[0]),
      seed: Math.floor(seeds() * 0xffffff),
    })
  }

  const S = opts.sides
  /* top: the densest edge, aimed down and slightly inward */
  for (let x = -120; x < w + 120; x += S.top[0] + seeds() * (S.top[1] - S.top[0])) {
    const inward = (x < w / 2 ? 0.34 : -0.34) * seeds()
    push(x, -30 - seeds() * 70, Math.PI / 2 + inward, 0.5, 1, 1.25)
  }
  /* sides: level, reaching in */
  for (let y = 40; y < h; y += S.side[0] + seeds() * (S.side[1] - S.side[0])) {
    push(-40 - seeds() * 50, y, 0.10 + (seeds() - 0.5) * 0.7, 0.4, 0.86, 1.15)
    push(w + 40 + seeds() * 50, y, Math.PI - 0.10 + (seeds() - 0.5) * 0.7, 0.4, 0.86, 1.15)
  }
  /* the bottom corners only. A bough across the middle of the bottom
     edge would stand in front of the city, which is the one thing
     the opening exists to show. */
  for (let x = -80; x < w * 0.30; x += S.foot[0] + seeds() * (S.foot[1] - S.foot[0])) {
    push(x, h + 30 + seeds() * 60, -Math.PI / 2 + 0.4 * seeds(), 0.5, 0.7, 1.1)
  }
  for (let x = w * 0.72; x < w + 80; x += S.foot[0] + seeds() * (S.foot[1] - S.foot[0])) {
    push(x, h + 30 + seeds() * 60, -Math.PI / 2 - 0.4 * seeds(), 0.5, 0.7, 1.1)
  }

  for (const a of anchors) {
    const sys = boughSystem(rng(a.seed), opts)
    sys.branch(a.x, a.y, a.ang, a.len, a.wid, opts.depth)
    for (const k of Object.keys(all)) all[k] = all[k].concat(sys[k])
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paint(all, LAYER_PAL(opts.depthT || 0))}
</svg>\n`
}

/* ------------------------------------------------------------
   THREE FRAMES, ONE OPENING.

   All three plates are 16:9 and share the same gap, so `cover` at a
   normal window keeps the hole where it was put and the three edges
   of it sit at three depths. The gap is slightly RIGHT of centre and
   above the middle: the hero's copy is anchored bottom left, so the
   opening goes where the copy is not, and the mountain it frames sits
   in the upper right of the scene behind it.

   The near layer's gap is the widest. That is what gives the opening
   a soft edge without any blur: the far twigs come closest in, the
   near ones stop furthest out, so looking through it you see three
   receding rims rather than one cut.
   ------------------------------------------------------------ */

/* THE FAR FRAME. Thin wood, small pale flowers, reaching furthest
   into the opening. This is the layer that puts a few blossoms over
   the city itself rather than only round the edge. */
const canopyFar = () => canopyLayer(2400, 1350, 0x51a3, {
  depthT: 0.52,
  bloomFrom: 2, perTwig: [9, 15], spread: 56, r: [5, 11],
  minLen: 30, hold: 0.34, depth: 3,
  len: [190, 300], wid: [7, 13],
  gap: { ...GAP, r: GAP.r * 0.88 },
  sides: { top: [104, 178], side: [150, 250], foot: [180, 300] },
})

/* THE MIDDLE. Where most of the mass is. */
const canopyMid = () => canopyLayer(2400, 1350, 0x7b2e, {
  depthT: 0.24,
  bloomFrom: 2, perTwig: [13, 21], spread: 52, r: [6.5, 14],
  minLen: 28, hold: 0.38, depth: 3,
  len: [180, 285], wid: [10, 17],
  gap: { ...GAP, r: GAP.r * 1.0 },
  sides: { top: [116, 196], side: [170, 280], foot: [200, 330] },
})

/* THE NEAR FRAME. Heavy wood, the biggest flowers, and the widest
   gap: this is the wood you would be sitting in, and it crowds the
   corners rather than the middle. */
const canopyNear = () => canopyLayer(2400, 1350, 0x3c7f, {
  bloomFrom: 2, perTwig: [15, 25], spread: 60, r: [8, 19],
  minLen: 28, hold: 0.42, depth: 3,
  len: [170, 265], wid: [15, 26],
  gap: { ...GAP, r: GAP.r * 1.16 },
  sides: { top: [138, 232], side: [200, 320], foot: [230, 380] },
})

/* ------------------------------------------------------------
   ONE PORTRAIT FRAME, FOR NARROW SCREENS.

   A 16:9 frame cannot frame a 9:19 window. `cover` on a phone scales
   the landscape plates by height and throws away most of their width,
   so both sides and the whole bottom of the frame are cropped off and
   what is left is blossom along the top: a fringe, not a frame.

   So a portrait plate, with its own gap in its own place. ONE rather
   than three, and that is a weight decision as much as a design one:
   a phone is the connection least able to afford three plates, and
   three depths of frame on a 390px screen resolve to about the same
   picture as one. A browser does not fetch a background-image whose
   media query does not match, so a desktop never pays for this and a
   phone never pays for the other three.
   ------------------------------------------------------------ */
const GAP_TALL = { x: 540, y: 900, r: 430, k: 1.45 }

const canopyTall = () => canopyLayer(1080, 1920, 0x6d13, {
  depthT: 0.16,
  bloomFrom: 2, perTwig: [13, 21], spread: 54, r: [7, 16],
  minLen: 26, hold: 0.4, depth: 3,
  len: [150, 250], wid: [12, 21],
  gap: GAP_TALL,
  sides: { top: [96, 160], side: [150, 250], foot: [150, 250] },
})

/* ============================================================
   THE PLAN OF THE QUARTER -- assets/quarter.svg

   The map plate under the ten destinations. It is a BACKDROP and it
   is also a map, and the first version only managed the first half:
   a near-black rectangle with a soft blue smear for a river and
   fifty isolated diamonds scattered over it. The owner's note was
   "it's just a bunch of rectangles... make it an actual map".

   WHAT MAKES A DRAWING READ AS A MAP is not detail, it is
   RELATIONSHIPS. Buildings gather into blocks; blocks sit along
   lanes; lanes run to a bridge because that is where the river can
   be crossed; fields take the contour because water does. Scatter
   the same number of marks at random and you get noise at any
   density. So this is built in that order: land, then water, then
   the crossings, then the lanes that want them, then the districts
   that grow on the lanes, and only then the texture in what is left.

   THE VALUE RANGE STAYS NARROW, for the reason it always did: ten
   coloured pins have to read on top of every part of it, and the
   first plate ran #12202e to #26445d, on which the pins looked
   either invisible or like stickers. What changed is that the
   reading is now carried by LINES rather than by fills. A hairline
   two steps lighter than its ground is legible where a filled shape
   two steps lighter is barely there, and it costs the pins nothing.

   IT CARRIES NO DESTINATIONS AND NO TRAIL. Those are drawn in the
   DOM by app.js from the same coordinates the markers use, so the
   trail cannot drift away from the places it joins. Baked in here
   they would be a second copy of those numbers, wrong the first
   time anybody moved a room.
   ============================================================ */
function quarterPlan() {
  /* ============================================================
     THE MAP OF THE VALE

     "That map's way too small and dinky and not fun enough. Make it
     feel like I'm in Narnia or Lord of the Rings."

     The old one was a PLAN: contour bands, a river, roof rectangles.
     Accurate, legible, and the wrong genre entirely. A plan is what
     a surveyor draws. What was asked for is what an ADVENTURER
     carries, and the difference is not detail, it is that every
     feature on a fantasy map is a DRAWING of the thing rather than a
     measurement of it.

     Five marks do nearly all of the work, and each is here because
     leaving it out is what made the first attempt read as a diagram:

       HACHURED PEAKS. A mountain drawn as a filled triangle with a
       shaded wedge is a triangle. What makes it a mountain is the
       flank being RULED -- a fan of short strokes down the shadow
       side, closer together at the ridge. It is the mark on every
       engraved map since the eighteenth century, and it costs six
       lines a peak.

       PEAKS DRAWN BACK TO FRONT, ONE ELEMENT EACH. Batched into a
       single path, every hachure paints over every peak in front of
       it and the range flattens into a frieze. The near peak has to
       be able to interrupt the far one; that occlusion is the only
       depth cue a flat drawing gets, and it is worth forty extra
       elements.

       TREES THAT DO NOT TOUCH. The first pass scattered them and let
       them overlap, and a wood came out as grey confetti. Rejection
       sampling on a minimum spacing keeps every tree a readable
       shape, and the eye reads the drift as woodland without
       counting them.

       BANK LINES, NOT TICKS. Engraver's water is drawn PARALLEL to
       the shore, two or three lines out, fading. Ticks across the
       bank read as a railway.

       LETTERING. A map with no names on it is a diagram. Four region
       names, a cartouche and a scale bar, in an italic serif -- and
       nothing exotic, because this file is fetched as an image and
       an image cannot go and get a webfont.

     DRAWN IN THE PAINTING'S OWN COLOURS. This hangs under a warm
     dusk hero, so it is not parchment: parchment would be a bright
     block in the middle of a dark page. It is the vale at the same
     hour as the painting, lit the same way, with the ink a warm
     near-black rather than a cool one.

     AND THE GROUND IS A GRADIENT, NOT TWO SHAPES. It was a lighter
     quadrilateral laid over a darker rectangle to give the far half
     some air, and the join between them was a ruled diagonal a
     thousand pixels long across the middle of the map. Nothing about
     the shading was wrong; the EDGE was. A gradient has no edge.

     THE VALUE RANGE STAYS NARROW. Ten coloured pins sit on top and
     they have to read on every part of it. What carries the drawing
     is line weight, not fill.
     ============================================================ */
  const w = 2000, h = 1250
  const rand = rng(0x9d4c)

  /* NINE NEUTRALS, CONVERTED RATHER THAN REPICKED (monochrome
     restyle, 2026-09-04). These were a mauve ground, a rose pen and
     a blue river, and they were the last visible hue on the site:
     the plate read as a purple panel with a blue snake through it
     under a page that had gone entirely to ink everywhere else.

     Each one is its own former colour's LUMINANCE, so the drawing
     keeps every value relationship it was composed with and only
     loses the hue. Ground 43 over ridge 23, pen 106 lifting to 148
     where it is pressed: all of that is unchanged.

     THE RIVER IS THE ONE THAT COULD NOT BE A STRAIGHT CONVERSION,
     and it is worth knowing why. Water measured 28 and the near
     ground measured 30, two points apart, because in the old plate
     the river was told apart from the land by being BLUE and not
     by being darker. Convert both honestly and the river vanishes.
     So the water drops to 14 and its lit edge climbs to 118: a
     dark channel with a bright bank, which is how a pen would have
     drawn it if it had never had a colour to lean on. */
  const INK      = '#0c0c0c'
  const LAND_HI  = '#2b2b2b'   /* the ground, far side */
  const LAND     = '#1e1e1e'   /* the ground, near side */
  const RIDGE    = '#171717'   /* rock, a shade under the ground it stands on */
  const LINE     = '#6a6a6a'   /* the pen */
  const LINE_HI  = '#949494'   /* the pen, pressed */
  const WATER    = '#0e0e0e'
  const WATER_HI = '#767676'
  const LEAF     = '#131313'

  const peaks = []      /* {y, svg} -- sorted and emitted back to front */
  const trees = [], roofs = [], walls = [], roads = [], banks = []

  /* ---------------------------------------------------- the water
     One river, one lake it opens into. Everything else is placed
     against these, because in a real landscape everything is. */
  const riverAt = (t) => [620 + Math.sin(t * 2.7) * 210 + t * 300, 90 + t * 1180]
  const riverW = (t) => 15 + t * 32

  const riverBody = (() => {
    const L = [], R = []
    for (let i = 0; i <= 34; i++) {
      const t = i / 34, [x, y] = riverAt(t), q = riverW(t)
      L.push([x - q, y]); R.push([x + q, y])
    }
    let d = `M${n(L[0][0])} ${n(L[0][1])}`
    for (const [x, y] of L) d += `L${n(x)} ${n(y)}`
    for (let i = R.length - 1; i >= 0; i--) d += `L${n(R[i][0])} ${n(R[i][1])}`
    return d + 'Z'
  })()

  const LAKE = { cx: 1500, cy: 985, rx: 258, ry: 132 }
  const lakeAt = (a, grow) => {
    const wob = 1 + Math.sin(a * 3 + 0.7) * 0.09 + Math.sin(a * 5) * 0.05
    return [LAKE.cx + Math.cos(a) * (LAKE.rx * wob + grow),
            LAKE.cy + Math.sin(a) * (LAKE.ry * wob + grow)]
  }
  const lakeRing = (grow) => {
    let d = ''
    for (let i = 0; i <= 46; i++) {
      const [x, y] = lakeAt((i / 46) * Math.PI * 2, grow)
      d += (i ? 'L' : 'M') + `${n(x)} ${n(y)}`
    }
    return d + 'Z'
  }
  const lake = lakeRing(0)
  /* an island, because an empty lake is a puddle */
  const isle = (() => {
    let d = ''
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2
      const r = 1 + Math.sin(a * 4 + 1.4) * 0.16
      d += (i ? 'L' : 'M') + `${n(1556 + Math.cos(a) * 36 * r)} ${n(962 + Math.sin(a) * 20 * r)}`
    }
    return d + 'Z'
  })()

  /* THE BANK LINES. Parallel to the shore, three out, each fainter
     and more broken than the last, which is how an engraver draws
     the edge of water and the reason a map reads as water at all. */
  for (let k = 1; k <= 3; k++) {
    let d = ''
    for (let i = 0; i <= 34; i++) {
      const t = i / 34, [x, y] = riverAt(t), q = riverW(t) + k * 11
      d += (i ? 'L' : 'M') + `${n(x - q)} ${n(y)}`
    }
    for (let i = 0; i <= 34; i++) {
      const t = i / 34, [x, y] = riverAt(t), q = riverW(t) + k * 11
      d += (i ? 'L' : 'M') + `${n(x + q)} ${n(y)}`
    }
    banks.push({ d: d + lakeRing(k * 12), k })
  }

  /* ---------------------------------------------------- the peaks
     A PEAK IS A DRAWING. Two flanks with a shoulder in one of them,
     so the silhouette is crooked the way a drawn one is; a fan of
     hachures down the right; a snow chevron on the big ones. The
     shade always falls the same way, because a map lit from two
     directions reads as a mistake even to somebody who could not say
     why. */
  function peakGlyph(x, y, s) {
    const half = s * 0.80
    const sx = x + (rand() - 0.5) * s * 0.14
    const body =
      `M${n(x - half)} ${n(y)}L${n(x - half * 0.44)} ${n(y - s * 0.54)}` +
      `L${n(sx)} ${n(y - s)}L${n(x + half)} ${n(y)}Z`
    let hach = ''
    const lines = 3 + Math.round(s / 13)
    for (let i = 1; i <= lines; i++) {
      /* squared so the strokes crowd toward the ridge, which is
         where a real hachure is densest */
      const t = Math.pow(i / (lines + 1), 0.78)
      const px = sx + (x + half - sx) * t
      const py = (y - s) + s * t
      const len = s * 0.40 * (1 - t * 0.62)
      hach += `M${n(px)} ${n(py)}L${n(px - len * 0.78)} ${n(py + len * 0.42)}`
    }
    let cap = ''
    if (s > 40) {
      cap = `M${n(sx - half * 0.34)} ${n(y - s * 0.58)}L${n(sx - half * 0.12)} ${n(y - s * 0.76)}` +
            `L${n(sx + half * 0.02)} ${n(y - s * 0.64)}L${n(sx + half * 0.16)} ${n(y - s * 0.80)}`
    }
    peaks.push({ y, svg:
      `<path fill="${RIDGE}" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round" d="${body}"/>` +
      `<path fill="none" stroke="${LINE}" stroke-width="1.15" opacity=".62" stroke-linecap="round" d="${hach}"/>` +
      (cap ? `<path fill="none" stroke="${LINE_HI}" stroke-width="1.7" opacity=".72" stroke-linecap="round" stroke-linejoin="round" d="${cap}"/>` : '')
    })
  }

  /* A RANGE IS A ROW THAT OVERLAPS ITSELF. Peaks placed apart read
     as a row of tents; peaks that overlap read as mountains. */
  function range(x0, y0, x1, y1, count, big) {
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1)
      peakGlyph(
        x0 + (x1 - x0) * t + (rand() - 0.5) * 48,
        y0 + (y1 - y0) * t + (rand() - 0.5) * 34,
        big * (0.55 + Math.pow(rand(), 1.6) * 0.8))
    }
  }

  range(140, 300, 700, 195, 14, 60)      // the northern wall
  range(1160, 235, 1620, 300, 11, 64)    // the eastern range
  range(120, 640, 380, 900, 7, 42)       // a western spur
  range(1520, 585, 1900, 720, 8, 46)     // the eastern foothills

  /* --------------------------------------------------- the forest
     Individual trees, in drifts, and NOT TOUCHING. The first pass
     let them overlap and a wood came out as grey confetti: a
     silhouette that shares an edge with its neighbour stops being a
     tree and becomes texture. */
  function tree(x, y, s) {
    trees.push(
      `M${n(x)} ${n(y - s)}L${n(x + s * 0.46)} ${n(y - s * 0.12)}` +
      `L${n(x + s * 0.20)} ${n(y - s * 0.18)}L${n(x + s * 0.38)} ${n(y + s * 0.24)}` +
      `L${n(x + s * 0.10)} ${n(y + s * 0.20)}L${n(x + s * 0.10)} ${n(y + s * 0.46)}` +
      `L${n(x - s * 0.10)} ${n(y + s * 0.46)}L${n(x - s * 0.10)} ${n(y + s * 0.20)}` +
      `L${n(x - s * 0.38)} ${n(y + s * 0.24)}L${n(x - s * 0.20)} ${n(y - s * 0.18)}` +
      `L${n(x - s * 0.46)} ${n(y - s * 0.12)}Z`)
  }
  function wood(cx, cy, rx, ry, count) {
    const placed = []
    let guard = 0
    while (placed.length < count && guard++ < count * 60) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand())
      const x = cx + Math.cos(a) * rx * r, y = cy + Math.sin(a) * ry * r
      const [rvx] = riverAt((y - 90) / 1180)
      if (Math.abs(x - rvx) < riverW((y - 90) / 1180) + 46) continue
      const s = 13 + rand() * 8
      if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < (p[2] + s) * 0.54)) continue
      placed.push([x, y, s])
    }
    /* back to front, so a tree in front reads in front */
    placed.sort((a, b) => a[1] - b[1])
    for (const [x, y, s] of placed) tree(x, y, s)
  }
  wood(430, 470, 210, 118, 96)
  wood(1010, 335, 230, 92, 82)
  wood(1730, 900, 200, 130, 86)
  wood(770, 1075, 270, 112, 102)
  wood(1200, 705, 150, 92, 46)

  /* ------------------------------------------------ the townships
     Tiny roofs inside a wall. The wall is what makes a scatter of
     marks read as a PLACE: without it they are just more texture. */
  const TOWNS = [
    { x: 300, y: 800, r: 78, n: 22 },
    { x: 690, y: 620, r: 62, n: 16 },
    { x: 1010, y: 900, r: 92, n: 30 },
    { x: 1330, y: 470, r: 70, n: 18 },
    { x: 1620, y: 1090, r: 60, n: 14 },
    { x: 520, y: 1020, r: 56, n: 13 },
  ]
  for (const T of TOWNS) {
    const placed = []
    let guard = 0
    while (placed.length < T.n && guard++ < T.n * 40) {
      const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * T.r * 0.8
      const x = T.x + Math.cos(a) * r, y = T.y + Math.sin(a) * r * 0.8
      if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < 17)) continue
      placed.push([x, y])
      const s = 6 + rand() * 4
      roofs.push(
        `M${n(x - s)} ${n(y + s * 0.7)}L${n(x - s)} ${n(y - s * 0.1)}` +
        `L${n(x)} ${n(y - s * 0.95)}L${n(x + s)} ${n(y - s * 0.1)}` +
        `L${n(x + s)} ${n(y + s * 0.7)}Z`)
    }
    let ring = ''
    for (let k = 0; k <= 34; k++) {
      const a = (k / 34) * Math.PI * 2
      const rr = T.r * (1 + Math.sin(a * 4 + T.x) * 0.07)
      ring += (k ? 'L' : 'M') + `${n(T.x + Math.cos(a) * rr)} ${n(T.y + Math.sin(a) * rr * 0.8)}`
    }
    walls.push(ring + 'Z')
  }

  /* ------------------------------------------------------ the roads
     Dashed, and they run between townships and to the crossings. A
     road that ignores the river is the fastest way to make a map
     look generated. */
  const CROSSINGS = [0.26, 0.62].map((t) => {
    const [x, y] = riverAt(t); return { x, y, t }
  })
  const side = (p) => (p.x < riverAt((p.y - 90) / 1180)[0] ? -1 : 1)
  const wobble = (a, b) => {
    let d = `M${n(a.x)} ${n(a.y)}`
    for (let i = 1; i <= 5; i++) {
      const t = i / 5
      d += `L${n(a.x + (b.x - a.x) * t + (rand() - 0.5) * 34)} ` +
           `${n(a.y + (b.y - a.y) * t + (rand() - 0.5) * 34)}`
    }
    return d
  }
  for (let i = 0; i < TOWNS.length; i++) {
    for (let j = i + 1; j < TOWNS.length; j++) {
      const A = TOWNS[i], B = TOWNS[j]
      if (Math.hypot(A.x - B.x, A.y - B.y) > 520) continue
      if (side(A) === side(B)) { roads.push(wobble(A, B)); continue }
      const c = CROSSINGS.reduce((best, k) =>
        Math.hypot(A.x - k.x, A.y - k.y) + Math.hypot(B.x - k.x, B.y - k.y) <
        Math.hypot(A.x - best.x, A.y - best.y) + Math.hypot(B.x - best.x, B.y - best.y) ? k : best)
      roads.push(wobble(A, c) + wobble(c, B))
    }
  }
  /* A BRIDGE IS TWO RAILS AND ITS TIES, not a filled bar. The bar
     read as a smudge across the river at map scale. */
  const bridges = CROSSINGS.map(c => {
    const q = riverW(c.t) + 14
    let d = `M${n(c.x - q)} ${n(c.y - 7)}L${n(c.x + q)} ${n(c.y - 7)}` +
            `M${n(c.x - q)} ${n(c.y + 7)}L${n(c.x + q)} ${n(c.y + 7)}`
    for (let i = 0; i <= 5; i++) {
      const x = c.x - q + (2 * q) * (i / 5)
      d += `M${n(x)} ${n(c.y - 7)}L${n(x)} ${n(c.y + 7)}`
    }
    return d
  }).join('')

  /* ------------------------------------------------ the compass rose
     Eight points, the cardinals long and the ordinals short, with
     each point split light and dark the way every rose since the
     portolan charts has been. Smaller than it was and moved clear of
     the eastern range, which it had been sitting on top of. */
  function rose(cx, cy, r) {
    let light = '', dark = ''
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const len = i % 2 ? r * 0.42 : r
      const wid = i % 2 ? r * 0.08 : r * 0.12
      const tx = cx + Math.cos(a) * len, ty = cy + Math.sin(a) * len
      const lx = cx + Math.cos(a + Math.PI / 2) * wid, ly = cy + Math.sin(a + Math.PI / 2) * wid
      const rx = cx + Math.cos(a - Math.PI / 2) * wid, ry = cy + Math.sin(a - Math.PI / 2) * wid
      light += `M${n(cx)} ${n(cy)}L${n(lx)} ${n(ly)}L${n(tx)} ${n(ty)}Z`
      dark += `M${n(cx)} ${n(cy)}L${n(tx)} ${n(ty)}L${n(rx)} ${n(ry)}Z`
    }
    let ring = ''
    for (const rr of [r * 1.18, r * 1.27]) {
      ring += `M${n(cx - rr)} ${n(cy)}A${n(rr)} ${n(rr)} 0 1 0 ${n(cx + rr)} ${n(cy)}` +
              `A${n(rr)} ${n(rr)} 0 1 0 ${n(cx - rr)} ${n(cy)}`
    }
    return { light, dark, ring }
  }
  const R = rose(1852, 232, 54)

  /* --------------------------------------------------- the border
     A double rule with the corners turned, which is the cheapest
     possible way to say the thing you are looking at is a document
     rather than a picture. */
  const m1 = 22, m2 = 34
  const frame = [m1, m2].map(m =>
    `M${m} ${m}L${w - m} ${m}L${w - m} ${h - m}L${m} ${h - m}Z`).join('')
  const corners = [[m2, m2, 1, 1], [w - m2, m2, -1, 1], [m2, h - m2, 1, -1], [w - m2, h - m2, -1, -1]]
    .map(([x, y, sx, sy]) =>
      `M${n(x + sx * 46)} ${n(y)}L${n(x)} ${n(y)}L${n(x)} ${n(y + sy * 46)}` +
      `M${n(x + sx * 16)} ${n(y + sy * 16)}L${n(x + sx * 30)} ${n(y + sy * 16)}` +
      `M${n(x + sx * 16)} ${n(y + sy * 16)}L${n(x + sx * 16)} ${n(y + sy * 30)}`).join('')

  /* -------------------------------------------------- the lettering
     A SERIF STACK WITH NO WEBFONT IN IT. This file is fetched as an
     image, and an image is its own document with no access to the
     page's @font-face rules: name the site's display face here and
     every one of these falls back to the browser default, in a
     different size, and the map is suddenly set in Times.

     The names are placed in the gaps between the ten pins, which sit
     at known percentages (js/app.js, ROOMS). A label under a pin is
     a label nobody can read. */
  const FONT = `Georgia,'Iowan Old Style','Palatino Linotype',serif`
  const label = (x, y, size, text, rot) =>
    `<text x="${x}" y="${y}" font-family="${FONT}" font-style="italic" ` +
    `font-size="${size}" letter-spacing="${(size * 0.22).toFixed(1)}" ` +
    `fill="${LINE_HI}" opacity=".5" text-anchor="middle"` +
    (rot ? ` transform="rotate(${rot} ${x} ${y})"` : '') + `>${text}</text>`

  const lettering =
    label(400, 132, 30, 'The Northern Wall') +
    label(150, 560, 26, 'Greensleep', 0) +
    label(1560, 430, 26, 'The Eastern Reach') +
    label(1500, 1155, 26, 'The Still Water') +
    label(905, 505, 24, 'Lantern Water', 74)

  /* THE CARTOUCHE, bottom left, under the one pin whose label ends
     highest on that side. Two rules, a name and a scale bar: the
     three marks a chart carries to say it is a chart. */
  const cx0 = 78, cy0 = 1084, cw = 400, ch = 104
  const cartouche =
    `<path fill="${LAND}" fill-opacity=".72" stroke="${LINE_HI}" stroke-width="1.3" ` +
    `stroke-opacity=".45" d="M${cx0} ${cy0}L${cx0 + cw} ${cy0}L${cx0 + cw} ${cy0 + ch}L${cx0} ${cy0 + ch}Z"/>` +
    `<path fill="none" stroke="${LINE_HI}" stroke-width=".9" stroke-opacity=".3" ` +
    `d="M${cx0 + 8} ${cy0 + 8}L${cx0 + cw - 8} ${cy0 + 8}L${cx0 + cw - 8} ${cy0 + ch - 8}L${cx0 + 8} ${cy0 + ch - 8}Z"/>` +
    `<text x="${cx0 + cw / 2}" y="${cy0 + 44}" font-family="${FONT}" font-size="27" ` +
    `letter-spacing="5.4" fill="${LINE_HI}" opacity=".72" text-anchor="middle">THE LANTERN QUARTER</text>` +
    `<path fill="none" stroke="${LINE_HI}" stroke-width="1.4" stroke-opacity=".5" ` +
    `d="M${cx0 + 118} ${cy0 + 72}L${cx0 + 282} ${cy0 + 72}` +
    `M${cx0 + 118} ${cy0 + 66}L${cx0 + 118} ${cy0 + 78}` +
    `M${cx0 + 200} ${cy0 + 68}L${cx0 + 200} ${cy0 + 76}` +
    `M${cx0 + 282} ${cy0 + 66}L${cx0 + 282} ${cy0 + 78}"/>` +
    `<text x="${cx0 + cw / 2}" y="${cy0 + 93}" font-family="${FONT}" font-style="italic" ` +
    `font-size="16" letter-spacing="1.6" fill="${LINE_HI}" opacity=".5" text-anchor="middle">two days on foot</text>`

  const g = (list) => list.join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${LAND_HI}"/>
      <stop offset=".62" stop-color="${LAND}"/>
      <stop offset="1" stop-color="${LAND}"/>
    </linearGradient>
    <radialGradient id="vign" cx=".5" cy=".46" r=".78">
      <stop offset=".55" stop-color="${INK}" stop-opacity="0"/>
      <stop offset="1" stop-color="${INK}" stop-opacity=".55"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#ground)"/>
  <path fill="${WATER}" stroke="${LINE_HI}" stroke-width="1.2" stroke-opacity=".38" d="${riverBody}${lake}"/>
  <path fill="${LAND}" stroke="${LINE}" stroke-width="1.1" stroke-opacity=".5" d="${isle}"/>
  ${banks.map(b => `<path fill="none" stroke="${WATER_HI}" stroke-width="1.1" ` +
    `opacity="${(0.5 - b.k * 0.12).toFixed(2)}" stroke-dasharray="${18 - b.k * 4} ${4 + b.k * 5}" d="${b.d}"/>`).join('\n  ')}
  <path fill="none" stroke="${LINE}" stroke-width="2" stroke-linecap="round"
        stroke-dasharray="9 8" opacity=".5" d="${g(roads)}"/>
  <path fill="none" stroke="${LINE_HI}" stroke-width="1.3" opacity=".6" d="${bridges}"/>
  ${peaks.sort((a, b) => a.y - b.y).map(p => p.svg).join('\n  ')}
  <path fill="${LEAF}" stroke="${LINE}" stroke-width="1.15" stroke-opacity=".78"
        stroke-linejoin="round" d="${g(trees)}"/>
  <path fill="none" stroke="${LINE}" stroke-width="1.2" stroke-dasharray="5 6" opacity=".45" d="${g(walls)}"/>
  <path fill="${RIDGE}" stroke="${LINE_HI}" stroke-width=".9" stroke-opacity=".7" d="${g(roofs)}"/>
  <path fill="${LINE_HI}" opacity=".34" d="${R.light}"/>
  <path fill="${INK}" opacity=".6" d="${R.dark}"/>
  <path fill="none" stroke="${LINE_HI}" stroke-width="1.3" opacity=".4" d="${R.ring}"/>
  <rect width="${w}" height="${h}" fill="url(#vign)"/>
  ${lettering}
  ${cartouche}
  <path fill="none" stroke="${LINE_HI}" stroke-width="1.4" opacity=".32" d="${frame}"/>
  <path fill="none" stroke="${LINE_HI}" stroke-width="1.4" opacity=".44" stroke-linecap="round" d="${corners}"/>
</svg>\n`
}

/* ------------------------------------------------------------
   THE SKY, AS CUSTOM PROPERTIES

   Written from here rather than typed into a stylesheet so that the
   plates and the gradient they stand in can never disagree: change
   SKY above and both move together.
   ------------------------------------------------------------ */
function skyCss() {
  return `/* GENERATED by tools/city.mjs. Do not edit; run the tool.

   Blue hour over the Lantern Quarter. The one relationship that
   matters here is that --city-glow is WARM and everything above it
   is COOL; that single contrast is what makes the scene look lit.
   Flatten it and the city goes grey. */
:root{
  --city-sky-top:${SKY.top};
  --city-sky-upper:${SKY.upper};
  --city-sky-mid:${SKY.mid};
  --city-sky-low:${SKY.low};
  --city-haze:${SKY.haze};
  --city-glow:${SKY.glow};
  --city-crag:${BAND.crag};
  --city-far:${BAND.far};
  --city-mid:${BAND.mid};
  --city-near:${BAND.near};
  --city-lantern:${LIGHT.lantern};
  --city-hot:${LIGHT.hot};
  --city-jade:${LIGHT.jade};
  --city-blossom:${LIGHT.blossom};
  --city-blossom-far:${LIGHT.blossomFar};
  --city-sun:${LIGHT.sun};
}
`
}

/* ------------------------------------------------------------ */
function write(rel, text) {
  const path = join(ROOT, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  console.log(String(Buffer.byteLength(text)).padStart(7) + '  ' + rel)
}

write('public/assets/city-crag.svg', crags().svg(BAND.crag))
write('public/assets/city-far.svg', farCity().svg(BAND.far))
write('public/assets/city-mid.svg', quarter().svg(BAND.mid))
write('public/assets/city-near.svg', nearEaves().svg(BAND.near))
write('public/assets/city-canopy-far.svg', canopyFar())
write('public/assets/city-canopy-mid.svg', canopyMid())
write('public/assets/city-canopy-near.svg', canopyNear())
write('public/assets/city-canopy-tall.svg', canopyTall())
write('public/assets/city-peak.svg', peak())
write('public/assets/quarter.svg', quarterPlan())
write('public/css/city-sky.css', skyCss())
