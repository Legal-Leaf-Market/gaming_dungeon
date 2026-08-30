/* ============================================================
   test/hero.test.mjs — the golden hero

   The hero is an approved 1680x936 painting with the headline, the
   body copy, both buttons, the brand and the badge PAINTED INTO IT.
   That makes several ordinary-looking edits silently destructive, and
   none of them show up in a diff:

   the words can fall out of the document, because on this
   composition they are drawn by the image and nothing on screen
   changes when the markup that holds them goes;

   the transparent controls can drift off the painted ones, because
   their coordinates are art, not layout;

   and the 2.9MB PNG can start being served to everybody, because it
   is a perfectly valid asset that happens to be seven times the
   weight of the one that should go.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const cssSrc = readFileSync(join(ROOT, 'public', 'css', 'hero-golden.css'), 'utf8')
/* Comments out before anything greps for a declaration. This file
   explains at length why `max-aspect-ratio: 1680/936` is wrong, and
   the first version of the guard below read its own explanation as
   the mistake it was written to catch. */
const css = cssSrc.replace(/\/\*[\s\S]*?\*\//g, '')
const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8')

test('the headline and the body copy are still in the document', () => {
  /* THE WHOLE POINT OF THE CLIP. On the golden composition the words
     are drawn by the image, so nothing visible changes if they are
     deleted, hidden with display:none, or replaced by an aria-label.
     A screen reader would get a picture with two links on it, and a
     crawler would get a page with no heading. */
  assert.match(html, /<h1>A room to <em>wander<\/em>\.<\/h1>/,
    'the h1 has gone from index.html')
  assert.match(html, /You climbed the old cherry on the ridge/,
    'the body copy has gone from index.html')

  const hidden = /\.hero-golden\s+\.hero-body\s*\{[^}]*\}/.exec(css)
  assert.ok(hidden, '.hero-golden .hero-body rule is missing')
  assert.ok(!/display\s*:\s*none/.test(hidden[0]),
    'the hero copy is display:none, which removes it from the accessibility ' +
    'tree as well as from the screen. Clip it instead.')
  assert.match(hidden[0], /clip-path/,
    'the hero copy should be clipped, not hidden')
})

test('the narrow fallback does not fire at the artboard size', () => {
  /* Written as `max-aspect-ratio: 1680/936` this fires AT 1680x936,
     because max- is inclusive and the artboard is exactly the
     boundary: the golden composition was replaced by the phone
     fallback at precisely the viewport the handoff names for QA.
     Strict less-than, and nothing else. */
  assert.ok(!/max-aspect-ratio\s*:\s*1680\s*\/\s*936/.test(css),
    'the narrow branch uses an inclusive max-aspect-ratio, so it fires at ' +
    'exactly 1680x936, which is the approved composition')
  assert.match(css, /@media\s*\(aspect-ratio\s*<\s*1680\/936\)/,
    'the narrow branch should be strictly below the design aspect')
})

test('the transparent controls sit where the painting drew them', () => {
  /* These four numbers are percentages of the artboard and they are
     a copy of something that lives in a PNG. If the art is ever
     regenerated they must be re-measured, and this is the thing that
     will say so. */
  const want = {
    '.hit-map': { left: '6.55%', top: '85.55%', width: '10.42%', height: '6.73%' },
    '.hit-arcade': { left: '17.70%', top: '85.55%', width: '9.05%', height: '6.73%' },
  }
  for (const [sel, props] of Object.entries(want)) {
    const rule = new RegExp('\\' + sel + '\\s*\\{([^}]*)\\}').exec(css)
    assert.ok(rule, sel + ' has no rule in hero-golden.css')
    for (const [k, v] of Object.entries(props)) {
      assert.ok(rule[1].includes(k + ':' + v),
        `${sel} should be ${k}:${v} (percentages of the 1680x936 artboard); got: ${rule[1].trim()}`)
    }
  }
  assert.match(html, /class="golden-hit hit-map"[^>]*href="#map"/,
    'the map hit target lost its route')
  assert.match(html, /class="golden-hit hit-arcade"[^>]*href="\/arcade"/,
    'the arcade hit target lost its route')
})

test('the light asset is the one that ships', () => {
  const png = statSync(join(ROOT, 'public', 'verda-hero', 'hero-golden-target.png')).size
  const webp = statSync(join(ROOT, 'public', 'verda-hero', 'hero-golden-target.webp')).size

  /* The PNG stays: it is the asset the handoff named and the fallback
     for anything without WebP. It must never be the one a modern
     browser fetches. */
  assert.ok(webp < png / 3,
    `the WebP is ${(webp / 1024) | 0}KB against the PNG's ${(png / 1024) | 0}KB; ` +
    `if they are close, the WebP has been re-encoded at a quality that ` +
    `defeats the point of having it`)
  assert.match(css, /image-set\(/, 'the hero no longer offers the WebP')

  /* Preloaded as WebP ONLY. Preloading both downloads the one the
     browser is not going to use, which on this page is 2.9MB. */
  const pre = /<link rel="preload"[^>]*as="image"[^>]*>/g
  const links = html.match(pre) || []
  assert.equal(links.length, 1, 'expected exactly one image preload on the hero')
  assert.match(links[0], /\.webp/, 'the preload should name the WebP')
  assert.ok(!links[0].includes('.png'), 'the 2.9MB PNG must not be preloaded')
})

test('the generated scene is switched off under the painting', () => {
  /* .city is a fixed, full-viewport vector scene behind the whole
     document. Left on under an opaque photograph it still shows in
     the gap between the bottom of the hero and the point the ground
     ramp goes opaque: a couple of hundred pixels of a completely
     different drawing style, at the join. */
  assert.match(css, /body:has\(\.hero-golden\)\s*\.city\s*\{\s*display:none\s*\}/,
    'the generated city scene is still drawn behind the golden hero')
})
