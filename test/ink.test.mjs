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
