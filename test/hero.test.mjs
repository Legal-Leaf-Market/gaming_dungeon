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
import { readFileSync, readdirSync, statSync } from 'node:fs'
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

/* The span of the block opened by the first brace after `from`. */
function block (src, from) {
  const open = src.indexOf('{', from)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i)
  }
  throw new Error('unbalanced braces in hero-golden.css')
}
/* The branch that puts the live words back on screen. Found by what
   it DOES -- un-clipping the hero copy -- rather than by its query
   text, so the assertions below are about that branch whatever it is
   keyed on. */
const narrowAt = css.indexOf('@media', css.indexOf('clip-path:none') - 4000)
const narrow = block(css, css.lastIndexOf('@media', css.indexOf('clip-path:none')))

test('the section is the artboard at every size', () => {
  /* THE HIT TARGETS ARE PERCENTAGES OF A PNG. They only land on the
     buttons they cover while the section is exactly 1680:936; any
     other shape and `cover` crops, which slides the painting under
     them. It was `min-height:min(100svh, 100vw*936/1680)`, which
     holds the aspect only while the window is TALLER than the
     artboard: at 1920x900 the section came out 2.13:1 and the
     transparent control for "Walk the map" sat 60px above the
     painted button. */
  const rule = /\.hero-golden\s*\{([^}]*)\}/.exec(css)
  assert.ok(rule, '.hero-golden has no rule')
  assert.match(rule[1], /aspect-ratio\s*:\s*1680\s*\/\s*936/,
    'the plate no longer holds the artboard aspect, so `cover` will crop it ' +
    'and the hit targets will drift off the painted buttons')
  /* .ink-hero carries min-height:min(90vh,780px) for the generated
     scene, and a min-height beats an aspect-ratio. At 1280x860 it
     held the plate at 774px against the 713 the artboard asks for. */
  assert.match(rule[1], /min-height\s*:\s*0/,
    '.ink-hero\'s min-height will win over the aspect-ratio and reshape the plate')
})

test('the live words never appear next to the painted ones', () => {
  /* THE BUG THIS IS HERE FOR. The branch below used to fire whenever
     the window was narrower in ASPECT than 1680:936, on the
     assumption that a narrower window crops the painting's left
     third away and takes the painted headline with it. True on a
     phone, false on a laptop: at 1440x900 the plate is 1440x802,
     which is the artboard's own aspect, so nothing was cropped at
     all -- and this branch drew the live headline, body and buttons
     over the painted ones. Every word of the hero appeared twice,
     offset, on the most common desktop window there is.

     A width is the honest trigger, because what makes the painted
     copy unusable is that it scales with the window: it is set at
     about 16px on a 1680 artboard, so at 1000px wide it is 9.5px. */
  assert.ok(!/max-aspect-ratio\s*:\s*1680\s*\/\s*936/.test(css),
    'the narrow branch uses an inclusive max-aspect-ratio, so it also fires ' +
    'at exactly 1680x936, which is the approved composition')
  const query = css.slice(narrowAt, css.indexOf('{', narrowAt))
  assert.match(query, /width\s*<\s*\d+px/,
    'the branch that restores the live copy must be keyed on a width: ' +
    `keyed on anything else it fires at sizes where the painted copy is ` +
    `still fully on screen, and the hero says everything twice. Got: ${query.trim()}`)
  assert.ok(!/aspect-ratio/.test(query),
    `the branch is still keyed on an aspect ratio: ${query.trim()}`)
})

test('where the live words come back, the painted ones are covered', () => {
  /* Restoring the live copy is only half of it. Wherever the painting
     is a GROUND rather than the whole composition it is still the
     background, and background-position alone cannot be relied on to
     push its words off frame: at 1279x900 a `cover` crop removes
     about an eighth of the artboard's width and the painted headline
     reaches 36% of it. */
  const cover = block(css, css.indexOf('.hero-paint::after'))
  /* MATCHED ON THE ALPHA, NOT ON A TONE. This used to name
     rgba(12,20,32,1) literally, so it failed the moment the palette
     moved -- and it has now moved twice. What the cover has to be is
     OPAQUE where the painted words are; which grey it is opaque in is
     the palette's business, not this test's. The channels are held
     equal by the site-wide no-colour guard in test/copy.test.mjs
     rather than restated here. */
  assert.match(cover, /linear-gradient\(90deg[^)]*rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*1\s*\)/,
    '.hero-paint::after has no opaque cover over the painted copy, so the ' +
    'live words and the painted ones will be on screen at once')
  /* NEARLY OPAQUE IS NOT OPAQUE. At 0.96 the painted headline
     measured 18-25 out of 255 against a ground of 18-20: seven
     levels, which is nothing on a chart and a legible grey ghost on
     a dark screen. */
  assert.ok(!/linear-gradient\(90deg\s*,\s*rgba\([^)]*,\s*\.\d+\s*\)\s+0\b/.test(cover),
    'the cover starts at less than full opacity: the painted words will ghost')
  /* AND IT MUST NOT INHERIT .ink-hero::before's MASK. That mask fades
     the scrim out below 62% so it cannot draw a ruled line where the
     section ends, which is right for a scrim and fatal for a cover:
     the painted body copy and both buttons live in the bottom third,
     and at 88% of the hero the cover was down to a quarter of its
     alpha. */
  assert.match(cover, /mask-image:/,
    'the cover has no mask of its own, so it inherits the scrim\'s bottom ' +
    'fade and stops covering exactly where the painted buttons are')
  assert.ok(!/mask-image:\s*linear-gradient\(180deg,\s*#000 62%/.test(cover),
    'the cover carries the scrim\'s own fade-out mask')

  /* The whole composition switches the covers off, and the branch
     that brings the live words back switches them on again. It has
     to do it with `content` and nothing else: restating a gradient
     here is a second copy of every number above. */
  assert.match(css, /\.hero-golden::before,\s*\n?\.hero-golden::after\{\s*content:none\s*\}/,
    'the golden composition no longer turns the covers off, so it will be ' +
    'showing its own painted copy through a panel meant to hide it')
  assert.match(narrow, /\.hero-golden\.hero-paint::before,\s*\n?\s*\.hero-golden\.hero-paint::after\{\s*content:''\s*\}/,
    'the narrow branch does not turn the covers back on')
  assert.ok(!/linear-gradient\(90deg/.test(narrow),
    'the narrow branch has its own copy of the cover gradient: it will drift ' +
    'from the one on .hero-paint the first time either is tuned')
})

test('every page that paints with the hero links the sheet that defines it', () => {
  /* .hero-paint is what puts the painting behind a section, and it
     lives in hero-golden.css. The arcade hero was given the class and
     not the stylesheet, and the symptom is not an error: the section
     simply keeps whatever background it had, which on that page was
     the generated scene it was being moved away from. */
  for (const page of readdirSync(join(ROOT, 'public')).filter(f => f.endsWith('.html'))) {
    const src = readFileSync(join(ROOT, 'public', page), 'utf8')
    if (!/class="[^"]*\bhero-paint\b/.test(src)) continue
    assert.ok(src.includes('/css/hero-golden.css'),
      `${page} uses .hero-paint but never links /css/hero-golden.css`)
  }
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
  assert.match(css, /body:has\(\.hero-paint\)\s*\.city\s*\{\s*display:none\s*\}/,
    'the generated city scene is still drawn behind the painting')
})
