/* ============================================================
   test/canopy.test.mjs — the hero has a weight budget

   The blossom density has been raised twice on the owner's asking,
   and each raise is a real improvement that also costs bytes. These
   three plates ARE the hero: they are background-images on
   .cf/.cm/.cn in city.css, so nothing defers them and they are what
   a visitor waits for on a cold load. The first raise took them from
   101KB to 554KB gzipped, and they only came back down because the
   <defs>/<use> shape library and the radius ladder were reworked in
   the same pass.

   The budget below is not a target, it is a tripwire. A further
   raise that lands over it should arrive with a paint pass
   (tools/city.mjs already emits the webp plate overrides that
   city.css picks up) rather than simply being allowed through.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const PLATES = ['city-canopy-far.svg', 'city-canopy-mid.svg', 'city-canopy-near.svg']

/* The portrait frame is a hero plate too, and it is the one served to
   the connection least able to afford it. It replaces all three above
   under 720px rather than adding to them, so it gets its own smaller
   budget rather than a share of theirs. */
const TALL = 'city-canopy-tall.svg'
const TALL_BUDGET = 170 * 1024
const BUDGET = 520 * 1024

test('the three canopy plates fit the hero weight budget, gzipped', () => {
  const each = PLATES.map(f => ({
    f, gz: gzipSync(readFileSync(join(ROOT, 'public', 'assets', f))).length
  }))
  const total = each.reduce((n, x) => n + x.gz, 0)
  const report = each.map(x => `${x.f} ${(x.gz / 1024).toFixed(0)}KB`).join(', ')
  assert.ok(total <= BUDGET,
    `canopy is ${(total / 1024).toFixed(0)}KB gzipped, over the ` +
    `${(BUDGET / 1024).toFixed(0)}KB budget (${report}). Raise density ` +
    `with a paint pass, or raise this line on purpose.`)
})

test('every plate is still one shape library, not inlined path data', () => {
  /* Each blossom is a <use> of a radius from <defs>. Inlining the
     path data instead is ~300 bytes a flower against ~36, which is
     the difference between the budget above and 900KB. */
  for (const f of PLATES) {
    const svg = readFileSync(join(ROOT, 'public', 'assets', f), 'utf8')
    assert.match(svg, /<defs>/, `${f} lost its shape library`)
    const uses = (svg.match(/<use\b/g) || []).length
    assert.ok(uses > 1000, `${f} has only ${uses} <use>: the library is not being used`)
  }
})

test('the portrait frame fits its own budget, gzipped', () => {
  const gz = gzipSync(readFileSync(join(ROOT, 'public', 'assets', TALL))).length
  assert.ok(gz <= TALL_BUDGET,
    `${TALL} is ${(gz / 1024).toFixed(0)}KB gzipped, over the ` +
    `${(TALL_BUDGET / 1024).toFixed(0)}KB phone budget. This is the plate a ` +
    `phone downloads instead of the other three; it must stay smaller than any ` +
    `one of them, not just smaller than all three.`)
})
