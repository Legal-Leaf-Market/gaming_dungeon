/* ============================================================
   test/ink.test.mjs — the ink layer keeps the last word

   The hover treatment only works because /css/ink.css is the LAST
   stylesheet on the page. It started life inside app.css and the
   arcade's "back to the map" link came out as a paper tile with
   green writing on it: arcade.html's own <style> block sits after
   the <link> to app.css, so at equal specificity the page won.

   Nothing about that failure is visible in a diff. Adding a <style>
   block to a page, or linking one more stylesheet at the bottom,
   quietly takes the ink layer's last word away again and the only
   symptom is that some controls half-transform. So it is asserted
   here, per page, on the real markup.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

const PAGES = readdirSync(PUBLIC).filter(f => f.endsWith('.html'))

/* Every place the cascade can be added to, in document order: a
   linked stylesheet or an inline <style>. The font <link>s carry no
   rules of ours and are matched here anyway, which is correct --
   they are still stylesheets, and one appearing after ink.css would
   still be a change worth failing on. */
function sheets (html) {
  const out = []
  const re = /<link\b[^>]*rel=["']stylesheet["'][^>]*>|<style\b[^>]*>/gi
  let m
  while ((m = re.exec(html))) {
    const tag = m[0]
    const href = /href=["']([^"']+)["']/.exec(tag)
    out.push(href ? href[1] : '<style>')
  }
  return out
}

for (const page of PAGES) {
  test(`${page} loads the ink layer last`, () => {
    const html = readFileSync(join(PUBLIC, page), 'utf8')
    const list = sheets(html)
    assert.ok(list.includes('/css/ink.css'),
      `${page} does not link /css/ink.css at all`)
    assert.equal(list[list.length - 1], '/css/ink.css',
      `${page} loads ${list[list.length - 1]} after the ink layer: ` +
      `its rules will win over the hover treatment`)
    /* The generated keyframes go BEFORE, not after, and the reason is
       this very assertion. @keyframes take no part in the cascade, so
       nothing is lost by putting them first, and ink.css keeps the
       last word. Linking the generated file after would pass a
       reading of "the ink layer is loaded" while quietly taking that
       last word away. */
    const anim = list.indexOf('/css/ink-anim.css')
    assert.ok(anim !== -1, `${page} does not link /css/ink-anim.css: ` +
      'every hover animation on it is a no-op')
    assert.ok(anim < list.indexOf('/css/ink.css'),
      `${page} loads the generated keyframes after ink.css`)
  })
}

test('every page is covered, not just the ones that existed today', () => {
  // A new page with no ink.css link would pass the loop above by
  // simply not being in it if PAGES were ever hardcoded. It is not,
  // and this is the guard that it stays that way.
  assert.ok(PAGES.length >= 6, 'expected the six pages at least')
})

test('the ink layer defines its own paper and ink, and gates on hover', () => {
  const css = readFileSync(join(PUBLIC, 'css', 'ink.css'), 'utf8')
  assert.match(css, /--ink-paper:/, 'paper token missing')
  assert.match(css, /--ink-line:/, 'ink token missing')
  /* A touch device has no way to leave a hover state, so a control
     that transformed on tap would stay transformed. Everything in
     here except the tokens lives behind (hover:hover). */
  assert.match(css, /@media\s*\(hover:\s*hover\)/,
    'the treatment must be gated on a real pointer')
  /* Comments here quote selectors while explaining them, so they
     have to come out before anything counts :hover occurrences. */
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const body = bare.slice(bare.indexOf('@media'))
  assert.ok(!/:hover/.test(bare.slice(0, bare.indexOf('@media'))),
    'a :hover rule escaped the (hover:hover) gate')
  assert.ok(body.includes('/assets/enso.svg'), 'the pins lost their enso')
  assert.ok(body.includes('/assets/ink-frame.svg'), 'the brush frame is gone')
})

test('the assets the ink layer names are actually there', () => {
  for (const f of ['enso.svg', 'ink-frame.svg', 'paper.svg']) {
    const svg = readFileSync(join(PUBLIC, 'assets', f), 'utf8')
    assert.match(svg, /^<svg\b/, `${f} is not an svg`)
    assert.match(svg, /viewBox=/, `${f} has no viewBox, so it cannot scale`)
  }
})


/* ------------------------------------------------------------
   THE ANIMATION LAYER

   ink.css names animations; ink-anim.css defines most of them. Two
   files, one of them generated, is exactly the shape that drifts:
   rename a keyframe in the generator and nothing breaks loudly, the
   hover just stops drawing itself and the frame appears instead --
   which is also what the correct reduced-motion behaviour looks
   like, so it survives being looked at.
   ------------------------------------------------------------ */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

/* Span of the block opened by the brace after `from`, matched. */
function block (css, from) {
  const open = css.indexOf('{', from)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    else if (css[i] === '}' && --depth === 0) return [open, i]
  }
  throw new Error('unbalanced braces in ink.css')
}

test('every animation ink.css asks for is actually defined', () => {
  const ink = strip(readFileSync(join(PUBLIC, 'css', 'ink.css'), 'utf8'))
  const anim = strip(readFileSync(join(PUBLIC, 'css', 'ink-anim.css'), 'utf8'))
  const defined = new Set(
    [...(ink + anim).matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]))
  const used = new Set(
    [...ink.matchAll(/animation:([^;]+);/g)]
      .flatMap(m => m[1].split(','))
      .map(part => part.trim().split(/\s+/)[0])
      .filter(Boolean))
  assert.ok(used.size >= 4, 'expected the draw-on, the boil and the wobbles')
  for (const name of used) {
    assert.ok(defined.has(name),
      `ink.css animates "${name}" and no @keyframes ${name} exists in ` +
      'either stylesheet, so that hover does nothing at all')
  }
})

test('nothing moves for a visitor who asked for stillness', () => {
  const css = strip(readFileSync(join(PUBLIC, 'css', 'ink.css'), 'utf8'))
  /* The resting hand-drawn look -- paper, brush frame, the half a
     degree off true -- is deliberately NOT animated, so it survives
     the query. Everything that actually moves has to be inside it. */
  const gate = css.indexOf('prefers-reduced-motion:no-preference')
  assert.ok(gate !== -1, 'there is no reduced-motion gate at all')
  const [open, close] = block(css, gate)
  let i = -1
  while ((i = css.indexOf('animation:', i + 1)) !== -1) {
    assert.ok(i > open && i < close,
      'an `animation:` at index ' + i + ' sits outside the ' +
      'prefers-reduced-motion gate: it will run for a visitor who ' +
      'asked for no motion')
  }
})

test('the drawing frames are inline, not eleven more requests', () => {
  const anim = readFileSync(join(PUBLIC, 'css', 'ink-anim.css'), 'utf8')
  assert.match(anim, /GENERATED BY tools\/ink\.mjs/,
    'the generated banner is gone, so somebody has hand-edited it')
  /* A draw-on is over in three tenths of a second. If the six stages
     were six URLs the first hover would spend that fetching them and
     animate an empty box, and it would look fine to whoever built it
     because their browser already had them. */
  const external = [...anim.matchAll(/url\((?!"data:)([^)]+)\)/g)].map(m => m[1])
  for (const u of external) {
    assert.equal(u, '/assets/paper.svg',
      `ink-anim.css fetches ${u} mid-animation; only the paper grain, ` +
      'which is already on screen before the animation starts, may be a URL')
  }
  const stages = [...anim.matchAll(/data:image\/svg\+xml/g)].length
  assert.ok(stages >= 14,
    `only ${stages} inline drawings: the draw-on stages or the boil ` +
    'takes have been dropped')
})
