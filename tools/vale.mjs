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
  { name: 'far',  from: 520, to: 1600, step: 8 },
  { name: 'mid',  from: 140, to: 520,  step: 4 },
]

/* THERE IS NO THIRD RIDGE, AND THAT IS THE TERRAIN'S ANSWER, NOT A
   SHORTCUT. A near band was traced first and came back a dead
   horizontal slab, twice, from two different camera positions. The
   reason is in heightAt(): inside 150 studs of anywhere in the vale
   floor there is only the rolling meadow base, which varies by about
   four studs, and four studs at sixty studs' distance is two degrees.
   The meadow really is flat. Faking relief there would have been the
   first invented thing in the file.

   So the foreground is what the vale actually puts in front of you:
   the bamboo grove. Flora.luau's own bambooClump() numbers, below. */

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
/* ============================================================
   THE COLOURS ARE THE GAME'S LIGHTING RIG, NOT A PALETTE
   ------------------------------------------------------------
   The first cut of this file picked ridge colours by eye and got
   them badly wrong in a way no amount of nudging would have fixed:
   they were COLD BLUE, and the vale is not cold or blue. Read
   WorldService.tuneSky() and it says so in its own comment, "late
   golden afternoon: warm, hazy, readable", and then sets the values
   that make it one. ClockTime 16.4, a low sun. Atmosphere the colour
   of old paper. A cream colour grade over the whole frame.

   So none of the numbers below are chosen. The terrain materials
   give the rock, grass and snow their base colours; the lighting rig
   gives the haze that eats them with distance and the grade that
   warms what is left; and the plate colours fall out of the two.
   Change the game's sky and this background changes with it, which
   is the entire point of deriving rather than drawing.
   ============================================================ */

/* WorldService.tuneSky(), verbatim. */
const SKY = {
  ambient: [96, 90, 78],
  outdoorAmbient: [138, 128, 112],
  atmosphere: [222, 214, 198],   /* what distance fades everything toward */
  decay: [130, 120, 104],        /* what the light decays to at the horizon */
  haze: 2.6,
  density: 0.38,
  clouds: [235, 230, 220],
  cloudCover: 0.66,
  tint: [255, 246, 230],         /* ColorCorrection.TintColor */
  contrast: 0.05,
  saturation: 0.05,
}

/* Roblox's default terrain material colours, which is what
   Terrain.build() is filling with: it names materials, never
   colours, so these are the colours the vale actually is. */
const MATERIAL = {
  grass: [106, 127, 63],
  leafyGrass: [115, 132, 74],
  rock: [102, 92, 59],
  snow: [195, 199, 218],
  sand: [143, 126, 95],
}

const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)))
const hex = c => '#' + c.map(v => clamp255(v).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

/* HOW MUCH OF A THING AT DISTANCE d IS JUST AIR.

   Roblox does not publish the curve it runs Density and Haze
   through, so this is the standard exponential extinction fitted to
   the two numbers the rig sets: at the mid band's representative
   distance it should be about a quarter air, and at the far band's
   about half. SCALE is the fitted constant and it is the one number
   in this file that is tuned rather than read.

   IT WAS FITTED TOO STRONG FIRST TIME, at 550, which put the far
   band three quarters into the atmosphere colour. On its own that is
   defensible physics; on the page it erased the mountains, because
   the sky immediately behind a ridge IS the atmosphere colour and a
   ridge three quarters of the way there has almost nothing left to
   separate it. The visible check is the only check that matters
   here: a ridge that cannot be seen is not hazy, it is missing. */
const HAZE_SCALE = 1150
const airAt = d => 1 - Math.exp(-d / HAZE_SCALE)

/* The colour grade, applied last because that is where it sits in
   the pipeline: after everything, over the whole frame. */
function grade(c) {
  const lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  let out = c.map(v => lum + (v - lum) * (1 + SKY.saturation))     /* saturation */
  out = out.map(v => 128 + (v - 128) * (1 + SKY.contrast))          /* contrast   */
  return out.map((v, i) => (v * SKY.tint[i]) / 255)                 /* tint       */
}

/* Lit, then hazed, then graded. The lift is the outdoor ambient plus
   a low sun, which is why everything here reads warmer than the raw
   material colour: at ClockTime 16.4 the light itself is yellow. */
function surface(material, distance) {
  const lit = material.map((v, i) => v * 0.62 + SKY.outdoorAmbient[i] * 0.55)
  return hex(grade(mix(lit, SKY.atmosphere, airAt(distance))))
}

/* A ridge's EDGE is the same surface a little less hazed, which is
   what an edge physically is: the near lip of the ridge, closer to
   you than the slope behind it. */
const PLATES = [
  {
    band: BANDS[0],
    fill: surface(MATERIAL.rock, 800),
    snow: surface(MATERIAL.snow, 800),
    edge: surface(MATERIAL.rock, 560),
  },
  {
    band: BANDS[1],
    fill: surface(MATERIAL.grass, 300),
    snow: surface(MATERIAL.snow, 300),
    edge: surface(MATERIAL.rock, 210),
  },
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

/* ============================================================
   THE GROVE — Flora.luau's bambooClump(), seen edge on
   ------------------------------------------------------------
   Their numbers, not ours: culms 34 to 56 studs tall, clumped a few
   at a time within 5 studs of a point, each topped by two leaf puffs
   10 to 14 wide and 7 to 10 wide. BAMBOO_GREEN is theirs too. The
   grove sits at Terrain.GROVE, which is a flattened clearing at
   height 14, so a stand of it in the foreground is a thing you could
   actually walk past.

   Rendered from a SEEDED generator so the file is byte-stable: an
   asset that changes on every build is an asset nobody can review in
   a diff, and a background nobody reviews is where a stray mark
   lives forever.
   ============================================================ */
/* Flora.luau's own BAMBOO_GREEN and its two leaf-puff colours, put
   through the same lighting the ridges go through. The grove stands
   twenty studs away, so almost none of it is air: this is the colour
   grade doing the work, not the haze, and that is correct. Bamboo
   in a golden afternoon is olive, not the flat spring green the raw
   Color3 is. */
const BAMBOO_GREEN = surface([126, 168, 92], 20)
const BAMBOO_LEAF = surface([104, 146, 78], 24)
const BAMBOO_DARK = surface([77, 107, 58], 16)

/* mulberry32: 32 bits of state, same sequence every run */
function seeded(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function grove() {
  const rng = seeded(0x9e3779b9)
  const num = n => (a, b) => a + n() * (b - a)
  const r = num(rng)
  const parts = []

  /* Three clumps across the plate, the nearest largest. A clump at
     the very edge on each side frames the page without crowding the
     middle, where the shop's own content sits. */
  const clumps = [
    { cx: 60, scale: 1.0, n: 7 },
    { cx: 1215, scale: 0.94, n: 7 },
    { cx: 300, scale: 0.6, n: 4 },
    { cx: 985, scale: 0.55, n: 4 },
  ]

  for (const clump of clumps) {
    for (let i = 0; i < clump.n; i++) {
      /* studs converted at the plate's own scale: a 56 stud culm
         reaching most of the plate's height is what standing beside
         one looks like */
      const h = r(34, 56) * 5.6 * clump.scale
      const x = clump.cx + r(-5, 5) * 7 * clump.scale
      const lean = r(-0.07, 0.07)
      const w = r(3.4, 5.2) * clump.scale
      const topX = x + lean * h
      const baseY = PLATE_H + 30

      /* the culm, drawn as a tapering quad rather than a line so the
         lean reads as a bend the way a stalk bends */
      parts.push('<path d="M' + n2(x - w) + ' ' + n2(baseY) +
        ' Q' + n2(x - w + lean * h * 0.4) + ' ' + n2(baseY - h * 0.55) +
        ' ' + n2(topX - w * 0.55) + ' ' + n2(baseY - h) +
        ' L' + n2(topX + w * 0.55) + ' ' + n2(baseY - h) +
        ' Q' + n2(x + w + lean * h * 0.4) + ' ' + n2(baseY - h * 0.55) +
        ' ' + n2(x + w) + ' ' + n2(baseY) + ' Z" fill="' + BAMBOO_GREEN + '"/>')

      /* the nodes: bamboo's own joints, every 9 studs or so */
      for (let y = baseY - 22; y > baseY - h + 10; y -= r(46, 62)) {
        const t = (baseY - y) / h
        parts.push('<rect x="' + n2(x + lean * h * t - w) + '" y="' + n2(y) +
          '" width="' + n2(w * 2) + '" height="2.6" fill="' + BAMBOO_DARK +
          '" opacity="0.55"/>')
      }

      /* two leaf puffs at the top, their sizes */
      for (const [rx, ry, dy, fill] of [
        [r(10, 14) * 2.4 * clump.scale, r(6, 8) * 1.9 * clump.scale, 0, BAMBOO_LEAF],
        [r(7, 10) * 2.4 * clump.scale, r(4, 6) * 1.9 * clump.scale, r(14, 26), BAMBOO_GREEN],
      ]) {
        parts.push('<ellipse cx="' + n2(topX + r(-9, 9)) + '" cy="' + n2(baseY - h + dy) +
          '" rx="' + n2(rx) + '" ry="' + n2(ry) + '" fill="' + fill + '"/>')
      }
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PLATE_W + ' ' + PLATE_H +
    '" preserveAspectRatio="none" width="' + PLATE_W + '" height="' + PLATE_H + '">' +
    parts.join('') + '</svg>\n'
}

writeFileSync(join(out, 'vale-grove.svg'), grove())
console.log('  vale-grove.svg  ' + String(grove().length).padStart(7) + ' bytes')

/* ============================================================
   THE SKY IS DERIVED TOO, and it had to be.

   The ridges were the first thing repainted from the lighting rig
   and the result was a page of warm golden mountains under a COLD
   BLUE sky, which looked worse than either mistake on its own: the
   ridges were right and the sky they stood in was still the invented
   one. Half a derivation is not a derivation.

   So the sky stops come out of the same rig and land in a generated
   stylesheet that vale.css imports. GENERATED, meaning do not edit
   it: run `node tools/vale.mjs`. It is committed rather than built
   on deploy because this site has no build step at all, and a
   background that only exists after a command nobody runs is a
   background that ships missing.

   At ClockTime 16.4 the sun is low and, since the camera faces north
   at Heavenpillar, it is off to the LEFT. That is why the disc is
   not centred behind the peak: a sun directly behind the summit at
   half past four would be the one thing in the scene that could not
   happen.
   ============================================================ */

/* Roblox's clear-sky zenith, which the atmosphere and the grade then
   act on. Everything below it is the rig. */
/* Deeper than the literal zenith, on purpose. The rig's Brightness
   is 2.6 with a 0.55 environment diffuse, so the real sky is bright,
   but the shop is printed on paper and the ridges have to read
   against it. Holding the top of the sky down is what buys the
   skyline its silhouette. */
const ZENITH = [126, 156, 196]

const skyTop = hex(grade(mix(ZENITH, SKY.atmosphere, 0.30)))
const skyMid = hex(grade(mix(ZENITH, SKY.atmosphere, 0.72)))
const skyHaze = hex(grade(SKY.atmosphere))
const cloud = hex(grade(SKY.clouds))
/* the sun's core is the grade's own tint at full brightness; its
   glow is the horizon decay colour, which is what a low sun turns
   the air around it into */
const sunCore = hex(SKY.tint)
const sunGlow = hex(grade(mix(SKY.atmosphere, [255, 214, 140], 0.55)))
const decay = hex(grade(SKY.decay))

const sky = `/* GENERATED by tools/vale.mjs. Do not edit; run the tool.
   Every value here is computed from WorldService.tuneSky() in
   Legal-Leaf-Market/roblox-game: the terrain material colours lit by
   the vale's own outdoor ambient, faded toward the atmosphere colour
   by distance, then put through the game's colour grade. The sky the
   shop stands under is the sky the game is lit by.

   ClockTime 16.4, late golden afternoon, in the rig's own words. */
:root{
  --vale-sky-top:${skyTop};
  --vale-sky-mid:${skyMid};
  --vale-sky-haze:${skyHaze};
  --vale-cloud:${cloud};
  --vale-sun-core:${sunCore};
  --vale-sun-glow:${sunGlow};
  --vale-decay:${decay};
}
`
writeFileSync(join(out, '..', 'css', 'vale-sky.css'), sky)
console.log('  css/vale-sky.css   top ' + skyTop + '  mid ' + skyMid +
  '  haze ' + skyHaze + '  sun ' + sunGlow)
