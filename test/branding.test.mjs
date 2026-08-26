/* The brand assets are generated, and this is what makes that true.
   ------------------------------------------------------------
   "Never hand-edit a PNG" is a rule three sister sites carry and all
   three carry it as prose, which is to say it is enforced by whoever
   happens to remember. Here it is enforced by regenerating every
   asset in memory and comparing bytes with what is committed. Edit a
   PNG by hand and this goes red; change the mark and forget to run
   `npm run branding` and this goes red too, which is the case that
   actually happens.

   THE FAILURE THIS GUARDS AGAINST IS INVISIBLE TO US. Icons render on
   home screens, in tab strips and in link unfurls, on devices nobody
   on the team owns, behind caches measured in weeks. A manifest
   naming an icon that does not exist does not error anywhere -- it
   produces a blank square on a stranger's phone. So every claim the
   manifest makes is checked here against a file on disk, and every
   file on disk is checked against the mark it came from.
*/

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { render, manifest, manifestIcons, parseMark, ASSETS, plate, tokenBg } from '../tools/branding.mjs'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const pub = f => join(ROOT, 'public', f)

/* --- tiny readers, so the assertions look at the real bytes ------- */

function pngSize(buf) {
  assert.deepEqual([...buf.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'not a PNG')
  assert.equal(buf.subarray(12, 16).toString('ascii'), 'IHDR')
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20), depth: buf[24], colour: buf[25] }
}

/* Enough of a PNG decoder to answer "is this pixel opaque". The
   encoder writes filter 0 on every row, and this asserts that rather
   than implementing the other four: a decoder that quietly handled
   them would hide a change in the encoder. */
function decodePNG(buf) {
  const { w, h, depth, colour } = pngSize(buf)
  assert.equal(depth, 8); assert.equal(colour, 6)
  let idat = Buffer.alloc(0)
  for (let off = 8; off < buf.length;) {
    const len = buf.readUInt32BE(off)
    const type = buf.subarray(off + 4, off + 8).toString('ascii')
    if (type === 'IDAT') idat = Buffer.concat([idat, buf.subarray(off + 8, off + 8 + len)])
    off += 12 + len
  }
  const raw = inflateSync(idat)
  const stride = w * 4
  const data = Buffer.alloc(stride * h)
  for (let y = 0; y < h; y++) {
    assert.equal(raw[y * (stride + 1)], 0, 'row ' + y + ' is not filter 0; the encoder changed')
    raw.copy(data, y * stride, y * (stride + 1) + 1, y * (stride + 1) + 1 + stride)
  }
  return { w, h, data }
}

function icoSizes(buf) {
  assert.equal(buf.readUInt16LE(0), 0, 'ICO reserved field must be 0')
  assert.equal(buf.readUInt16LE(2), 1, 'ICO type must be 1 (icon)')
  const n = buf.readUInt16LE(4)
  const out = []
  for (let i = 0; i < n; i++) {
    const e = 6 + i * 16
    out.push({
      size: buf[e] === 0 ? 256 : buf[e],
      bytes: buf.readUInt32LE(e + 8),
      offset: buf.readUInt32LE(e + 12),
    })
  }
  return out
}

/* ------------------------------------------------------------------ */

test('every committed brand asset is exactly what the generator produces', () => {
  /* The whole rule, as one assertion. Byte-for-byte: a PNG that is
     "nearly" right is a PNG somebody opened in an editor. */
  for (const f of render(ROOT)) {
    assert.ok(existsSync(pub(f.file)), f.file + ' is missing — run `npm run branding`')
    const on_disk = readFileSync(pub(f.file))
    assert.ok(on_disk.equals(f.buf),
      f.file + ' does not match what mark.svg generates. Either it was hand-edited, ' +
      'or the mark changed and `npm run branding` was not re-run.')
  }
})

test('the renderer refuses artwork it cannot draw, rather than dropping it', () => {
  /* The one way this design fails badly: it reads <rect>s, so a shape
     it does not understand would silently vanish from every raster
     while still showing in the SVG — an icon quietly missing its coin
     slot, visible only where we never look. It must throw instead. */
  const svg = readFileSync(pub('assets/mark.svg'), 'utf8')
  assert.doesNotThrow(() => parseMark(svg), 'the real mark must parse')

  const withPath = svg.replace('</svg>', '<path d="M0 0 L4 4"/></svg>')
  assert.throws(() => parseMark(withPath), /<path>/,
    'a shape this renderer cannot draw must fail the build, not disappear')

  const withGradient = svg.replace('fill="#a78bfa"', 'fill="url(#g)"')
  assert.throws(() => parseMark(withGradient), /#rrggbb/,
    'a fill this renderer cannot draw must fail the build')
})

test('the manifest names only icons that exist, at the sizes it claims', () => {
  const mf = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'))
  assert.ok(mf.icons.length, 'a manifest with no icons is a blank square on a home screen')

  for (const icon of mf.icons) {
    const rel = icon.src.replace(/^\//, '')
    assert.ok(existsSync(pub(rel)), icon.src + ' is in the manifest but not on disk')
    const { w, h, colour } = pngSize(readFileSync(pub(rel)))
    assert.equal(w + 'x' + h, icon.sizes, icon.src + ' is ' + w + 'x' + h + ', manifest says ' + icon.sizes)
    assert.equal(colour, 6, icon.src + ' must be RGBA')
    assert.equal(icon.type, 'image/png')
  }
})

test('the manifest has both an `any` icon and a `maskable` one', () => {
  /* Not pedantry, and not the same file listed twice. A maskable icon
     is drawn to survive being cropped to a circle, so it carries a
     full-bleed background and inset artwork; used as a plain icon it
     shows as a small mark adrift on a large square. Ship only
     maskable and desktop looks wrong; ship only `any` and Android
     clips the corners off the coin door. Both, always. */
  const mf = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'))
  const purposes = new Set(mf.icons.map(i => i.purpose))
  assert.ok(purposes.has('any'), 'no `any` icon: desktop and the tab strip have nothing to use')
  assert.ok(purposes.has('maskable'), 'no `maskable` icon: Android will crop the mark')

  const any = mf.icons.filter(i => i.purpose === 'any').map(i => i.src)
  const mask = mf.icons.filter(i => i.purpose === 'maskable').map(i => i.src)
  for (const src of mask) {
    assert.equal(any.includes(src), false,
      src + ' is listed as both any and maskable — one file cannot be drawn for both')
  }
})

test('the committed manifest is the generated one', () => {
  /* Same guarantee as the sitemap: a hand-edit here is a fourth list
     of what exists, kept in step by memory. */
  const on_disk = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'))
  assert.deepEqual(on_disk, manifest(ROOT), 'public/manifest.webmanifest is stale — run `npm run branding`')
  assert.deepEqual(on_disk.icons, manifestIcons())
})

test('the manifest describes this site and can actually be installed', () => {
  const mf = JSON.parse(readFileSync(pub('manifest.webmanifest'), 'utf8'))
  assert.equal(mf.start_url, '/')
  assert.equal(mf.scope, '/')
  assert.ok(['standalone', 'minimal-ui', 'fullscreen'].includes(mf.display),
    'display must be an installable value')

  /* The splash screen and the status bar are painted with these, and
     the site's ground colour lives in tokens.css. A drift here shows
     up as a white flash on launch, on installed devices only. */
  assert.equal(mf.background_color, tokenBg(ROOT), 'background_color has drifted from tokens.css --bg')
  assert.equal(mf.theme_color, tokenBg(ROOT), 'theme_color has drifted from tokens.css --bg')

  for (const s of mf.shortcuts || []) {
    assert.ok(s.url.startsWith('/'), 'a shortcut must stay inside the scope: ' + s.url)
    const file = s.url === '/' ? 'index.html' : s.url.replace(/^\//, '') + '.html'
    assert.ok(existsSync(pub(file)), 'shortcut ' + s.url + ' points at a page that does not exist')
  }
})

test('favicon.ico is at the root, is a real ICO, and carries the small sizes', () => {
  /* At the ROOT because /favicon.ico is requested blind by crawlers,
     unfurlers and feed readers that never parse a <head>. The <link>
     tags cover browsers; this covers everything else, and its absence
     is a 404 nobody ever sees in their own tab. */
  const buf = readFileSync(pub('favicon.ico'))
  const entries = icoSizes(buf)
  const declared = ASSETS.find(a => a.file === 'favicon.ico').ico
  assert.deepEqual(entries.map(e => e.size).sort((a, b) => a - b), declared.slice().sort((a, b) => a - b))

  for (const e of entries) {
    assert.ok(e.offset + e.bytes <= buf.length, 'an ICO directory entry points past the end of the file')
    /* BMP payloads, not PNG ones: the only reason to ship .ico at all
       is the clients that do not read <link rel="icon">, and those are
       the same clients that predate PNG-in-ICO. */
    assert.notDeepEqual([...buf.subarray(e.offset, e.offset + 4)], [0x89, 0x50, 0x4e, 0x47],
      'the ' + e.size + 'px entry is a PNG; an .ico full of PNGs is a compatibility shim ' +
      'that is not compatible with anything the SVG did not already cover')
    assert.equal(buf.readUInt32LE(e.offset), 40, 'expected a BITMAPINFOHEADER')
    assert.equal(buf.readInt32LE(e.offset + 8), e.size * 2,
      'a BMP icon height must be doubled to cover the AND mask')
  }
})

test('the icons that must be opaque are opaque, in every corner', () => {
  /* iOS ignores transparency on the home screen and composites onto
     black, which is nearly but not quite our background -- the
     "nearly" is what lets that bug survive review. A maskable icon
     with transparent corners defeats the whole point of being
     maskable.

     THE LIST IS NAMED HERE RATHER THAN READ OFF ASSETS. The first
     version iterated `ASSETS.filter(a => a.plate)`, which is the flag
     that causes the plate to be drawn — so deleting the flag did not
     fail the test, it removed the file from the test. A mutation run
     caught it. A test whose subject list comes from the thing it is
     checking cannot catch that thing being switched off.

     THE PIXELS ARE DECODED RATHER THAN THE INTENT ASSERTED, for the
     same reason: "a background colour was passed" and "every pixel
     came out opaque" are different claims. */
  const mark = parseMark(readFileSync(pub('assets/mark.svg'), 'utf8'))
  const bg = plate(mark)
  const want = [parseInt(bg.slice(1, 3), 16), parseInt(bg.slice(3, 5), 16), parseInt(bg.slice(5, 7), 16), 255]

  const mustBeOpaque = new Set([
    /* iOS never reads the manifest and never honours alpha. */
    'apple-touch-icon.png',
    /* Cropped to whatever shape the platform likes; transparent
       corners are the one thing that cannot survive that. */
    ...ASSETS.filter(a => a.purpose === 'maskable').map(a => a.file),
  ])
  assert.ok(mustBeOpaque.has('apple-touch-icon.png'))
  assert.ok(mustBeOpaque.size >= 3, 'expected the apple-touch icon and both maskable sizes')

  for (const file of mustBeOpaque) {
    assert.ok(existsSync(pub('assets/' + file)), file + ' is named as an opaque icon but does not exist')
    const px = decodePNG(readFileSync(pub('assets/' + file)))

    let clear = 0
    for (let i = 3; i < px.data.length; i += 4) if (px.data[i] !== 255) clear++
    assert.equal(clear, 0, file + ' has ' + clear + ' non-opaque pixels but must be fully opaque')

    /* The corners specifically, named: they are where a forgotten
       plate shows first, because the mark's own backing rect is
       rounded and they are exactly the pixels it does not cover. */
    const at = (x, y) => [...px.data.subarray((y * px.w + x) * 4, (y * px.w + x) * 4 + 4)]
    for (const [x, y] of [[0, 0], [px.w - 1, 0], [0, px.w - 1], [px.w - 1, px.w - 1]]) {
      assert.deepEqual(at(x, y), want, file + ' corner (' + x + ',' + y + ') is not the mark\'s plate colour')
    }
  }
})

test('the plain icons keep their transparent corners', () => {
  /* The other half of the same fact, and the reason there are two
     families rather than one file used twice: an `any` icon sits on
     whatever the platform puts behind it, so its rounded corners must
     actually be see-through. If a plate leaked into these they would
     render as squares in the tab strip. */
  for (const a of ASSETS.filter(a => a.purpose === 'any')) {
    const px = decodePNG(readFileSync(pub('assets/' + a.file)))
    const corner = px.data[(0 * px.w + 0) * 4 + 3]
    assert.equal(corner, 0, a.file + ' has an opaque corner; the mark is a rounded plate, not a square')
    let solid = 0
    for (let i = 3; i < px.data.length; i += 4) if (px.data[i] === 255) solid++
    assert.ok(solid > px.w * px.w * 0.6, a.file + ' is mostly transparent; the plate did not draw')
  }
})
