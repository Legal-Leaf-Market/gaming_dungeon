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
  const m = /--bg\s*:\s*(#[0-9a-f]{6})/i.exec(css)
  if (!m) throw new Error('branding: could not find --bg in tokens.css')
  return m[1]
}

export function manifest(root = process.cwd()) {
  return {
    name: 'Gaming Dungeon',
    /* 12 characters is where Android starts truncating under an icon. */
    short_name: 'Dungeon',
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
    const buf = a.ico
      ? encodeICO(a.ico.map(size => ({ size, rgba: rasterize(mark, size) })))
      : encodePNG(rasterize(mark, a.size, { inset: a.inset, background: a.plate ? bg : null }), a.size, a.size)
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
