/* Generate every raster brand asset from public/assets/mark.svg.
   ------------------------------------------------------------
     npm run branding

   THE RULE THIS FILE EXISTS TO ENFORCE, inherited from Herbal-Leaf's
   scripts/branding.py and stated in its guide as a hard "do not":
   every raster brand asset is GENERATED. Edit the SVG, run this,
   commit what changed. Never hand-edit a PNG.

   The reason is not tidiness. A hand-made favicon is a fork of the
   logo that nobody can see is a fork: the mark changes, the SVG in
   the <link> updates, and the .ico in the tab goes on showing last
   year's artwork for as long as anybody's browser has it cached. The
   sister sites all learned this the same way.

   WHY IT DRAWS THE MARK ITSELF RATHER THAN CALLING A RASTERISER.
   There is no cairosvg, no rsvg-convert, no ImageMagick and no
   headless browser on the machines this repo is worked on, and this
   project's whole dependency list is one Postgres driver. Adding a
   rendering stack to produce eight small squares would be the
   heaviest thing in the repo by an order of magnitude.

   It gets away with that because of how the mark is drawn: mark.svg
   is nothing but axis-aligned <rect>s on a 32px grid, with integer
   coordinates and no curves, no gradients, no text and no paths. So
   this reads the rects OUT OF THE SVG and fills them. It is not an
   SVG renderer and must not be mistaken for one -- it is a renderer
   for exactly the vocabulary the mark uses, and `parseMark` THROWS on
   anything else rather than silently dropping it. If somebody adds a
   <path> to the mark, the build fails loudly and this file needs
   extending; it will never quietly ship an icon missing a shape.

   The single source of truth stays the SVG. Nothing about the artwork
   is restated below.
*/
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync } from 'node:zlib'

/* ============================================================
   1. READ THE MARK
   ============================================================ */

function attrs(tag) {
  const out = {}
  for (const m of tag.matchAll(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

function colour(v) {
  const m = /^#([0-9a-f]{6})$/i.exec(String(v || '').trim())
  if (!m) throw new Error('branding: only #rrggbb fills are supported, got "' + v + '"')
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/* Returns { w, h, shapes } in the SVG's own user units. A shape is
   either a filled rounded rect or a stroked one, which is drawn as
   "inside the outer rect and outside the inner one" -- an SVG stroke
   straddles the path, so it grows the box by half the stroke width on
   each side and shrinks the corner radius by the same. */
export function parseMark(svg) {
  const vb = /viewBox\s*=\s*"([^"]+)"/.exec(svg)
  if (!vb) throw new Error('branding: mark.svg has no viewBox')
  const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number)

  /* Anything that draws and is not a <rect> is a shape this renderer
     cannot see. Refuse rather than skip. */
  for (const el of ['path', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'image', 'use']) {
    if (new RegExp('<' + el + '[\\s>]').test(svg)) {
      throw new Error('branding: mark.svg contains <' + el + '>, which this renderer does not draw. ' +
        'Either keep the mark to <rect>s or teach tools/branding.mjs the new element.')
    }
  }

  const shapes = []
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const a = attrs(m[0])
    const x = Number(a.x || 0), y = Number(a.y || 0)
    const rw = Number(a.width), rh = Number(a.height)
    const r = Number(a.rx || a.ry || 0)
    const alpha = a.opacity === undefined ? 1 : Number(a.opacity)
    const fill = a.fill === undefined ? '#000000' : a.fill

    if (fill && fill !== 'none') {
      shapes.push({ kind: 'fill', x, y, w: rw, h: rh, r, rgb: colour(fill), alpha })
    }
    if (a.stroke && a.stroke !== 'none') {
      const sw = Number(a['stroke-width'] || 1)
      shapes.push({
        kind: 'ring', rgb: colour(a.stroke), alpha,
        outer: { x: x - sw / 2, y: y - sw / 2, w: rw + sw, h: rh + sw, r: Math.max(0, r + sw / 2) },
        inner: { x: x + sw / 2, y: y + sw / 2, w: rw - sw, h: rh - sw, r: Math.max(0, r - sw / 2) },
      })
    }
  }
  if (!shapes.length) throw new Error('branding: no drawable rects found in mark.svg')
  return { w, h, shapes }
}

/* ============================================================
   2. DRAW IT
   ============================================================ */

function insideRR(px, py, b) {
  if (b.w <= 0 || b.h <= 0) return false
  const r = Math.max(0, Math.min(b.r, Math.min(b.w, b.h) / 2))
  if (px < b.x || py < b.y || px > b.x + b.w || py > b.y + b.h) return false
  const cx = px < b.x + r ? b.x + r : (px > b.x + b.w - r ? b.x + b.w - r : px)
  const cy = py < b.y + r ? b.y + r : (py > b.y + b.h - r ? b.y + b.h - r : py)
  const dx = px - cx, dy = py - cy
  return dx * dx + dy * dy <= r * r
}

/* Supersample, then average in PREMULTIPLIED space. Averaging straight
   RGBA instead is the classic dark-halo bug: a transparent sample
   carries r=g=b=0, and mixing that black into an edge pixel's colour
   is why hand-rolled rasterisers produce icons with grubby outlines. */
export function rasterize(mark, size, opts = {}) {
  const inset = opts.inset || 0          /* fraction of the canvas kept clear on each side */
  const bg = opts.background ? colour(opts.background) : null
  const SS = size <= 64 ? 8 : 4
  const px = new Uint8ClampedArray(size * size * 4)

  const scale = (size * (1 - 2 * inset)) / mark.w
  const off = size * inset

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let ar = 0, ag = 0, ab = 0, aa = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          /* Sample point, converted back into the SVG's user units. */
          const ux = ((x + (sx + 0.5) / SS) - off) / scale
          const uy = ((y + (sy + 0.5) / SS) - off) / scale

          let r = 0, g = 0, b = 0, a = 0
          if (bg) { r = bg[0]; g = bg[1]; b = bg[2]; a = 1 }

          for (const s of mark.shapes) {
            const hit = s.kind === 'fill'
              ? insideRR(ux, uy, s)
              : (insideRR(ux, uy, s.outer) && !insideRR(ux, uy, s.inner))
            if (!hit) continue
            const sa = s.alpha
            /* source-over */
            r = s.rgb[0] * sa + r * a * (1 - sa)
            g = s.rgb[1] * sa + g * a * (1 - sa)
            b = s.rgb[2] * sa + b * a * (1 - sa)
            a = sa + a * (1 - sa)
            if (a > 0) { r /= a; g /= a; b /= a }
          }
          ar += r * a; ag += g * a; ab += b * a; aa += a
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      const alpha = aa / n
      px[o + 3] = Math.round(alpha * 255)
      if (aa > 0) {
        px[o] = Math.round(ar / aa)
        px[o + 1] = Math.round(ag / aa)
        px[o + 2] = Math.round(ab / aa)
      }
    }
  }
  return px
}

/* ============================================================
   3. PNG
   ============================================================ */

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

export function encodePNG(rgba, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0 /* filter: none. These are flat-colour
                                icons; the fancy filters buy bytes we
                                do not need and cost a reader. */
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4)
      .copy(raw, y * (w * 4 + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/* ============================================================
   4. ICO
   ------------------------------------------------------------
   BMP payloads, not PNG ones. An ICO may legally hold either, and
   PNG-in-ICO is both smaller and simpler to write -- but the only
   reason to ship favicon.ico at all in 2026 is the clients that do
   not read <link rel="icon"> and its SVG, and those are exactly the
   old clients that predate PNG-in-ICO. An .ico full of PNGs is a
   compatibility shim that is not compatible with anything the SVG
   was not already serving.
   ============================================================ */

export function encodeICO(images) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(images.length, 4)

  const entries = [], blobs = []
  let offset = 6 + images.length * 16

  for (const im of images) {
    const { size, rgba } = im
    const maskStride = Math.ceil(size / 32) * 4      /* 1bpp rows, padded to 4 bytes */
    const xor = Buffer.alloc(size * size * 4)
    const and = Buffer.alloc(maskStride * size)

    /* BMP rows run BOTTOM-UP and the channels are BGRA. */
    for (let y = 0; y < size; y++) {
      const src = (size - 1 - y) * size * 4
      for (let x = 0; x < size; x++) {
        const s = src + x * 4, d = (y * size + x) * 4
        xor[d] = rgba[s + 2]; xor[d + 1] = rgba[s + 1]; xor[d + 2] = rgba[s]; xor[d + 3] = rgba[s + 3]
        /* The AND mask is ignored by anything reading the alpha
           channel, and is the ONLY transparency for anything that is
           not. Filling it costs nothing and is the whole point of
           choosing BMP here. */
        if (rgba[s + 3] < 128) and[y * maskStride + (x >> 3)] |= 0x80 >> (x & 7)
      }
    }

    const hdr = Buffer.alloc(40)
    hdr.writeUInt32LE(40, 0)
    hdr.writeInt32LE(size, 4)
    hdr.writeInt32LE(size * 2, 8)   /* doubled: XOR image plus AND mask */
    hdr.writeUInt16LE(1, 12)
    hdr.writeUInt16LE(32, 14)
    hdr.writeUInt32LE(0, 16)
    hdr.writeUInt32LE(xor.length + and.length, 20)

    const blob = Buffer.concat([hdr, xor, and])
    const e = Buffer.alloc(16)
    e[0] = size === 256 ? 0 : size   /* 256 is written as 0 */
    e[1] = size === 256 ? 0 : size
    e[2] = 0; e[3] = 0
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6)
    e.writeUInt32LE(blob.length, 8)
    e.writeUInt32LE(offset, 12)
    offset += blob.length

    entries.push(e); blobs.push(blob)
  }
  return Buffer.concat([dir, ...entries, ...blobs])
}

/* ============================================================
   5. WHAT GETS BUILT
   ------------------------------------------------------------
   THE MANIFEST READS THIS LIST; the list does not read the manifest.
   Sizes named in one place, so a manifest naming an icon that no
   longer builds is a test failure rather than a broken install
   prompt on somebody's phone.
   ============================================================ */

/* An `inset` of .19 is not decoration. A maskable icon is cropped by
   the platform to whatever shape that platform likes, and only the
   centre circle of 80% diameter is guaranteed to survive. The mark's
   own corners sit at 46% of the canvas from the centre, outside that
   circle, so the full-bleed version WOULD have its coin door clipped
   on Android. The inset shrinks the artwork inside the safe zone and
   the background fills the rest. This is why there are two families
   of icon rather than one reused twice.

   The backgrounds are not written down here. `plate()` reads the
   mark's own backing rect, so an inset icon and a full-bleed one
   cannot disagree about the colour behind the coin door however the
   artwork is recoloured later. */
export const ASSETS = [
  /* AT THE ROOT, not in assets/. The <link> below settles it for
     every browser, but /favicon.ico is still requested blind by
     crawlers, feed readers, link unfurlers and anything that never
     parses the head, and a 404 there is the one icon failure nobody
     ever sees in their own browser. */
  { file: 'favicon.ico', root: true, ico: [16, 32, 48] },
  { file: 'icon-192.png', size: 192, purpose: 'any' },
  { file: 'icon-512.png', size: 512, purpose: 'any' },
  { file: 'icon-maskable-192.png', size: 192, purpose: 'maskable', inset: 0.19, plate: true },
  { file: 'icon-maskable-512.png', size: 512, purpose: 'maskable', inset: 0.19, plate: true },
  /* iOS ignores the manifest's icons AND ignores transparency, so the
     apple-touch icon is drawn opaque and full-bleed. Left transparent
     it gets composited onto black by the home screen, which is nearly
     but not quite our background -- the "nearly" is what makes that
     bug survive review. */
  { file: 'apple-touch-icon.png', size: 180, plate: true },
  /* The share card. Not an icon: it is the only asset with type on
     it, and the only one sized by what Discord and the timeline crop
     to rather than by what a home screen wants. */
  { file: 'og.png', card: true },
]

/* The mark's backing rect: the first filled shape, which on a 32px
   grid is the full-bleed plate every other shape sits on. */
export function plate(mark) {
  const p = mark.shapes.find(s => s.kind === 'fill')
  return '#' + p.rgb.map(c => c.toString(16).padStart(2, '0')).join('')
}

export function manifestIcons() {
  return ASSETS.filter(a => a.purpose).map(a => ({
    src: '/assets/' + a.file,
    sizes: a.size + 'x' + a.size,
    type: 'image/png',
    purpose: a.purpose,
  }))
}

/* ============================================================
   6. THE MANIFEST
   ------------------------------------------------------------
   GENERATED, for the same reason the sitemap is: it is a third list
   of things that exist, and this repo has been bitten by that shape
   of drift twice already (server.mjs's API map, /api/capture's usage
   block). The failure mode here is quiet in the way that matters --
   a manifest naming an icon that no longer builds does not error, it
   just produces a blank square on somebody's home screen, on a
   device nobody on the team owns.

   `--bg` is read from tokens.css rather than restated, because
   background_color is what paints the splash screen while the app
   boots and theme_color is what paints the phone's status bar. Both
   are the site's ground colour by definition, and a hardcoded copy
   of it here would go stale the next time the palette moves --
   silently, and only on installed devices.
   ============================================================ */
export function tokenBg(root = process.cwd()) {
  const css = readFileSync(join(root, 'public', 'css', 'tokens.css'), 'utf8')
  /* THE GROUND TOKEN, IN ORDER OF TRUTH. This read `--bg` and only
     `--bg`, and threw the day the palette moved to ink-and-paper and
     `--bg` became an alias (`--bg:var(--paper)`) rather than a hex.
     Throwing was correct -- a manifest that silently kept painting
     the old splash colour is the failure this function exists to
     prevent -- but the fix is to ask for the real ground first.
     `--paper` is what the interface is actually drawn on; `--bg` stays
     as a fallback for the sister sites' shape. */
  for (const name of ['--paper', '--bg']) {
    const m = new RegExp(name + '\\s*:\\s*(#[0-9a-f]{6})', 'i').exec(css)
    if (m) return m[1]
  }
  throw new Error('branding: tokens.css has no --paper or --bg hex; the manifest needs a real ground colour')
}

export function manifest(root = process.cwd()) {
  return {
    name: 'Verda Store',
    /* 12 characters is where Android starts truncating under an icon. */
    short_name: 'Verda',
    description: 'A room to wander. Retro, tabletop, battlestation, workshop, audio and the vault, ' +
      'from independent shops. Plus an arcade.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: tokenBg(root),
    theme_color: tokenBg(root),
    categories: ['shopping', 'games', 'entertainment'],
    lang: 'en',
    dir: 'ltr',
    icons: manifestIcons(),
    /* The arcade is the reason anybody would install this rather than
       bookmark it, so it gets the long-press shortcut. It is noindex
       and in no nav; a shortcut is not a crawl, and this is the one
       place it is worth being one tap away. */
    shortcuts: [
      { name: 'The Arcade', short_name: 'Arcade', url: '/arcade',
        description: 'Playable cabinets. Nothing here is selling you anything.' },
    ],
  }
}

/* ============================================================
   7. THE SHARE CARD
   ------------------------------------------------------------
   An affiliate mall gets shared in Discord, in group chats and on
   the timeline, which for this audience is most of how anybody
   arrives. Without og:image every one of those unfurls as a grey
   rectangle with a line of text in it -- and like every other icon
   failure, it looks fine to us, because we are the only people who
   never see our own links unfurl.

   IT NEEDS TEXT, AND THERE IS NOTHING HERE TO SET TYPE WITH. No
   rasteriser, no font loader, no canvas. Press Start 2P -- the face
   the site already uses for headings -- is a BITMAP font pretending
   to be a webfont, so the honest way to reproduce it here is a bitmap
   font: 5x7 cells, drawn as strings, scaled by whole numbers only.
   Fractional scaling is what makes pixel type look like a mistake,
   so `drawText` takes an integer and multiplies.

   THE FONT IS UPPERCASE-ONLY AND `drawText` THROWS on a glyph it does
   not have, for the same reason parseMark throws on a <path>: a
   missing letter is invisible in a file nobody opens, and a card
   reading "GAMING DUNGEN" would ship.

   SVG is not an option here however tempting -- no major unfurler
   accepts image/svg+xml for og:image, so this has to be a raster.
   ============================================================ */

const FONT = {
  ' ': '.....|.....|.....|.....|.....|.....|.....',
  '!': '..#..|..#..|..#..|..#..|..#..|.....|..#..',
  '\'': '.#...|.#...|.....|.....|.....|.....|.....',
  '+': '.....|..#..|..#..|#####|..#..|..#..|.....',
  '?': '.###.|#...#|....#|...#.|..#..|.....|..#..',
  '&': '.##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#',
  ',': '.....|.....|.....|.....|.##..|.##..|.#...',
  '-': '.....|.....|.....|#####|.....|.....|.....',
  '.': '.....|.....|.....|.....|.....|.##..|.##..',
  '/': '....#|....#|...#.|..#..|.#...|#....|#....',
  '0': '.###.|#...#|#..##|#.#.#|##..#|#...#|.###.',
  '1': '..#..|.##..|..#..|..#..|..#..|..#..|.###.',
  '2': '.###.|#...#|....#|...#.|..#..|.#...|#####',
  '3': '#####|...#.|..#..|...#.|....#|#...#|.###.',
  '4': '...#.|..##.|.#.#.|#..#.|#####|...#.|...#.',
  '5': '#####|#....|####.|....#|....#|#...#|.###.',
  '6': '..##.|.#...|#....|####.|#...#|#...#|.###.',
  '7': '#####|....#|...#.|..#..|.#...|.#...|.#...',
  '8': '.###.|#...#|#...#|.###.|#...#|#...#|.###.',
  '9': '.###.|#...#|#...#|.####|....#|...#.|.##..',
  ':': '.....|.##..|.##..|.....|.##..|.##..|.....',
  'A': '.###.|#...#|#...#|#####|#...#|#...#|#...#',
  'B': '####.|#...#|#...#|####.|#...#|#...#|####.',
  'C': '.###.|#...#|#....|#....|#....|#...#|.###.',
  'D': '####.|#...#|#...#|#...#|#...#|#...#|####.',
  'E': '#####|#....|#....|####.|#....|#....|#####',
  'F': '#####|#....|#....|####.|#....|#....|#....',
  'G': '.###.|#...#|#....|#.###|#...#|#...#|.###.',
  'H': '#...#|#...#|#...#|#####|#...#|#...#|#...#',
  'I': '#####|..#..|..#..|..#..|..#..|..#..|#####',
  'J': '..###|...#.|...#.|...#.|...#.|#..#.|.##..',
  'K': '#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#',
  'L': '#....|#....|#....|#....|#....|#....|#####',
  'M': '#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#',
  'N': '#...#|##..#|#.#.#|#.#.#|#..##|#...#|#...#',
  'O': '.###.|#...#|#...#|#...#|#...#|#...#|.###.',
  'P': '####.|#...#|#...#|####.|#....|#....|#....',
  'Q': '.###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#',
  'R': '####.|#...#|#...#|####.|#.#..|#..#.|#...#',
  'S': '.####|#....|#....|.###.|....#|....#|####.',
  'T': '#####|..#..|..#..|..#..|..#..|..#..|..#..',
  'U': '#...#|#...#|#...#|#...#|#...#|#...#|.###.',
  'V': '#...#|#...#|#...#|#...#|#...#|.#.#.|..#..',
  'W': '#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#',
  'X': '#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#',
  'Y': '#...#|#...#|.#.#.|..#..|..#..|..#..|..#..',
  'Z': '#####|....#|...#.|..#..|.#...|#....|#####',
}
const CELL_W = 5, CELL_H = 7, TRACK = 1   /* one blank column between glyphs */

export function textWidth(str, scale) {
  const n = str.length
  return n ? (n * (CELL_W + TRACK) - TRACK) * scale : 0
}

function drawText(px, W, H, str, x, y, scale, rgb, alpha = 1) {
  let cx = x
  for (const ch of str) {
    const g = FONT[ch]
    if (g === undefined) {
      throw new Error('branding: no glyph for "' + ch + '". The card font is uppercase and punctuation only; ' +
        'add the glyph to FONT rather than letting the letter vanish.')
    }
    const rows = g.split('|')
    for (let ry = 0; ry < CELL_H; ry++) {
      for (let rx = 0; rx < CELL_W; rx++) {
        if (rows[ry][rx] !== '#') continue
        /* Whole-number scaling: one font pixel becomes a scale x scale
           block, hard-edged. Antialiasing a pixel font is how it stops
           looking like a pixel font. */
        for (let dy = 0; dy < scale; dy++) {
          for (let dx = 0; dx < scale; dx++) {
            const ox = cx + rx * scale + dx, oy = y + ry * scale + dy
            if (ox < 0 || oy < 0 || ox >= W || oy >= H) continue
            const o = (oy * W + ox) * 4
            px[o] = rgb[0] * alpha + px[o] * (1 - alpha)
            px[o + 1] = rgb[1] * alpha + px[o + 1] * (1 - alpha)
            px[o + 2] = rgb[2] * alpha + px[o + 2] * (1 - alpha)
            px[o + 3] = 255
          }
        }
      }
    }
    cx += (CELL_W + TRACK) * scale
  }
  return cx
}

function fillRect(px, W, H, x, y, w, h, rgb, alpha = 1) {
  for (let oy = Math.max(0, y); oy < Math.min(H, y + h); oy++) {
    for (let ox = Math.max(0, x); ox < Math.min(W, x + w); ox++) {
      const o = (oy * W + ox) * 4
      px[o] = rgb[0] * alpha + px[o] * (1 - alpha)
      px[o + 1] = rgb[1] * alpha + px[o + 1] * (1 - alpha)
      px[o + 2] = rgb[2] * alpha + px[o + 2] * (1 - alpha)
      px[o + 3] = 255
    }
  }
}

/* 1200x630 is not a preference, it is what the unfurlers crop to.
   Anything meaningful must sit well inside it: Discord and iMessage
   letterbox the card differently and both will eat the edges. */
export const CARD = { w: 1200, h: 630 }

export function renderCard(mark, opts = {}) {
  const { w: W, h: H } = CARD
  const px = new Uint8ClampedArray(W * H * 4)
  const bg = colour(plate(mark))
  /* Heavenpillar's palette. `violet` keeps its variable name from the
     old CRT theme rather than being renamed through every use below;
     what it holds now is the gold the game uses for its own accents.
     UiKit.Colors: ink 1b1815, gold a8822a, text 26221e. */
  const violet = colour(opts.accent || '#a8822a')
  const gold = colour(opts.gold || '#1b1815')
  const ink = colour(opts.ink || '#26221e')

  fillRect(px, W, H, 0, 0, W, H, bg)

  /* A hairline frame, inset. Gives the card an edge when a client
     puts it on a white background, which about half of them do. */
  fillRect(px, W, H, 0, 0, W, 6, colour('#1b1815'), 0.9)
  fillRect(px, W, H, 0, H - 6, W, 6, colour('#1b1815'), 0.3)

  /* LAID OUT FROM THE CONTENT, NOT FROM SIX MAGIC NUMBERS. Every
     measurement below is derived, so changing the tagline or a type
     size re-centres the card instead of quietly leaving it 30px low
     -- which is exactly what the hand-placed first version did, and
     the kind of thing you only see once it is next to somebody
     else's link in a Discord channel. */
  const TITLE = 11, TAG = 5
  const lineH = CELL_H * TITLE
  const gaps = { line: 26, rule: 34, tag: 34 }
  const ruleH = 6
  const textH = lineH + gaps.line + lineH + gaps.rule + ruleH + gaps.tag + CELL_H * TAG

  const MK = 260, mx = 96
  const blockH = Math.max(MK, textH)
  const top = Math.round((H - blockH) / 2)

  /* The mark, drawn at card scale rather than upscaled from an icon:
     these are rects, so there is no reason to ever resample one. */
  const my = top + Math.round((blockH - MK) / 2)
  const icon = rasterize(mark, MK)
  for (let y = 0; y < MK; y++) {
    for (let x = 0; x < MK; x++) {
      const s = (y * MK + x) * 4, a = icon[s + 3] / 255
      if (!a) continue
      const o = ((my + y) * W + (mx + x)) * 4
      px[o] = icon[s] * a + px[o] * (1 - a)
      px[o + 1] = icon[s + 1] * a + px[o + 1] * (1 - a)
      px[o + 2] = icon[s + 2] * a + px[o + 2] * (1 - a)
      px[o + 3] = 255
    }
  }

  const tx = mx + MK + 76
  let ty = top + Math.round((blockH - textH) / 2)
  drawText(px, W, H, 'GAMING', tx, ty, TITLE, ink)
  ty += lineH + gaps.line
  drawText(px, W, H, 'DUNGEON', tx, ty, TITLE, violet)
  ty += lineH + gaps.rule
  fillRect(px, W, H, tx, ty, textWidth('DUNGEON', TITLE), ruleH, gold)
  ty += ruleH + gaps.tag

  const tagline = opts.tagline || 'A ROOM TO WANDER'
  /* Refuse rather than run off the edge. A tagline wider than the
     card is not a layout that degrades, it is a word cut in half. */
  if (tx + textWidth(tagline, TAG) > W - 48) {
    throw new Error('branding: the tagline "' + tagline + '" does not fit the card')
  }
  drawText(px, W, H, tagline, tx, ty, TAG, colour('#6e665c'), 1)

  return px
}

/* SPLIT FROM build() SO THE TEST CAN REBUILD WITHOUT WRITING. The
   committed assets are checked by regenerating them in memory and
   comparing bytes, the same way the sitemap is checked -- which only
   works if generating and writing are separable. A test that had to
   write into public/ to verify public/ would be dirtying the tree it
   is judging. */
export function render(root = process.cwd()) {
  const dir = join(root, 'public', 'assets')
  const mark = parseMark(readFileSync(join(dir, 'mark.svg'), 'utf8'))
  const bg = plate(mark)
  const out = []

  for (const a of ASSETS) {
    let buf
    if (a.ico) {
      buf = encodeICO(a.ico.map(size => ({ size, rgba: rasterize(mark, size) })))
    } else if (a.card) {
      buf = encodePNG(renderCard(mark), CARD.w, CARD.h)
    } else {
      buf = encodePNG(rasterize(mark, a.size, { inset: a.inset, background: a.plate ? bg : null }), a.size, a.size)
    }
    out.push({ file: a.root ? a.file : 'assets/' + a.file, buf })
  }

  out.push({ file: 'manifest.webmanifest', buf: Buffer.from(JSON.stringify(manifest(root), null, 2) + '\n') })

  /* Said out loud rather than left for somebody to notice: the icon
     plate and the site ground live in two different files and nothing
     forces them to agree. If they drift, the installed splash screen
     flashes one colour and the icon on it is another. */
  const ground = tokenBg(root)
  if (bg.toLowerCase() !== ground.toLowerCase()) {
    out.warning = "mark.svg's plate is " + bg + ' but tokens.css --bg is ' + ground +
      ' -- the installed splash screen will not match the icon.'
  }
  return out
}

export function build(root = process.cwd()) {
  mkdirSync(join(root, 'public', 'assets'), { recursive: true })
  const files = render(root)
  for (const f of files) writeFileSync(join(root, 'public', f.file), f.buf)
  const written = files.map(f => ({ file: f.file, bytes: f.buf.length }))
  written.warning = files.warning
  return written
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const written = build()
  for (const w of written) {
    console.log('  ' + w.file.padEnd(28) + (w.bytes / 1024).toFixed(1).padStart(7) + ' KB')
  }
  if (written.warning) console.log('\n  WARNING: ' + written.warning)
  console.log('\n  ' + written.length + ' files rebuilt from public/assets/mark.svg\n')
}
