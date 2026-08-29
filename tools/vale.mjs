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
   THE COLOURS ARE SAMPLED FROM THE GAME, NOT COMPUTED FROM IT
   ------------------------------------------------------------
   The previous version derived these from WorldService.tuneSky():
   terrain material defaults, lit by the rig's outdoor ambient,
   faded toward its atmosphere colour, graded by its ColorCorrection.
   The arithmetic was right and the answer was wrong. It produced a
   golden hazy afternoon, and then the owner sent 27 seconds of the
   game running and the vale is a COOL OLIVE-AND-SLATE VILLAGE UNDER
   A CYAN SKY. Not close.

   Why the derivation missed is worth writing down, because the same
   trap is one commit away at all times: tuneSky() is what the code
   ASKS for, and a render is what you GET. Between the two sit
   Roblox's own tone mapping, the sun angle at the moment of capture,
   whether the server had run Init yet, and every default the rig
   does not set. A frame of the running game has all of that baked
   in. It is the only artefact that does.

   So every colour below is a median of a patch of an actual frame
   at 1450x800, listed with where it was taken from. Numbers, not
   impressions: eyeballing a screenshot is how you end up back at
   invented colours with extra steps.

   TO RESAMPLE: pull frames with ffmpeg, take a median over a small
   patch rather than a single pixel (JPEG ringing will lie to you on
   one pixel), and update here. Do not re-derive from the rig; that
   experiment has been run.
   ============================================================ */
const GAME = {
  /* sky, sampled up a clear column on the right of the frame */
  skyHigh: [108, 185, 212],    /* y=60,  cyan                      */
  skyMid: [132, 197, 211],     /* y=100                            */
  skyHaze: [205, 195, 189],    /* y=260, the warm pale horizon     */
  cloud: [239, 226, 217],      /* the bright cloud shoulder        */

  /* ground and rock */
  grassNear: [76, 86, 51],
  grassMid: [84, 94, 57],
  grassFar: [91, 99, 62],
  cliff: [74, 80, 80],
  cliffFar: [51, 61, 60],

  /* the village */
  wall: [229, 232, 205],       /* cream plaster                    */
  timber: [195, 199, 177],     /* the frame between the panels     */
  roof: [41, 54, 62],          /* dark slate, the strongest note   */
  lantern: [156, 52, 48],

  /* what grows there */
  pine: [24, 42, 30],
  trunk: [62, 49, 40],
  /* CHERRY, and these are not the sampled village pinks any more.
     Those came off a distant hazed tree in the footage and were
     mud. The owner sent a sheet of six cherry designs the game is
     moving to, and they are SATURATED: a deep rose in the shadow of
     the canopy, a mid pink for the mass, a near white on the lit
     upper edge. Three tones is the minimum that reads as a canopy
     rather than as a blob, because what makes a tree look round is
     the shadow underneath it. */
  blossomDeep: [184, 104, 143],
  blossom: [221, 145, 180],
  blossomPale: [240, 193, 214],
  bark: [58, 43, 36],
}

const clamp255 = v => Math.max(0, Math.min(255, Math.round(v)))
const hex = c => '#' + c.map(v => clamp255(v).toString(16).padStart(2, '0')).join('')
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t)

/* HOW MUCH OF A THING AT DISTANCE d IS JUST AIR.

   The one piece of the old derivation worth keeping. Distance in
   this vale is carried almost entirely by haze: the far rim in the
   footage is barely darker than the sky behind it while the near
   grass is nearly black-green, and that spread is the whole depth
   cue. SCALE is fitted so the far band lands about half air and the
   mid band about a quarter.

   IT WAS FITTED AT 550 FIRST AND ERASED THE MOUNTAINS. The sky
   immediately behind a ridge IS the haze colour, so a ridge three
   quarters of the way into it has nothing left to separate. A ridge
   that cannot be seen is not hazy, it is missing. */
const HAZE_SCALE = 1150
const airAt = d => 1 - Math.exp(-d / HAZE_SCALE)

/* A surface at distance: the sampled colour, walked toward the
   sampled horizon haze. No lighting model, because the sample was
   taken through the lighting already. */
const at = (colour, distance) => hex(mix(colour, GAME.skyHaze, airAt(distance)))

const PLATES = [
  {
    band: BANDS[0],
    fill: at(GAME.cliffFar, 800),
    snow: at([232, 236, 240], 800),
    edge: at(GAME.cliffFar, 620),
  },
  {
    band: BANDS[1],
    fill: at(GAME.cliff, 300),
    snow: at([232, 236, 240], 300),
    edge: at(GAME.cliff, 190),
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
const BAMBOO_GREEN = at(GAME.grassNear, 20)
const BAMBOO_LEAF = at(GAME.pine, 24)
const BAMBOO_DARK = at(GAME.trunk, 16)

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


/* ============================================================
   THE VILLAGE
   ------------------------------------------------------------
   The single thing that makes the background read as THIS game
   rather than as generic mountains. The footage is not a landscape,
   it is a place: cream plaster walls in dark timber frames, deep
   slate roofs with the eaves kicked up, red lanterns burning in the
   daytime, cherry blossom over pine.

   Terrain.VILLAGE is a flattened plateau 120 studs across at height
   11, so the houses sit on a shelf rather than on a slope, which is
   why they line up along one baseline here instead of stepping.

   The roof is the whole silhouette. Get the eave curve wrong and it
   is a shed; the upturn is doing all the work, so it is drawn as two
   quadratics meeting at a ridgepole rather than as a triangle.
   Seeded, like the grove, so the file is byte-stable and a diff
   means somebody changed the drawing.

   HAZED AT SEVENTY STUDS, NOT AT TWO HUNDRED AND FIFTY. The first
   pass put the village at the mid ridge's distance and it came out
   as pale pink ghosts, which is what half-air does to a cream wall.
   The village is on the plateau you are STANDING on. Terrain's own
   VILLAGE marker is 170 studs from the world origin and the camera
   is pitched to look past it, so the near edge of it is close, and
   close things keep their colour. If the roofs ever go grey again,
   this is the number.
   ============================================================ */
function village() {
  const rng = seeded(0x5bf03635)
  const r = (a, b) => a + rng() * (b - a)
  const parts = []
  const GROUND = PLATE_H - 96

  /* Houses across the plate, larger toward the middle where the
     village centre sits, thinning at both edges into the trees. */
  const houses = [
    { x: 150, s: 0.72 }, { x: 300, s: 0.9 }, { x: 430, s: 1.05 },
    { x: 600, s: 1.15 }, { x: 780, s: 1.1 }, { x: 930, s: 0.95 },
    { x: 1075, s: 0.8 }, { x: 1195, s: 0.66 },
  ]

  for (const h of houses) {
    const w = r(96, 128) * h.s
    const bodyH = r(40, 54) * h.s
    const x = h.x - w / 2
    const y = GROUND - bodyH
    const eave = w * r(0.16, 0.22)
    const roofH = r(26, 34) * h.s

    /* walls */
    parts.push('<path d="M' + n2(x) + ' ' + n2(GROUND) +
      ' L' + n2(x) + ' ' + n2(y) + ' L' + n2(x + w) + ' ' + n2(y) +
      ' L' + n2(x + w) + ' ' + n2(GROUND) + ' Z" fill="' + at(GAME.wall, 70) + '"/>')

    /* timber posts, the dark uprights that break the plaster up */
    const posts = Math.max(2, Math.round(w / (26 * h.s)))
    for (let i = 1; i < posts; i++) {
      parts.push('<rect x="' + n2(x + (w * i) / posts - 1.6 * h.s) + '" y="' + n2(y) +
        '" width="' + n2(3.2 * h.s) + '" height="' + n2(bodyH) +
        '" fill="' + at(GAME.timber, 70) + '"/>')
    }
    /* the sill line, which is what stops a wall reading as a slab */
    parts.push('<rect x="' + n2(x) + '" y="' + n2(y + bodyH * 0.52) +
      '" width="' + n2(w) + '" height="' + n2(2.6 * h.s) +
      '" fill="' + at(GAME.timber, 70) + '"/>')

    /* THE ROOF, and the kicked eaves are the point */
    parts.push('<path d="M' + n2(x - eave) + ' ' + n2(y + 3) +
      ' Q' + n2(x - eave * 0.35) + ' ' + n2(y - 2) +
      ' ' + n2(x + w * 0.5) + ' ' + n2(y - roofH) +
      ' Q' + n2(x + w + eave * 0.35) + ' ' + n2(y - 2) +
      ' ' + n2(x + w + eave) + ' ' + n2(y + 3) +
      ' Q' + n2(x + w * 0.5) + ' ' + n2(y - roofH * 0.28) +
      ' ' + n2(x - eave) + ' ' + n2(y + 3) +
      ' Z" fill="' + at(GAME.roof, 70) + '"/>')

    /* a lantern under the eave on about half the houses */
    if (rng() < 0.55) {
      const lx = x + w * r(0.2, 0.8)
      parts.push('<ellipse cx="' + n2(lx) + '" cy="' + n2(y + 9) +
        '" rx="' + n2(4 * h.s) + '" ry="' + n2(5.4 * h.s) +
        '" fill="' + at(GAME.lantern, 60) + '"/>')
    }
  }

  /* ---------------------------------------------------------
     CHERRY TREES

     The first version drew a stick with six ellipses scattered
     round the top and it read as pink smoke, not as a tree. What
     was missing is structure: a real cherry is a THICK FORKED
     TRUNK carrying ONE BROAD MASS that is wider than it is tall,
     and the mass only looks round because it is darker underneath.

     So each tree here is built in that order. Trunk that widens at
     the base and forks into three or four limbs, drawn as tapering
     quads so the fork has weight. Then the canopy in three passes,
     back to front: deep rose across the whole underside, mid pink
     over most of it, pale pink on the upper left only, where the
     light is. The passes overlap heavily on purpose; the gaps
     between blobs are what made the old ones read as smoke.
     --------------------------------------------------------- */
  /* ---------------------------------------------------------
     A CHERRY TREE IS NOT A PINK CLOUD

     Two versions of this were wrong in the same direction. The first
     scattered six ellipses round a stick and read as smoke. The
     second used forty overlapping ellipses with a soft halo and read
     as candyfloss, which is worse, because it was confidently wrong:
     a smooth mass with a fading edge is a CLOUD, and no amount of
     tuning the pink was going to turn it into a tree.

     What actually makes foliage read as foliage is the opposite of
     smooth. It is thousands of small marks with visible gaps between
     them, clumped rather than evenly spread, with dark branch
     structure showing THROUGH the gaps. The gaps are the whole
     thing. A canopy you cannot see sky through is a balloon.

     So this draws:

       BRANCHES first, a forked trunk into limbs into twigs, and the
       twigs run out INTO the canopy rather than stopping at its
       edge, because that is what the eye follows.

       CLUSTERS second. Blossom does not distribute evenly, it
       bunches on the twigs, so mark positions are sampled around
       about two dozen cluster centres rather than across the whole
       disc. Even distribution is noise; clumping is foliage.

       MARKS last, and they are individual: a five-lobed blossom
       rosette and a pointed leaf, each defined ONCE in <defs> and
       placed with <use> at a random rotation and scale. That is what
       makes the count affordable. Drawn as full paths this file
       would be a third of a megabyte; as <use> with the fills
       grouped it is a fraction of that, for about four hundred marks
       a tree.

     Tone runs with height, not at random: deep rose in the underside
     where the canopy shades itself, mid pink through the body, near
     white only on the top left where the light is.
     --------------------------------------------------------- */
  function cherry(x, groundY, scale) {
    const trunkH = 88 * scale
    const top = groundY - trunkH
    const bw = 9.5 * scale
    const bark = at(GAME.bark, 80)
    const barkLit = at([88, 68, 58], 80)

    /* trunk, flaring at the foot */
    parts.push('<path d="M' + n2(x - bw * 1.6) + ' ' + n2(groundY) +
      ' Q' + n2(x - bw * 0.85) + ' ' + n2(groundY - trunkH * 0.5) +
      ' ' + n2(x - bw * 0.42) + ' ' + n2(top) +
      ' L' + n2(x + bw * 0.42) + ' ' + n2(top) +
      ' Q' + n2(x + bw * 0.85) + ' ' + n2(groundY - trunkH * 0.5) +
      ' ' + n2(x + bw * 1.6) + ' ' + n2(groundY) +
      ' Z" fill="' + bark + '"/>')

    /* THE ARMATURE. Limbs from the fork, twigs from the limbs, and
       the twigs reach past where the blossom will sit so the canopy
       has something to hang on. */
    const twigTips = []
    const limbs = 4 + Math.floor(rng() * 2)
    for (let i = 0; i < limbs; i++) {
      const spread = (i / (limbs - 1) - 0.5) * 2
      const lx = x + spread * 62 * scale + r(-8, 8) * scale
      const ly = top - r(30, 52) * scale + Math.abs(spread) * 10 * scale
      const t = 4.2 * scale
      parts.push('<path d="M' + n2(x - t) + ' ' + n2(top + 5) +
        ' Q' + n2(x + spread * 22 * scale) + ' ' + n2(top - 20 * scale) +
        ' ' + n2(lx) + ' ' + n2(ly) +
        ' L' + n2(lx + t * 1.2) + ' ' + n2(ly + t * 0.9) +
        ' Q' + n2(x + spread * 22 * scale + t) + ' ' + n2(top - 18 * scale) +
        ' ' + n2(x + t) + ' ' + n2(top + 5) +
        ' Z" fill="' + bark + '"/>')

      const twigs = 2 + Math.floor(rng() * 3)
      for (let k = 0; k < twigs; k++) {
        const tx = lx + r(-46, 46) * scale
        const ty = ly - r(6, 44) * scale
        parts.push('<path d="M' + n2(lx) + ' ' + n2(ly) +
          ' Q' + n2((lx + tx) / 2 + r(-10, 10) * scale) + ' ' + n2((ly + ty) / 2) +
          ' ' + n2(tx) + ' ' + n2(ty) + '" fill="none" stroke="' + barkLit +
          '" stroke-width="' + n2(1.9 * scale) + '" stroke-linecap="round"/>')
        twigTips.push([tx, ty])
      }
    }

    /* CLUSTER CENTRES, biased onto the twig tips so the blossom
       grows where the wood is. */
    const cw = 118 * scale, ch = 58 * scale
    const cy = top - 48 * scale
    const centres = []
    for (let i = 0; i < 26; i++) {
      if (twigTips.length && rng() < 0.6) {
        const tip = twigTips[Math.floor(rng() * twigTips.length)]
        centres.push([tip[0] + r(-18, 18) * scale, tip[1] + r(-14, 14) * scale])
      } else {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng())
        centres.push([x + Math.cos(a) * rad * cw, cy + Math.sin(a) * rad * ch])
      }
    }

    /* THE MARKS.

       FOUR HUNDRED <use> ELEMENTS A TREE IS AFFORDABLE ONLY IF EACH
       ONE IS SHORT. The first working version wrote a full transform
       on every mark, `translate(123.4 456.7) rotate(215) scale(0.62)`,
       and the file came out at 369KB, which is not a background, it
       is a download. Three changes got it to a fifth of that with
       the same number of marks on screen:

         The whole mark layer sits in ONE group carrying the tree's
         position and scale, so marks are written in local
         coordinates and integers, and per-mark scale disappears.

         Blossom uses <use x= y=> with no transform at all. A
         five-lobed rosette is near enough rotationally symmetric
         that rotating it buys nothing, and three pre-sized rosettes
         in <defs> cover the size variation that rotation was
         standing in for.

         Opacity is quantised to two values, so there are a handful
         of fill groups rather than one per mark.

       Leaves keep a rotation, because a leaf is a pointed thing and
       a field of them all lying the same way is instantly wrong.
       They are one mark in six, so the cost is small. */
    const buckets = new Map()
    const put = (colour, mark, mx, my, rot, op) => {
      const key = colour + '|' + op
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key).push(rot === null
        ? '<use href="#' + mark + '" x="' + Math.round(mx) + '" y="' + Math.round(my) + '"/>'
        : '<use href="#' + mark + '" transform="translate(' + Math.round(mx) + ' ' +
          Math.round(my) + ') rotate(' + Math.round(rot) + ')"/>')
    }

    const deep = at(GAME.blossomDeep, 80)
    const mid = at(GAME.blossom, 80)
    const lit = at(GAME.blossomPale, 78)
    const leafGreen = at([96, 128, 74], 80)
    const SIZES = ['b1', 'b2', 'b3']

    for (const [ccx, ccy] of centres) {
      const n = 12 + Math.floor(rng() * 8)
      for (let i = 0; i < n; i++) {
        const a = rng() * Math.PI * 2
        const rad = Math.sqrt(rng()) * (17 + rng() * 13) * scale
        /* local coordinates: the group below carries x and scale */
        const mx = (ccx + Math.cos(a) * rad - x) / scale
        const my = (ccy + Math.sin(a) * rad * 0.82 - groundY) / scale
        /* tone by height in the canopy, with noise so the boundary
           between tones is not a horizon line */
        const h = ((ccy + Math.sin(a) * rad * 0.82) - (cy - ch)) / (ch * 2) + r(-0.16, 0.16)
        if (rng() < 0.16) {
          put(leafGreen, 'lf', mx, my, rng() * 360, rng() < 0.5 ? '.9' : '1')
        } else {
          const colour = h > 0.66 ? deep : h < 0.3 ? lit : mid
          put(colour, SIZES[Math.floor(rng() * 3)], mx, my, null, rng() < 0.5 ? '.85' : '1')
        }
      }
    }

    const groups = []
    for (const [key, uses] of buckets) {
      const [colour, op] = key.split('|')
      groups.push('<g fill="' + colour + '" opacity="' + op + '">' + uses.join('') + '</g>')
    }
    parts.push('<g transform="translate(' + n2(x) + ' ' + n2(groundY) + ') scale(' +
      (Math.round(scale * 100) / 100) + ')">' + groups.join('') + '</g>')
  }

  function pine(x, groundY, scale) {
    parts.push('<rect x="' + n2(x - 3.4 * scale) + '" y="' + n2(groundY - 62 * scale) +
      '" width="' + n2(6.8 * scale) + '" height="' + n2(62 * scale) +
      '" fill="' + at(GAME.trunk, 80) + '"/>')
    for (let k = 0; k < 3; k++) {
      const cyy = groundY - (150 - k * 30) * scale
      const cw = (20 + k * 12) * scale
      parts.push('<path d="M' + n2(x) + ' ' + n2(cyy) +
        ' L' + n2(x + cw) + ' ' + n2(cyy + 44 * scale) +
        ' L' + n2(x - cw) + ' ' + n2(cyy + 44 * scale) +
        ' Z" fill="' + at(GAME.pine, 80) + '"/>')
    }
  }

  /* CHERRY OUTNUMBERS PINE THREE TO ONE. The owner is moving the
     game to cherry and the trees are the loudest thing in the
     frame, so the ratio is the design decision, not a detail. Pines
     stay as the dark note that keeps a wall of pink from turning
     into candyfloss. */
  /* A BACK LINE FIRST, hazed hard and drawn small, running behind
     the houses. Depth in a flat drawing is almost entirely this:
     something the same shape, paler and smaller, behind. Without it
     the village sits on the grass like a sticker. */
  for (let i = 0; i < 22; i++) {
    const bx = r(-20, PLATE_W + 20)
    const by = GROUND - r(30, 58)
    const bs = r(0.3, 0.48)
    const pale = at(rng() < 0.55 ? GAME.blossom : GAME.pine, 620)
    for (let k = 0; k < 9; k++) {
      const a = rng() * Math.PI * 2, rad = Math.sqrt(rng())
      parts.push('<ellipse cx="' + n2(bx + Math.cos(a) * rad * 78 * bs) +
        '" cy="' + n2(by + Math.sin(a) * rad * 34 * bs) +
        '" rx="' + n2(r(16, 27) * bs) + '" ry="' + n2(r(11, 19) * bs) +
        '" fill="' + pale + '" opacity="0.8"/>')
    }
  }

  const stands = []
  for (let i = 0; i < 13; i++) stands.push({ x: r(30, PLATE_W - 30), cherry: rng() < 0.75 })
  /* far to near, so a nearer tree overlaps a further one */
  stands.sort((a, b) => a.x - b.x)
  for (const t of stands) {
    const scale = r(0.62, 1.15)
    if (t.cherry) cherry(t.x, GROUND + r(2, 16), scale)
    else pine(t.x, GROUND + r(2, 14), scale)
  }

  /* Defined once, placed hundreds of times. `bl` is a five-lobed
     blossom rosette with a gap at its centre; `lf` is a pointed
     leaf. Both are drawn around the origin so <use>'s rotate() spins
     them about their own middle rather than about the corner. */
  const DEFS = '<defs>' +
    /* Three sizes of rosette, pre-scaled, so a <use> needs only x
       and y. The centre gap is deliberate: a solid disc reads as a
       dot and five lobes around a hole read as a flower even at
       four pixels. */
    '<path id="b1" d="M0 -3.4 Q2.2 -3.2 2.7 -1 Q4.5 .2 3.3 2.1 Q2.2 4 0 3.4' +
    ' Q-2.2 4 -3.3 2.1 Q-4.5 .2 -2.7 -1 Q-2.2 -3.2 0 -3.4 Z"/>' +
    '<path id="b2" d="M0 -4.8 Q3 -4.5 3.8 -1.5 Q6.4 .3 4.6 3 Q3.1 5.6 0 4.8' +
    ' Q-3.1 5.6 -4.6 3 Q-6.4 .3 -3.8 -1.5 Q-3 -4.5 0 -4.8 Z"/>' +
    '<path id="b3" d="M0 -6.4 Q4 -6 5.1 -2 Q8.5 .4 6.1 4 Q4.1 7.5 0 6.4' +
    ' Q-4.1 7.5 -6.1 4 Q-8.5 .4 -5.1 -2 Q-4 -6 0 -6.4 Z"/>' +
    '<path id="lf" d="M-7 0 Q0 -3.6 7 0 Q0 3.6 -7 0 Z"/>' +
    '</defs>'

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + PLATE_W + ' ' + PLATE_H +
    '" preserveAspectRatio="none" width="' + PLATE_W + '" height="' + PLATE_H + '">' +
    DEFS + parts.join('') + '</svg>\n'
}

writeFileSync(join(out, 'vale-village.svg'), village())
console.log('  vale-village.svg' + String(village().length).padStart(8) + ' bytes')

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

/* Straight from the frame. The generated stylesheet exists so that
   vale.css and the plates can never disagree about what colour the
   sky is: they read the same six values, written once, here. */
const skyTop = hex(GAME.skyHigh)
const skyMid = hex(GAME.skyMid)
const skyHaze = hex(GAME.skyHaze)
const cloud = hex(GAME.cloud)
const sunCore = '#fffdf6'
const sunGlow = hex(mix(GAME.cloud, [255, 236, 190], 0.5))
const decay = hex(GAME.roof)

const sky = `/* GENERATED by tools/vale.mjs. Do not edit; run the tool.

   Sampled, not derived. Every value is a median over a patch of a
   frame of the running game, which is the only artefact that has
   Roblox's tone mapping and the real sun angle baked into it. An
   earlier version computed these from WorldService.tuneSky() and
   produced a golden afternoon for a game that is a cool olive
   village under a cyan sky. The rig is what the code asks for; a
   frame is what you get. */
:root{
  --vale-sky-top:${skyTop};
  --vale-sky-mid:${skyMid};
  --vale-sky-haze:${skyHaze};
  --vale-cloud:${cloud};
  --vale-sun-core:${sunCore};
  --vale-sun-glow:${sunGlow};
  --vale-decay:${decay};
  --vale-roof:${hex(GAME.roof)};
  --vale-wall:${hex(GAME.wall)};
  --vale-timber:${hex(GAME.timber)};
  --vale-lantern:${hex(GAME.lantern)};
  --vale-grass:${hex(GAME.grassNear)};
  --vale-blossom:${hex(GAME.blossom)};
}
`
writeFileSync(join(out, '..', 'css', 'vale-sky.css'), sky)
console.log('  css/vale-sky.css   top ' + skyTop + '  mid ' + skyMid +
  '  haze ' + skyHaze + '  sun ' + sunGlow)
