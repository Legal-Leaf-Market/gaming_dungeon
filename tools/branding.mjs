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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'

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
export function parseMark(rawSvg) {
  /* COMMENTS STRIPPED BEFORE ANYTHING READS THIS.

     The refusal scan below tests for the literal text "<path", and
     mark.svg's own comment explains which elements are refused by
     naming them, so the file failed the build by DOCUMENTING itself.
     Same trap as the source guards in test/: a check that cannot tell
     "the thing is here" from "here is why the thing is not allowed"
     punishes the documentation, and the documentation is the more
     valuable half.

     Stripping also means a commented-out shape stays commented out,
     which is what a reader expects and what the previous version got
     wrong in the other direction. */
  const svg = String(rawSvg).replace(/<!--[\s\S]*?-->/g, '')

  const vb = /viewBox\s*=\s*"([^"]+)"/.exec(svg)
  if (!vb) throw new Error('branding: mark.svg has no viewBox')
  const [, , w, h] = vb[1].trim().split(/[\s,]+/).map(Number)

  /* Anything that draws and this renderer cannot see is refused
     rather than skipped: a shape that silently vanishes from every
     icon is far worse than a build that stops.

     <ellipse> and <circle> ARE drawn now, with an optional
     rotate() transform, which is what a five-petal blossom needs.
     The mark is also served straight to browsers as the favicon, so
     it has to stay real SVG that a browser renders identically; a
     rotate transform is, a made-up attribute would not be. */
  for (const el of ['path', 'polygon', 'polyline', 'line', 'text', 'image', 'use']) {
    if (new RegExp('<' + el + '[\\s>]').test(svg)) {
      throw new Error('branding: mark.svg contains <' + el + '>, which this renderer does not draw. ' +
        'Either keep the mark to <rect>s or teach tools/branding.mjs the new element.')
    }
  }

  /* rotate(deg) or rotate(deg cx cy), shared by every shape. Stored
     as radians plus a pivot; the renderer applies it by rotating the
     SAMPLE POINT backwards, which is how you rotate a shape you are
     hit-testing rather than drawing. */
  function rotationOf(a, fallbackX, fallbackY) {
    const t = /rotate\(\s*(-?[\d.]+)(?:[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+))?\s*\)/.exec(a.transform || '')
    if (!t) return { rot: 0, rcx: fallbackX, rcy: fallbackY }
    return {
      rot: (Number(t[1]) * Math.PI) / 180,
      rcx: t[2] !== undefined ? Number(t[2]) : fallbackX,
      rcy: t[3] !== undefined ? Number(t[3]) : fallbackY,
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
    /* ROTATED RECTS, because a brush stroke is a bar at an angle and
       there is no other primitive here that makes one. Ellipses got
       rotation first; rects doing it too is the same three fields and
       the same unrotate(), not a second mechanism. */
    const rt = rotationOf(a, x + rw / 2, y + rh / 2)

    if (fill && fill !== 'none') {
      shapes.push({ kind: 'fill', x, y, w: rw, h: rh, r, rgb: colour(fill), alpha, ...rt })
    }
    if (a.stroke && a.stroke !== 'none') {
      const sw = Number(a['stroke-width'] || 1)
      shapes.push({
        kind: 'ring', rgb: colour(a.stroke), alpha, ...rt,
        outer: { x: x - sw / 2, y: y - sw / 2, w: rw + sw, h: rh + sw, r: Math.max(0, r + sw / 2) },
        inner: { x: x + sw / 2, y: y + sw / 2, w: rw - sw, h: rh - sw, r: Math.max(0, r - sw / 2) },
      })
    }
  }
  /* ---- ellipses and circles -------------------------------- */
  for (const m of svg.matchAll(/<(ellipse|circle)\b[^>]*>/g)) {
    const a = attrs(m[0])
    const cx = Number(a.cx || 0), cy = Number(a.cy || 0)
    const rx = Number(a.rx !== undefined ? a.rx : a.r)
    const ry = Number(a.ry !== undefined ? a.ry : a.r)
    if (!(rx > 0) || !(ry > 0)) continue
    const alpha = a.opacity === undefined ? 1 : Number(a.opacity)
    const fill = a.fill === undefined ? '#000000' : a.fill

    /* rotate(deg) or rotate(deg cx cy). Stored as radians and applied
       by rotating the SAMPLE POINT backwards, which is how you rotate
       a shape you are hit-testing rather than drawing. */
    const { rot, rcx, rcy } = rotationOf(a, cx, cy)

    if (fill && fill !== 'none') {
      shapes.push({ kind: 'ell', cx, cy, rx, ry, rot, rcx, rcy, rgb: colour(fill), alpha })
    }
    if (a.stroke && a.stroke !== 'none') {
      const sw = Number(a['stroke-width'] || 1)
      shapes.push({
        kind: 'ellring', rot, rcx, rcy, rgb: colour(a.stroke), alpha,
        outer: { cx, cy, rx: rx + sw / 2, ry: ry + sw / 2 },
        inner: { cx, cy, rx: rx - sw / 2, ry: ry - sw / 2 },
      })
    }
  }

  if (!shapes.length) throw new Error('branding: no drawable shapes found in mark.svg')
  return { w, h, shapes }
}

/* ============================================================
   2. DRAW IT
   ============================================================ */

function insideEll(px, py, e) {
  if (!(e.rx > 0) || !(e.ry > 0)) return false
  const dx = (px - e.cx) / e.rx
  const dy = (py - e.cy) / e.ry
  return dx * dx + dy * dy <= 1
}

/* Rotate the sample point INTO the shape's own frame, by the negative
   of the shape's rotation. Rotating the ellipse instead would mean
   solving a general conic; this is two multiplies. */
function unrotate(px, py, s) {
  if (!s.rot) return [px, py]
  const c = Math.cos(-s.rot), sn = Math.sin(-s.rot)
  const dx = px - s.rcx, dy = py - s.rcy
  return [s.rcx + dx * c - dy * sn, s.rcy + dx * sn + dy * c]
}

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
            /* One unrotate for every kind. It is a no-op when rot is
               0, which is most shapes, so the common path costs a
               single branch. */
            const [px2, py2] = unrotate(ux, uy, s)
            let hit
            if (s.kind === 'fill') hit = insideRR(px2, py2, s)
            else if (s.kind === 'ring') hit = insideRR(px2, py2, s.outer) && !insideRR(px2, py2, s.inner)
            else if (s.kind === 'ell') hit = insideEll(px2, py2, s)
            else hit = insideEll(px2, py2, s.outer) && !insideEll(px2, py2, s.inner)
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
/* ============================================================
   THE RASTER BRAND

   The studio artwork is a painting. It is not two bars and a ring,
   it is an ink-wash enso around a brush V with mountains, a pagoda,
   cloud scrollwork and a wordmark, and no amount of <rect> is going
   to be it. So when public/assets/brand-logo.png exists, the icons
   come from the artwork and mark.svg stops being the source.

   That means decoding a PNG, here, with no dependencies. It is less
   work than it sounds: inflate the IDAT, undo the five scanline
   filters, done. Only what the artwork actually is, is supported,
   8-bit non-interlaced truecolour with or without alpha, and
   anything else throws rather than guessing.

   SIZE-ADAPTIVE CROPPING IS THE POINT, and it was decided by looking
   at the thing rather than by reasoning about it. Rendered at every
   icon size and compared:

     16 and 32px   only the V survives. The ring becomes a grey
                   smear and the wordmark becomes dirt.
     48px          the ring comes back and is worth having; the
                   wordmark is still mush.
     192px and up  the whole lockup, wordmark included.

   A favicon is not a small logo, and this is what "adaptive" has to
   mean when the logo is a painting: at 16px you show the letter,
   because the letter is the part that is still legible.
   ============================================================ */

const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10]

export function decodePNG(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIG[i]) throw new Error('branding: not a PNG')
  }
  let w = 0, h = 0, depth = 0, type = 0, interlace = 0
  const idat = []
  let p = 8
  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const tag = buf.toString('ascii', p + 4, p + 8)
    const body = buf.subarray(p + 8, p + 8 + len)
    if (tag === 'IHDR') {
      w = body.readUInt32BE(0); h = body.readUInt32BE(4)
      depth = body[8]; type = body[9]; interlace = body[12]
    } else if (tag === 'IDAT') idat.push(body)
    else if (tag === 'IEND') break
    p += 12 + len
  }
  if (depth !== 8) throw new Error('branding: only 8-bit PNGs, got depth ' + depth)
  if (type !== 2 && type !== 6) throw new Error('branding: only truecolour PNGs, got type ' + type)
  if (interlace) throw new Error('branding: interlaced PNGs are not supported')

  const ch = type === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * ch
  const out = new Uint8ClampedArray(w * h * 4)

  /* Undo the per-scanline filters. Each row's first byte names its
     filter and every predictor refers to bytes already reconstructed,
     which is why this has to run top to bottom in one pass. */
  let prev = new Uint8Array(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
    const cur = new Uint8Array(stride)
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0
      const b = prev[i]
      const c = i >= ch ? prev[i - ch] : 0
      let v = line[i]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) {
        const pp = a + b - c
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c)
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c)
      } else if (f !== 0) throw new Error('branding: unknown PNG filter ' + f)
      cur[i] = v & 255
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4
      out[d] = cur[s]; out[d + 1] = cur[s + 1]; out[d + 2] = cur[s + 2]
      out[d + 3] = ch === 4 ? cur[s + 3] : 255
    }
    prev = cur
  }
  return { w, h, px: out }
}

/* Box-filter downscale. Averaging every source pixel that lands in a
   destination pixel, not sampling one of them: at these ratios (1254
   down to 16) point sampling throws away 98% of the image and turns
   a brush stroke into aliased confetti. */
export function resample(img, sx, sy, sw, sh, dw, dh = dw) {
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let y = 0; y < dh; y++) {
    const y0 = sy + (y * sh) / dh, y1 = sy + ((y + 1) * sh) / dh
    for (let x = 0; x < dw; x++) {
      const x0 = sx + (x * sw) / dw, x1 = sx + ((x + 1) * sw) / dw
      let r = 0, g = 0, b = 0, a = 0, n = 0
      for (let j = Math.floor(y0); j < Math.max(Math.ceil(y1), Math.floor(y0) + 1); j++) {
        if (j < 0 || j >= img.h) continue
        for (let i = Math.floor(x0); i < Math.max(Math.ceil(x1), Math.floor(x0) + 1); i++) {
          if (i < 0 || i >= img.w) continue
          const s = (j * img.w + i) * 4
          r += img.px[s]; g += img.px[s + 1]; b += img.px[s + 2]; a += img.px[s + 3]; n++
        }
      }
      const d = (y * dw + x) * 4
      if (n) { out[d] = r / n; out[d + 1] = g / n; out[d + 2] = b / n; out[d + 3] = a / n }
    }
  }
  return out
}

/* WHICH PART OF THE PAINTING A GIVEN SIZE SHOWS. The fractions are
   the ones the comparison sheet picked; the vertical nudge lifts the
   crop off the wordmark, which sits below centre. */
/* THE SPLIT, AS A NAMED RULE RATHER THAN AN INLINE COMPARISON.

   Pulled out because the test written against it was VACUOUS while it
   was buried in render(): it checked the 192px icon, which is the
   painting under either policy, so moving the threshold changed
   nothing it could see and the mutation passed. A test that survives
   its own mutation is worse than no test, because it reads like
   cover.

   Now the rule is one exported function and the test asserts the
   rule. 64 is where the comparison sheet showed the enso ring stops
   resolving. */
export const ICON_VECTOR_MAX = 64

export function iconSource(size, hasLogo) {
  return hasLogo && size > ICON_VECTOR_MAX ? 'painting' : 'vector'
}

export function cropFor(size) {
  if (size <= 32) return { frac: 0.48, dy: -0.05 }   /* the V alone   */
  if (size <= 64) return { frac: 0.78, dy: 0 }       /* V and ring    */
  return { frac: 1, dy: 0 }                          /* whole lockup  */
}

/* SHARPEN THE SMALL ONES.

   Downscaling a wash painting to 16px averages ink and paper into a
   field of greys, and grey is what makes a small icon look smudged
   rather than small. This pushes luminance through a steep curve
   about a threshold, so the brush strokes go to ink, the paper goes
   to paper, and only the pixels genuinely straddling an edge keep a
   midtone.

   A HARD CUT WAS THE OBVIOUS THING AND IT IS WRONG: thresholding to
   pure black and white throws away the antialiasing too, and a 16px
   glyph with jagged edges reads worse than a soft one. The curve
   keeps the edge pixels and kills everything else, which is the
   whole difference between sharp and aliased. */
export function sharpen(rgba, k = 5.5, t = 0.62) {
  for (let i = 0; i < rgba.length; i += 4) {
    const lum = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255
    const v = Math.max(0, Math.min(1, (lum - t) * k + 0.5))
    /* Ink is neutral in this artwork, so collapsing to luminance
       loses nothing and avoids the colour fringing a per-channel
       curve would produce on an off-white paper. */
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v * 255
  }
  return rgba
}

/* Centre-crop to an aspect ratio, then resample. Takes the excess off
   whichever axis is long, so nothing is ever stretched. */
export function cropTo(img, w, h) {
  const want = w / h
  const have = img.w / img.h
  let sw = img.w, sh = img.h
  if (have > want) sw = img.h * want
  else sh = img.w / want
  const sx = (img.w - sw) / 2
  const sy = (img.h - sh) / 2
  /* ONE CALL, NOT ONE PER ROW. The first version asked resample() for
     a full SQUARE per destination row and kept only its first row,
     which for a 1200x630 card is 630 square rasters of 1200x1200 to
     produce 630 rows: nine hundred million pixel averages for a job
     that needs seven hundred thousand. It completed, slowly, which is
     the worst way for that kind of mistake to behave. resample takes
     a destination height now. */
  return resample(img, sx, sy, sw, sh, w, h)
}

/* THE ARTWORK TAKES THE MARK'S SHAPE.

   mark.svg is a rounded plate: its corners are transparent, the
   maskable variants sit inset on that plate, and apple-touch fills it
   opaque because iOS ignores transparency and would composite onto
   black otherwise. The painting is a hard-edged square with white
   corners, so dropping it in unchanged made icons that were the right
   picture and the wrong silhouette, sitting square where every other
   size is rounded.

   The radius is READ FROM mark.svg rather than repeated here, so the
   vector mark and the painting can never disagree about the shape
   they share. That is the whole reason the small and large icons
   still look like one set.

   Outside the radius: the plate colour when the icon must be opaque,
   nothing when it must not. */
export function roundPlate(rgba, size, mark, bg) {
  const outer = mark.shapes.find(s => s.kind === 'fill' && s.w >= mark.w * 0.98)
  const r = ((outer && outer.r) || 0) / mark.w * size
  const bgc = bg ? colour(bg) : null
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (y * size + x) * 4
      if (bgc) {
        /* source-over the artwork onto the plate, so a translucent
           edge lands on paper rather than on nothing */
        const a = rgba[d + 3] / 255
        rgba[d] = rgba[d] * a + bgc[0] * (1 - a)
        rgba[d + 1] = rgba[d + 1] * a + bgc[1] * (1 - a)
        rgba[d + 2] = rgba[d + 2] * a + bgc[2] * (1 - a)
        rgba[d + 3] = 255
      }
      if (!insideRR(x + 0.5, y + 0.5, { x: 0, y: 0, w: size, h: size, r })) {
        if (bgc) { rgba[d] = bgc[0]; rgba[d + 1] = bgc[1]; rgba[d + 2] = bgc[2]; rgba[d + 3] = 255 }
        else rgba[d + 3] = 0
      }
    }
  }
  return rgba
}

export function rasterIcon(img, size, opts = {}) {
  const { frac, dy } = cropFor(size)
  const s = Math.min(img.w, img.h) * frac
  const sx = (img.w - s) / 2
  const sy = (img.h - s) / 2 + img.h * dy
  const rgba = resample(img, sx, sy, s, s, size)
  /* Only the small ones. At 192px the wash IS the artwork and
     flattening it would be vandalism. */
  return size <= 64 && opts.sharp !== false ? sharpen(rgba) : rgba
}

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
    name: 'Verda Studio',
    /* 12 characters is where Android starts truncating under an icon. */
    short_name: 'Verda Studio',
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

  /* TWO SOURCES, SPLIT BY SIZE, AND EACH DOES WHAT IT IS GOOD AT.

     The studio logo is a wash painting: an enso around a brush V with
     mountains, a pagoda, cloud scrollwork and a wordmark. Above about
     64px that detail IS the brand and any redraw is a worse copy, so
     large icons are the painting, untouched.

     Below that it falls apart, and downscaling harder does not fix
     it. Cropping to the V clips the arms; keeping the ring turns the
     wordmark to dirt; sharpening the result makes both worse, loudly.
     A 16px icon has 256 pixels and the painting needs thousands.

     So the small sizes are mark.svg, which is the same enso and the
     same V drawn as two bars and a ring: the logo's silhouette, with
     edges that survive being 16 pixels wide. That is not a fallback
     any more, it is the small-size mark, and the two agree because
     one was drawn from the other.

     The threshold is 64 because that is where the comparison sheet
     showed the ring stops reading. */
  const optional = file => {
    try { return decodePNG(readFileSync(join(dir, file))) }
    catch (e) { if (e.code !== 'ENOENT') throw e; return null }
  }
  const logo = optional('brand-logo.png')
  const banner = optional('brand-banner.png')
  const icon = (size, opts = {}) => {
    if (iconSource(size, !!logo) === 'vector') return rasterize(mark, size, opts)
    /* The painting, cut to the same plate the vector mark is. */
    return roundPlate(rasterIcon(logo, size, opts), size, mark, opts.background || null)
  }

  for (const a of ASSETS) {
    let buf
    if (a.ico) {
      buf = encodeICO(a.ico.map(size => ({ size, rgba: icon(size) })))
    } else if (a.card) {
      /* THE BANNER IS THE SHARE CARD when it exists. renderCard()
         lays out type over a plate and does it well, and it is still
         the fallback, but the studio's key art is a 2.5:1 ink
         landscape with the wordmark already set in it. A drawn card
         next to that is a placeholder next to the real thing.

         Cropped, never squashed: the banner is wider than an OG card,
         so the sides come off rather than the middle being
         compressed. The wordmark sits centred in the art, which is
         what makes a centre crop safe here and would not be safe for
         a banner with the type off to one edge. */
      buf = banner
        ? encodePNG(cropTo(banner, CARD.w, CARD.h), CARD.w, CARD.h)
        : encodePNG(renderCard(mark), CARD.w, CARD.h)
    } else {
      buf = encodePNG(icon(a.size, { inset: a.inset, background: a.plate ? bg : null }), a.size, a.size)
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
  console.log('\n  ' + written.length + ' files rebuilt from ' +
    (existsSync(join(process.cwd(), 'public/assets/brand-logo.png'))
      ? 'public/assets/brand-logo.png' : 'public/assets/mark.svg') + '\n')
}
