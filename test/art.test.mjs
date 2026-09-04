/* ============================================================
   test/art.test.mjs — ink on paper stays on paper

   The monochrome library is dark ink drawn on PALE SHEETS, and
   the sheets are part of the drawing. Measured on the delivered
   files: every large piece is near-opaque (mean alpha .93) with
   its paper sitting at luminance 190 to 235, and only the ten
   sigils are the transparent, pale-ink exception the handoff
   describes.

   That makes two ordinary-looking edits silently destructive, and
   the first one already shipped once:

   TURNING A PLACEMENT DOWN ERASES THE PICTURE. The opacities in
   art.css were inherited from the previous COLOUR library, whose
   pieces were dark scenes wanting held back. Run .22 over a white
   sheet on a near-black page and the paper averages toward black
   and the ink averages toward grey: both ends of the drawing
   collapse into the middle and what is left is a smear. The owner
   read that back exactly, on 2026-09-04: the pieces looked "like
   inverted bullshit" and what he asked for was "a light background
   so the black ink can show up". Nothing had been inverted. The
   paper had been erased.

   RAISING ONE WITHOUT A MASK SHIPS A RECTANGLE. The pack's note
   says the big art "dissolves softly at edges". Measured, it does
   not: alpha is flat at .93 across each interior and only drops in
   the final antialiased pixel. Every sheet is a hard rectangle and
   every placement has to cut its own edge in CSS. A pale rectangle
   with a hard border on a near-black page is the single worst
   thing this library can do, and it looks fine in a diff.

   So: a floor on the opacities, a mask required wherever the floor
   applies, and the plate kept off the words.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* Comments out first. This file argues about .22 and .42 at length,
   and a guard that greps for a number would otherwise read the
   explanation as the mistake it exists to catch. */
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '')
const art = strip(readFileSync(join(ROOT, 'public', 'css', 'art.css'), 'utf8'))

/* The blocks that paint a pale sheet, and the one that does not.
   `.sigil` is excluded on purpose and by measurement: 20% of its
   pixels carry any alpha at all and they sit at luminance 235, so
   it is pale ink for the dark page and needs neither paper nor a
   mask. If a future pack makes the sigils opaque too, this list is
   where that gets noticed. */
const SHEETS = ['.rail', '.room-head::before', '.art-divider', '.region', '.plan-corner']

function block(sel) {
  const i = art.indexOf(sel + '{')
  assert.notEqual(i, -1, `${sel} has gone from art.css`)
  const open = art.indexOf('{', i)
  return art.slice(open + 1, art.indexOf('}', open))
}

test('no paper sheet is turned down far enough to erase it', () => {
  /* .6 is the floor, not the target. Below it the sheet's white and
     the drawing's black have both moved more than half the way to
     the page's ground and the piece has stopped being a drawing.
     The four values that shipped broken were .42, .22, .5 and .4. */
  for (const sel of SHEETS) {
    const m = block(sel).match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/)
    assert.ok(m, `${sel} sets no opacity, so it inherits one and the floor is unenforceable`)
    assert.ok(Number(m[1]) >= 0.6,
      `${sel} is at opacity ${m[1]}: at that strength the paper is gone and the ink is grey`)
  }
})

test('every sheet cuts its own edge, because the files do not', () => {
  /* The rails carry their masks on .rail-l and .rail-r rather than
     on .rail, because each fades toward the text column and that is
     a different side on each. Either the block or its two children
     must mask. */
  for (const sel of SHEETS) {
    const own = block(sel)
    const has = /mask-image\s*:/.test(own) ||
      (sel === '.rail' && /mask-image\s*:/.test(block('.rail-l')) &&
                          /mask-image\s*:/.test(block('.rail-r')))
    assert.ok(has, `${sel} is a hard pale rectangle: it raises the sheet with no mask to dissolve it`)
  }
})

test('the room plate is removed rather than laid over the heading', () => {
  /* The plate only works because it stands clear of the heading in
     the unused width beside it. Below --page there is no such width,
     and the only two ways to fit it there are to put it back on top
     of the words or to turn it back down to a smear. It goes away
     instead. */
  assert.match(art, /@media\s*\(max-width:\s*11\d\dpx\)\s*\{\s*\.room-head::before\s*\{\s*display:\s*none/,
    'the room plate is no longer hidden on viewports too narrow to hold it beside the heading')

  /* Fixed pixels, never a percentage. `right:-95%` reads as 95% of
     the HEADING, which is a constant 570px, so the sheet was one
     width at every viewport while the space it had to fit was not,
     and at 1100px its right-hand fade fell off the window and left
     a razor cut down the drawing. */
  const plate = block('.room-head::before')
  assert.match(plate, /width:\s*\d+px/,
    'the room plate is sized in percentages again, which are percentages of the heading and not of the room it must fit')
  assert.doesNotMatch(plate, /right:\s*-/,
    'the room plate is back to overflowing by a negative percentage of the heading width')
})

test('the map plate carries no hue', () => {
  /* quarter.svg is generated by tools/city.mjs and was the last
     coloured thing on the site: a mauve ground, a rose pen and a
     blue river under a page that had gone entirely to ink. Each
     value is now its own former colour's luminance, so the drawing
     kept every relationship it was composed with. A hue here means
     somebody regenerated the plate from a generator that still
     carries the old palette. */
  const svg = readFileSync(join(ROOT, 'public', 'assets', 'quarter.svg'), 'utf8')
  for (const hex of new Set(svg.match(/#[0-9a-fA-F]{6}/g) || [])) {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
    assert.equal(Math.max(r, g, b) - Math.min(r, g, b), 0,
      `the map plate is drawing in ${hex}, which is not a grey`)
  }
})
