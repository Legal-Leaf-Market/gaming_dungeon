/* ============================================================
   tools/ink.mjs — the ink that shows through on hover

   THE IDEA IS THE OWNER'S AND IT IS THE BEST ONE THIS SITE HAS HAD:
   "leave everything default, but anything you hover over, make this
   black and white ink thing... not just black and white, I don't
   want it sterile, I want black and white ink hand drawn."

   It works because the site already has this story in it. The boot
   plate is a brush enso on black; the studio's own mark is a brush V
   inside a brush ring; the colour world is what the ink lifts to
   reveal. So a hover that peels a control back to paper and ink is
   not a new effect bolted on, it is the site showing its own
   underlayer for as long as you are touching it.

   THREE ASSETS, and each exists because CSS cannot fake it:

     ink-frame.svg  a brush-drawn rounded rectangle, used as
                    border-image so a button gets a hand-drawn edge
                    instead of a 1px machine line
     enso.svg       a brush ring for the round things (the map pins),
                    the same gesture as the logo's
     paper.svg      grain, so the paper is paper

   ON THE GRAIN, because this repo has been burned by texture before:
   two attempts to grain the SCENE were reverted, and the note is
   still in tools/city.mjs -- multiply-blended noise over large flat
   fills reads as dirt. This is the opposite case and the difference
   is worth stating. That was noise over a picture at full-screen
   scale; this is paper grain on a 40px control that is pretending to
   BE paper. Grain is what makes paper read as paper. Same technique,
   opposite job.

   Run:  node tools/ink.mjs
   ============================================================ */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INK = '#141414'

function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const n = (v) => Math.round(v * 10) / 10

/* ------------------------------------------------------------
   A BRUSH STROKE ALONG A PATH OF POINTS

   Drawn as filled geometry rather than as a stroke, because a stroke
   has ONE width and a brush does not. The whole difference between
   "hand drawn" and "thin border with rounded corners" is that the
   line swells and thins: heavier where the brush lands and where it
   changes direction, nearly dry where it leaves.

   Walk the points offsetting by the half-width to one side, then
   walk back the other way. One closed path, consistent winding.
   ------------------------------------------------------------ */
function brush(pts, widthAt, upto = 1) {
  /* `upto` truncates the stroke part-way round WITHOUT changing the part
     already drawn: widthAt is still asked for the fraction along the WHOLE
     path, so point 12 has the same swell in the half-drawn frame as in the
     finished one. Normalising to the truncated length instead would make
     every stage a different drawing, and the sequence would read as a line
     wriggling rather than as a brush travelling. */
  const total = pts.length
  const n_pts = Math.max(2, Math.round(total * upto))
  const L = [], R = []
  for (let i = 0; i < n_pts; i++) {
    const p = pts[i]
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(total - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len
    const w = widthAt(i / (total - 1))
    L.push([p[0] + nx * w, p[1] + ny * w])
    R.push([p[0] - nx * w, p[1] - ny * w])
  }
  let d = `M${n(L[0][0])} ${n(L[0][1])}`
  for (let i = 1; i < L.length; i++) d += `L${n(L[i][0])} ${n(L[i][1])}`
  for (let i = R.length - 1; i >= 0; i--) d += `L${n(R[i][0])} ${n(R[i][1])}`
  return d + 'Z'
}

/* ------------------------------------------------------------
   THE FRAME

   A rounded rectangle walked as points, each nudged off true by a
   pixel or so, with the stroke swelling on the long runs and thinning
   at the corners. Cut for border-image with a 34px slice, so the four
   corners keep their brush character and the four edges repeat.

   Drawn at 240x240 rather than at the size of any particular button:
   border-image slices and repeats, so one frame fits every control on
   the site and none of them stretches it out of shape.
   ------------------------------------------------------------ */
function frame(seed = 0x1a7c, upto = 1) {
  const S = 240, r = 46, m = 26
  const rand = rng(seed)
  const pts = []
  const push = (x, y) => pts.push([
    x + (rand() - 0.5) * 2.6,
    y + (rand() - 0.5) * 2.6,
  ])
  const arc = (cx, cy, from, to) => {
    for (let k = 0; k <= 7; k++) {
      const a = from + (to - from) * (k / 7)
      push(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
    }
  }
  const edge = (x0, y0, x1, y1) => {
    for (let k = 1; k <= 7; k++) {
      push(x0 + (x1 - x0) * (k / 7), y0 + (y1 - y0) * (k / 7))
    }
  }
  const L = m, R = S - m, T = m, B = S - m
  arc(L + r, T + r, Math.PI, Math.PI * 1.5)
  edge(L + r, T, R - r, T)
  arc(R - r, T + r, Math.PI * 1.5, Math.PI * 2)
  edge(R, T + r, R, B - r)
  arc(R - r, B - r, 0, Math.PI * 0.5)
  edge(R - r, B, L + r, B)
  arc(L + r, B - r, Math.PI * 0.5, Math.PI)
  edge(L, B - r, L, T + r)
  pts.push(pts[0])

  /* Swells and thins around the perimeter. Three overlapping sine
     terms so the rhythm never repeats on a side. */
  const d = brush(pts, (t) =>
    3.4 + Math.sin(t * 15.2) * 1.5 + Math.sin(t * 6.1 + 2) * 1.1 + Math.sin(t * 31 + 1) * 0.5,
    upto)

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <path fill="${INK}" d="${d}"/>
</svg>\n`
}

/* ------------------------------------------------------------
   THE ENSO

   The same gesture as the logo's: one stroke round, heavy where the
   brush lands, dry and thin where it lifts, and a gap where it left
   the paper. The gap is the whole character of an enso; closing it
   makes a ring.
   ------------------------------------------------------------ */
function enso(seed = 0x33b1, upto = 1, steps = 96) {
  const S = 200, R = 78
  const rand = rng(seed)
  const start = -2.5, sweep = Math.PI * 2 - 0.55
  const pts = []
  for (let k = 0; k <= steps; k++) {
    const t = k / steps
    const a = start + sweep * t
    const rr = R + Math.sin(t * 9.3) * 2.6 + (rand() - 0.5) * 1.8
    pts.push([S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr])
  }
  /* Lands heavy, runs, and goes dry at the lift. */
  const d = brush(pts, (t) =>
    Math.max(0.7, 9 * Math.pow(1 - t, 0.55) * (0.55 + 0.45 * Math.sin(t * 5 + 1)) + 1.6),
    upto)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">
  <path fill="${INK}" d="${d}"/>
</svg>\n`
}

/* ------------------------------------------------------------
   PAPER

   feTurbulence, stitched so it tiles, desaturated and dropped to a
   tenth of an alpha. Four hundred bytes for something no raster
   could do at this size without banding.
   ------------------------------------------------------------ */
function paper() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">
  <filter id="p" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="4" stitchTiles="stitch"/>
    <feColorMatrix type="saturate" values="0"/>
    <feComponentTransfer><feFuncA type="linear" slope=".13"/></feComponentTransfer>
  </filter>
  <rect width="180" height="180" filter="url(#p)"/>
</svg>\n`
}

function write(rel, text) {
  const path = join(ROOT, rel)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
  console.log(String(Buffer.byteLength(text)).padStart(7) + '  ' + rel)
}

/* ------------------------------------------------------------
   THE DRAWING, AS AN ANIMATION

   The owner: "I want the buttons to animate as if they're drawing
   the ink... maybe even wiggle the text or the borders."

   Two separate things, and it is worth being clear which is which:

     THE DRAW-ON. The frame arrives one stage at a time, the brush
     travelling clockwise from the top-left corner. `brush(..., upto)`
     truncates the point list, so stage 3 of 6 is literally the first
     half of the same stroke -- not a different drawing scaled down.
     The swell pattern is indexed on the FULL path length, which is
     why the part already on the paper never changes as the rest
     arrives.

     THE BOIL. Once drawn, the line keeps moving, the way a line in
     hand-drawn animation does: three takes of the same frame with the
     jitter re-rolled, cycled a few times a second. Same geometry,
     same swell, different hand. That is the wiggle, and it is what
     stops the control looking like a printed rectangle.

   BOTH SHIP AS ONE GENERATED STYLESHEET OF DATA URIS, NOT AS FILES,
   and that is the whole reason this function exists. A draw-on is
   over in a third of a second; if the six stages are six URLs, the
   first hover spends that third of a second fetching them and the
   animation plays to an empty box. Every frame inlined in the
   stylesheet means the sequence is already in memory before the
   pointer arrives.

   PURELY ADDITIVE ON PURPOSE. This file defines @keyframes and
   nothing else. The resting appearance still comes from
   ink-frame.svg in ink.css, so if this stylesheet is missing or the
   visitor asked for reduced motion, every control still gets its
   hand-drawn frame -- it simply appears rather than draws.
   ------------------------------------------------------------ */

/* Rounded to whole units. The source is 240px stretched onto a
   control a third that size, so a tenth of a source pixel cannot
   survive the mapping, and at eleven frames of each shape the
   decimals were a quarter of the stylesheet. */
const coarse = (svg) => svg.replace(/-?\d+\.\d+/g, (m) => String(Math.round(parseFloat(m))))

const uri = (svg) =>
  'url("data:image/svg+xml,' +
  coarse(svg)
    .replace(/\n/g, '')
    .replace(/\s+/g, ' ')
    .replace(/"/g, "'")
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E') +
  '")'

/* Hard cuts, not a fade. Each stage owns a closed span of the
   timeline and the next one starts a hundredth of a percent later,
   so the browser never gets an interval to interpolate across. The
   default handling of a discrete property (flip at the halfway
   point) would also work, but only by accident of the spec; this
   says what it means. */
function steps(name, prop, frames) {
  const span = 100 / frames.length
  const body = frames.map((v, i) => {
    const a = i * span
    const b = (i + 1) * span - 0.01
    return `  ${a.toFixed(2)}%,${Math.min(b, 100).toFixed(2)}%{${prop}:${v}}`
  }).join('\n')
  return `@keyframes ${name}{\n${body}\n}\n`
}

const PAPER = 'url(/assets/paper.svg)'

function inkAnim() {
  /* Six stages for the frame. Fewer and the brush teleports between
     corners; more and the sequence outlasts a glance at a button. */
  const drawFrame = [0.18, 0.34, 0.51, 0.68, 0.84, 1].map((u) => uri(frame(0x1a7c, u)))
  /* Three takes. The first IS the resting frame, so the boil picks up
     from exactly where the draw-on stopped rather than jumping on its
     first tick. */
  const boilFrame = [0x1a7c, 0x2f31, 0x51ad].map((sd) => uri(frame(sd)))

  /* The enso is drawn at 64 points rather than 96 for the animation:
     the same ring within a pixel, two thirds of the bytes, and there
     are eight of these. */
  const drawEnso = [0.24, 0.46, 0.68, 0.86, 1].map((u) => uri(enso(0x33b1, u, 64)))
  const boilEnso = [0x33b1, 0x7c22, 0x1904].map((sd) => uri(enso(sd, 1, 64)))

  return `/* GENERATED BY tools/ink.mjs -- DO NOT EDIT BY HAND.
   Regenerate with \`npm run ink\`. Read that file's comments for why
   these are inline data URIs and not eleven separate SVGs.
   Keyframes only: the resting look lives in ink.css. */
` +
    steps('ink-draw', 'border-image-source', drawFrame) +
    steps('ink-boil', 'border-image-source', boilFrame) +
    steps('enso-draw', 'background-image', drawEnso.map((u) => `${u},${PAPER}`)) +
    steps('enso-boil', 'background-image', boilEnso.map((u) => `${u},${PAPER}`))
}

write('public/assets/ink-frame.svg', frame())
write('public/assets/enso.svg', enso())
write('public/assets/paper.svg', paper())
write('public/css/ink-anim.css', inkAnim())
