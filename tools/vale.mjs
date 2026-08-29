/* ============================================================
   tools/vale.mjs — the Azure Vale, drawn as a skyline
   ------------------------------------------------------------
   THE BACKGROUND IS NOT AN ILLUSTRATION. It is the game's own
   landform, evaluated. `Terrain.heightAt()` from
   Legal-Leaf-Market/roblox-game (src/server/Systems/World/Terrain.luau)
   is ported below line for line, and this file stands a camera in
   the vale's meadow, looks north at Heavenpillar, and traces the
   horizon it actually sees.

   That is the whole reason to generate it rather than draw it. A
   mountain range somebody sketched in a vector editor would be a
   mountain range; this one has Heavenpillar in it, at the height
   Heavenpillar is, with the vale's rim falling away on both sides in
   the order the rim is arranged, and a player who has stood in the
   meadow gets the same skyline on the shop.

   ------------------------------------------------------------
   THE ONE PLACE THIS IS NOT THE GAME

   `math.noise` is Roblox's Perlin. The reference improved-Perlin
   implementation below uses Ken Perlin's own permutation table,
   which is what Roblox's is built on, but the two are not promised
   to agree bit for bit and this has no way to check. So: every
   MOUNTAIN, every plateau, the island falloff, the river and the sea
   are exact, and the roughness laid over them is ours. The ridges
   are in the right places at the right heights; the crinkle on their
   flanks may not be the crinkle in game. If Roblox ever exposes the
   table, or somebody dumps heightAt() from a live server, this is
   the seam to check first.

   ------------------------------------------------------------
   WHY THREE FILES AND NOT ONE

   Parallax needs the bands to move independently, so each distance
   band is traced separately and written as its own SVG: far ridges
   crawl, near hills slide. Splitting by distance rather than by
   drawing three prettier and prettier ranges is also what makes the
   occlusion correct for free, since a near ridge is drawn over a far
   one exactly when it is in front of it.

   Run: node tools/vale.mjs
   ============================================================ */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------
   PERLIN, standing in for Roblox's math.noise(x, y).
   Ken Perlin's reference improved noise. Roblox's returns roughly
   [-0.5, 0.5] where the reference returns roughly [-1, 1], so the
   result is halved: get that scale wrong and the ridge roughening
   below either vanishes or doubles the mountains' height.
   ------------------------------------------------------------ */
const P = [
  151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
  8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,117,
  35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,71,
  134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,41,
  55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,89,
  18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,226,
  250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,17,182,
  189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,167,43,
  172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,246,97,
  228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,239,
  107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,254,
  138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
]
const PERM = new Uint8Array(512)
for (let i = 0; i < 512; i++) PERM[i] = P[i & 255]

const fade = t => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a, b, t) => a + t * (b - a)
function grad(hash, x, y, z) {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : (h === 12 || h === 14 ? x : z)
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v)
}
function noise(x, y, z = 0) {
  const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z)
  const u = fade(x), v = fade(y), w = fade(z)
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z
  return 0.5 * lerp(
    lerp(
      lerp(grad(PERM[AA], x, y, z), grad(PERM[BA], x - 1, y, z), u),
      lerp(grad(PERM[AB], x, y - 1, z), grad(PERM[BB], x - 1, y - 1, z), u), v),
    lerp(
      lerp(grad(PERM[AA + 1], x, y, z - 1), grad(PERM[BA + 1], x - 1, y, z - 1), u),
      lerp(grad(PERM[AB + 1], x, y - 1, z - 1), grad(PERM[BB + 1], x - 1, y - 1, z - 1), u), v), w)
}

/* ------------------------------------------------------------
   TERRAIN — ported from Terrain.luau. Keep it line for line.
   ------------------------------------------------------------ */
const SPAN = 768
const VILLAGE = { x: 170, z: 150 }, VILLAGE_HEIGHT = 11
const SUMMIT = { x: 0, z: -520 }, SUMMIT_HEIGHT = 296
const SHELF = { x: -140, z: -330 }, SHELF_HEIGHT = 95
const GROVE = { x: 430, z: 60 }

/* The great peak is Heavenpillar; the rest shape the vale's rim. */
const MOUNTAINS = [
  { x: 0, z: -520, h: 330, r: 350 },
  { x: -380, z: -330, h: 150, r: 190 },
  { x: 390, z: -350, h: 180, r: 210 },
  { x: 560, z: 180, h: 80, r: 220 },
  { x: -520, z: 280, h: 70, r: 200 },
  { x: 180, z: 560, h: 60, r: 190 },
  { x: -260, z: 520, h: 55, r: 170 },
]

const RIVER = [[0, -330], [30, -80], [90, 160], [60, 400], [110, 720]]
const RIVER_HALF_WIDTH = 17

function distanceToPolyline(x, z, pts) {
  let best = Infinity
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1]
    const abx = bx - ax, abz = bz - az
    const lenSq = abx * abx + abz * abz
    const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq))
    const cx = ax + abx * t, cz = az + abz * t
    best = Math.min(best, Math.sqrt((x - cx) ** 2 + (z - cz) ** 2))
  }
  return best
}
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t) }

export function heightAt(x, z) {
  let h = 10
    + noise(x * 0.0045 + 7.13, z * 0.0045 + 7.13) * 8
    + noise(x * 0.013 + 31.7, z * 0.013 + 31.7) * 3

  for (const m of MOUNTAINS) {
    const d = Math.sqrt((x - m.x) ** 2 + (z - m.z) ** 2)
    if (d < m.r) {
      const t = 1 - d / m.r
      const ridge = 0.78 + 0.44 * Math.abs(noise(x * 0.008 + 3.3, z * 0.008 + 3.3))
      h += m.h * t ** 1.7 * ridge
    }
  }

  const fromCenter = Math.sqrt(x * x + z * z)
  if (fromCenter > 620) h -= ((fromCenter - 620) / 140) ** 1.5 * 60

  const dRiver = distanceToPolyline(x, z, RIVER)
  if (dRiver < RIVER_HALF_WIDTH) {
    const channel = -4 * smooth(1 - dRiver / RIVER_HALF_WIDTH) - 0.5
    const blend = smooth(dRiver / RIVER_HALF_WIDTH)
    h = Math.min(h, channel * (1 - blend) + h * blend)
    h = Math.min(h, -3.5 + 4 * blend)
  }

  const plateau = (cx, cz, radius, blendRadius, level) => {
    const d = Math.sqrt((x - cx) ** 2 + (z - cz) ** 2)
    if (d < blendRadius) {
      const t = smooth(Math.max(0, d - radius) / Math.max(blendRadius - radius, 1))
      h = level * (1 - t) + h * t
    }
  }
  plateau(VILLAGE.x, VILLAGE.z, 120, 190, VILLAGE_HEIGHT)
  plateau(SUMMIT.x, SUMMIT.z, 44, 90, SUMMIT_HEIGHT)
  plateau(SHELF.x, SHELF.z, 30, 60, SHELF_HEIGHT)
  plateau(GROVE.x, GROVE.z, 46, 90, 14)

  return h
}

/* Terrain.build()'s own material rules, so the snowcaps land where
   the game puts snow rather than where a gradient looks nice. */
const SNOW_LINE = 235

/* ============================================================
   THE CAMERA
   ------------------------------------------------------------
   Standing on the village plateau, looking north at the summit.
   Eye height is a person's, not a drone's: the whole effect of a
   landscape rather than a wallpaper comes from the near hills
   sitting high in frame because you are standing among them.
   ============================================================ */
/* NOT ON THE VILLAGE PLATEAU, and this was the first thing that had
   to be fixed. plateau() flattens 120 studs around the village and
   blends out to 190, so a camera standing there has no relief within
   190 studs in any direction and both foreground bands traced as a
   dead horizontal slab. The meadow south-east of the village has the
   rolling base noise and nothing else, which is exactly what a
   foreground wants. */
const EYE = { x: 300, z: 350 }
const EYE_UP = 6                       /* studs above the ground you stand on */
const BEARING = Math.atan2(SUMMIT.x - EYE.x, SUMMIT.z - EYE.z)  /* look at Heavenpillar */
const FOV = (88 * Math.PI) / 180
const COLUMNS = 640                    /* one sample column per ~2px of a 1280 wide plate */

/* Distance bands. Each becomes one SVG, drawn near over far, which
   is also the correct occlusion order for nothing extra. */
const BANDS = [
  { name: 'far',  from: 400, to: 1600, step: 8 },
  { name: 'mid',  from: 120, to: 400,  step: 4 },
  { name: 'near', from: 6,   to: 120,  step: 1.5 },
]

/* The vertical window, in elevation angle. Everything is measured
   against the horizon (0 rad) so the three plates line up when they
   are stacked: a shared frame is what makes them one landscape
   instead of three unrelated ridge lines. */
const TOP_ANGLE = (26 * Math.PI) / 180
const BOT_ANGLE = (-13 * Math.PI) / 180

const PLATE_W = 1280
const PLATE_H = 460

const eyeY = heightAt(EYE.x, EYE.z) + EYE_UP

/* For one column and one band: the highest thing the eye meets. */
function ridge(theta, band) {
  const sx = Math.sin(theta), sz = Math.cos(theta)
  let bestAngle = -Infinity, bestH = 0, bestD = band.to
  for (let d = band.from; d <= band.to; d += band.step) {
    const x = EYE.x + sx * d, z = EYE.z + sz * d
    /* Past the island's rim there is only sea, and the sea is flat.
       Sampling it anyway is what gives the far band its waterline. */
    const h = Math.hypot(x, z) > SPAN * 1.9 ? -24 : heightAt(x, z)
    const a = Math.atan2(h - eyeY, d)
    if (a > bestAngle) { bestAngle = a; bestH = h; bestD = d }
  }
  return { angle: bestAngle, h: bestH, d: bestD }
}

const yOf = angle => {
  const t = (TOP_ANGLE - angle) / (TOP_ANGLE - BOT_ANGLE)
  return Math.max(-40, Math.min(PLATE_H + 40, t * PLATE_H))
}

function trace(band) {
  const pts = []
  for (let i = 0; i < COLUMNS; i++) {
    const theta = BEARING - FOV / 2 + (FOV * i) / (COLUMNS - 1)
    const r = ridge(theta, band)
    pts.push({ x: (i / (COLUMNS - 1)) * PLATE_W, y: yOf(r.angle), h: r.h, d: r.d })
  }
  return pts
}

const n2 = v => Math.round(v * 10) / 10

/* A filled silhouette: the ridge across the top, then straight down
   and back along the bottom of the plate. */
function silhouette(pts) {
  let d = 'M0 ' + n2(pts[0].y)
  for (let i = 1; i < pts.length; i++) d += ' L' + n2(pts[i].x) + ' ' + n2(pts[i].y)
  return d + ' L' + PLATE_W + ' ' + (PLATE_H + 40) + ' L0 ' + (PLATE_H + 40) + ' Z'
}

/* SNOW IS NOT A GRADIENT. Terrain.build() puts snow above 235 studs
   and nowhere else, so the caps are the contiguous runs of columns
   whose ridge point is actually that high. On Heavenpillar that is a
   cap with a ragged lower edge; on the rim peaks it is nothing,
   because the rim does not reach 235. Which is correct, and is the
   kind of thing a hand-drawn range gets wrong by sprinkling snow on
   every summit. */
function caps(pts) {
  const runs = []
  let run = null
  for (const p of pts) {
    if (p.h <= SNOW_LINE) { run = null; continue }
    if (!run) { run = []; runs.push(run) }
    run.push(p)
  }
  return runs.filter(r => r.length > 2).map(r => {
    const deep = Math.min(46, 8 + r.length * 0.9)
    let d = 'M' + n2(r[0].x) + ' ' + n2(r[0].y)
    for (let i = 1; i < r.length; i++) d += ' L' + n2(r[i].x) + ' ' + n2(r[i].y)
    for (let i = r.length - 1; i >= 0; i--) {
      /* the lower edge follows the ridge, offset and roughened, so
         snow sits in the hollows rather than cutting a straight line */
      const wob = 1 + 0.55 * noise(r[i].x * 0.04, 11.7)
      d += ' L' + n2(r[i].x) + ' ' + n2(r[i].y + deep * wob)
    }
    return d + ' Z'
  })
}

/* ============================================================
   THE PLATES
   ------------------------------------------------------------
   Ink wash, not photography. Distance in a shan shui painting is
   carried by VALUE alone: the far rim is barely darker than the
   paper, the near hills are nearly ink. Hue barely moves, and what
   little there is comes from --qi, the game's own blue, so the
   background cannot drift away from the palette.

   The fills are opaque colours rather than opacities on one colour
   because these sit over a sky gradient, and stacked translucency
   would let the sky tint every ridge behind every other ridge.
   ============================================================ */
const PLATES = [
  { band: BANDS[0], fill: '#c9d0da', snow: '#eef2f6', edge: '#b6c0cd' },
  { band: BANDS[1], fill: '#98a5b3', snow: '#dde5ec', edge: '#8593a3' },
  { band: BANDS[2], fill: '#5f6d78', snow: '#c8d3db', edge: '#4e5b66' },
]

function svg(plate) {
  const pts = trace(plate.band)
  const body = silhouette(pts)
  const snow = caps(pts).map(d =>
    '<path d="' + d + '" fill="' + plate.snow + '"/>').join('')
  /* The ridge line itself, stroked one shade darker: this is the
     brush edge, and without it the plates read as flat colour cards
     rather than as a drawn landscape. */
  const edge = 'M0 ' + n2(pts[0].y) +
    pts.slice(1).map(p => ' L' + n2(p.x) + ' ' + n2(p.y)).join('')
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PLATE_W + ' ' + PLATE_H +
    '" preserveAspectRatio="none" width="' + PLATE_W + '" height="' + PLATE_H + '">' +
    '<path d="' + body + '" fill="' + plate.fill + '"/>' + snow +
    '<path d="' + edge + '" fill="none" stroke="' + plate.edge +
    '" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>' +
    '</svg>\n'
}

const out = join(ROOT, 'public', 'assets')
mkdirSync(out, { recursive: true })
let summary = []
for (const plate of PLATES) {
  const file = 'vale-' + plate.band.name + '.svg'
  const text = svg(plate)
  writeFileSync(join(out, file), text)
  summary.push(file.padEnd(16) + String(text.length).padStart(7) + ' bytes')
}
console.log('eye at (' + EYE.x + ', ' + EYE.z + ') ' + eyeY.toFixed(1) + ' studs up, ' +
  'bearing ' + ((BEARING * 180) / Math.PI).toFixed(1) + ' deg toward Heavenpillar')
for (const line of summary) console.log('  ' + line)
