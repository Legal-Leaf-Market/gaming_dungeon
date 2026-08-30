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
  blossomFar:  '#d99ab4',
  blossom:     '#f4bcd0',
  blossomLit:  '#fdeef3',
  blossomCore: '#e8b06a',   // the little centre, warm
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
const R_STEPS = [4, 6, 8, 11, 15]
const SHAPES = []

/* Five petals around a centre. Each petal runs centre -> out one
   side -> tip -> back the other -> centre, which winds the same way
   as every other shape in this file (see THE VOCABULARY) so
   overlapping flowers of one tone union instead of punching holes. */
function flowerPath(r, rot, petals) {
  let d = ''
  for (let i = 0; i < petals; i++) {
    const a = rot + i * (Math.PI * 2 / petals)
    const tx = Math.cos(a) * r, ty = Math.sin(a) * r
    const w = r * (petals === 5 ? 0.66 : 0.72)
    const px = Math.cos(a + Math.PI / 2) * w, py = Math.sin(a + Math.PI / 2) * w
    const qx = Math.cos(a - Math.PI / 2) * w, qy = Math.sin(a - Math.PI / 2) * w
    d += `M0 0Q${m(px)} ${m(py)} ${m(tx)} ${m(ty)}Q${m(qx)} ${m(qy)} 0 0Z`
  }
  return d
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

/* Built once, at module load. Three rotations per flower size so a
   field of them does not read as a printed pattern. */
const LIB = R_STEPS.map((r, i) => {
  const set = {
    /* the big tiers get real petals; the small ones cannot show them
       at any size this scene renders (see DETAIL BY SIZE below) */
    full: r >= 8 ? [0, 1, 2].map((k) => {
      const id = 'f' + i + k
      SHAPES.push({ id, d: flowerPath(r, k * 0.42, 5) })
      return id
    }) : null,
    trio: r >= 6 ? [0, 1].map((k) => {
      const id = 't' + i + k
      SHAPES.push({ id, d: flowerPath(r, k * 0.6, 3) })
      return id
    }) : null,
    blob: (() => { const id = 'b' + i; SHAPES.push({ id, d: blobPath(r * 0.86) }); return id })(),
    bud: (() => { const id = 'd' + i; SHAPES.push({ id, d: budPath(r * 0.66) }); return id })(),
    core: (() => { const id = 'c' + i; SHAPES.push({ id, d: blobPath(Math.max(0.8, r * 0.13)) }); return id })(),
    lit: (() => { const id = 'l' + i; SHAPES.push({ id, d: blobPath(r * 0.34) }); return id })(),
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
      : set.trio ? pick(set.trio)
      : set.blob
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
    if (depth <= 1 && i >= 3 && rand() < 0.26) {
      lit.push(place(set.lit, x, y))
      if (rand() < 0.5) cores.push(place(set.core, x, y))
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
        bloomAt(
          x0 + (x1 - x0) * t + (rand() - 0.5) * spread,
          y0 + (y1 - y0) * t + (rand() - 0.5) * spread * 0.85,
          (opts.r[0] + rand() * (opts.r[1] - opts.r[0])) * scale,
          depth
        )
      }
    }
    if (depth <= 0 || len < opts.minLen) return
    const forks = rand() > 0.38 ? 3 : 2
    for (let i = 0; i < forks; i++) {
      const spread = (i - (forks - 1) / 2) * (0.46 + rand() * 0.3)
      /* pulled back toward straight down, generation by generation */
      const want = ang + spread + (rand() - 0.5) * 0.2
      const droop = want + (Math.PI / 2 - want) * opts.sink * rand()
      branch(x1, y1, droop, len * (0.6 + rand() * 0.2), w1, depth - 1)
    }
  }

  return { wood, far, near, lit, cores, branch }
}

function paint(sys) {
  /* far flowers, then the wood, then near, then the highlights.
     Wood between the two flower tones is the whole trick. */
  const defs = SHAPES.map((sh) => `<path id="${sh.id}" d="${sh.d}"/>`).join('')
  return `
  <defs>${defs}</defs>
  <g fill="${LIGHT.blossomFar}">${sys.far.join('')}</g>
  <path fill="${LIGHT.bough}" d="${sys.wood.join('')}"/>
  <g fill="${LIGHT.blossom}">${sys.near.join('')}</g>
  <g fill="${LIGHT.blossomLit}">${sys.lit.join('')}</g>
  <g fill="${LIGHT.blossomCore}">${sys.cores.join('')}</g>`
}

/* ============================================================
   PLATE 5 -- THE CANOPY

   Blossom across the WHOLE top of the window, tiling, so there is
   never a bare edge where the artwork stops. This is the half of
   "cherry blossoms everywhere" that a single corner ornament cannot
   do: the owner is standing under the tree looking out, so the tree
   has to be over the whole view, not in one corner of it.

   Limbs enter from the TOP EDGE and hang down. Nothing reaches the
   bottom of the plate except tapering twig tips, which is what
   keeps the layer from ending in a visible horizontal cut.
   ============================================================ */
function canopy() {
  const w = 2400, h = 820
  const seeds = rng(0x3c7f)
  const all = { wood: [], far: [], near: [], lit: [], cores: [] }
  const OPTS = {
    bloomFrom: 2, perTwig: [9, 19], spread: 44, r: [5, 12],
    minLen: 20, sink: 0.55,
  }

  /* THE PLATE TILES, SO ANYTHING NEAR AN EDGE IS DRAWN TWICE.

     The bands get this free from emit(); the canopy cannot, because
     a branch is not a shape at a coordinate, it is a recursive walk
     that consumes random numbers as it goes. Calling branch() a
     second time at x - w advances the generator and draws a
     DIFFERENT tree, which does not join up.

     So each anchor gets its own seed and is replayed: a fresh
     boughSystem on the same seed produces the identical tree, and
     the second copy is placed one full width over. Without this the
     canopy repeats at roughly 1370px on a 1440px window and every
     branch crossing the seam is visibly chopped -- which is the
     exact fault the owner called out on the old corner piece,
     arriving somewhere new. */
  const anchors = []
  let x = -120
  while (x < w + 160) {
    anchors.push({
      x,
      y: -34 - seeds() * 34,
      ang: 1.05 + (seeds() - 0.5) * 0.95,
      len: 104 + seeds() * 104,
      wid: 9 + seeds() * 6,
      seed: Math.floor(seeds() * 0xffffff),
    })
    x += 92 + seeds() * 96
  }

  for (const a of anchors) {
    const xs = [a.x]
    /* one width over, on whichever side puts the copy on screen */
    if (a.x < w * 0.5) xs.push(a.x + w); else xs.push(a.x - w)
    for (const px of xs) {
      const sys = boughSystem(rng(a.seed), OPTS)
      sys.branch(px, a.y, a.ang, a.len, a.wid, 3)
      for (const k of Object.keys(all)) all[k] = all[k].concat(sys[k])
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paint(all)}
</svg>\n`
}

/* ============================================================
   PLATE 6 -- THE NEAR BOUGH

   One heavy limb out of the top-left corner, in front of everything,
   and much larger than the version it replaces. The owner asked for
   "a massive growth of cherry blossom branches down from the top
   left", and separately noted that the old one was "clearly cutting
   off" -- it was a small box with the artwork running into all four
   of its edges, so the plate's own boundary read as a cut through
   the tree.

   Fixed twice over: the box is far bigger than the drawing, and
   every limb is aimed down and right from one corner, so the wood
   thins to nothing well inside the frame. Nothing to cut.
   ============================================================ */
function bough() {
  const w = 1500, h = 1150
  const rand = rng(0x4f2a)
  const sys = boughSystem(rand, {
    bloomFrom: 2, perTwig: [11, 21], spread: 58, r: [7, 19],
    minLen: 24, sink: 0.5,
  })
  /* Three limbs off the same corner at different angles, so the
     thing has a near side and a far side. One limb is a diagram. */
  /* Four heavy limbs plus two long thin trailing ones. The trailers
     are what stop the mass ending: without them the four limbs droop
     into a solid wedge with a boundary, and a boundary in a tree is
     the thing being complained about. These reach out past the
     others and carry a few flowers each, so the canopy thins to
     single twigs rather than stopping. */
  sys.branch(-60, -40, 0.44, 340, 30, 4)
  sys.branch(-30, 50, 0.80, 280, 23, 4)
  sys.branch(130, -70, 1.06, 245, 19, 4)
  sys.branch(-70, 190, 0.30, 230, 16, 4)
  sys.branch(60, -50, 0.20, 400, 11, 3)
  sys.branch(-40, 120, 0.62, 430, 9, 3)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">${paint(sys)}
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
write('public/assets/city-canopy.svg', canopy())
write('public/assets/city-bough.svg', bough())
write('public/css/city-sky.css', skyCss())
