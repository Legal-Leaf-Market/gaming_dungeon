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
const INK = '#15120e'

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
function brush(pts, widthAt) {
  const L = [], R = []
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len
    const w = widthAt(i / (pts.length - 1))
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
function frame() {
  const S = 240, r = 46, m = 26
  const rand = rng(0x1a7c)
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
    3.4 + Math.sin(t * 15.2) * 1.5 + Math.sin(t * 6.1 + 2) * 1.1 + Math.sin(t * 31 + 1) * 0.5)

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
function enso() {
  const S = 200, R = 78
  const rand = rng(0x33b1)
  const start = -2.5, sweep = Math.PI * 2 - 0.55
  const pts = []
  for (let k = 0; k <= 96; k++) {
    const t = k / 96
    const a = start + sweep * t
    const rr = R + Math.sin(t * 9.3) * 2.6 + (rand() - 0.5) * 1.8
    pts.push([S / 2 + Math.cos(a) * rr, S / 2 + Math.sin(a) * rr])
  }
  /* Lands heavy, runs, and goes dry at the lift. */
  const d = brush(pts, (t) =>
    Math.max(0.7, 9 * Math.pow(1 - t, 0.55) * (0.55 + 0.45 * Math.sin(t * 5 + 1)) + 1.6))
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

write('public/assets/ink-frame.svg', frame())
write('public/assets/enso.svg', enso())
write('public/assets/paper.svg', paper())
