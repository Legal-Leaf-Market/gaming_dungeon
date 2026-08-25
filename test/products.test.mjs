/* Tests for the scraper's row shaping.
   ------------------------------------------------------------
   These exist because the de-nicotining removed real behaviour and
   fixed one silent bug, and both are the kind of thing that gets
   quietly reintroduced by somebody copying from a sister site. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classify } from '../api/_scene.js'

const raw = readFileSync(new URL('../api/products.js', import.meta.url), 'utf8')

/* ASSERT ON CODE, NOT PROSE. The first cut of these tests failed
   three times over on the file's own tombstone comments, which name
   every removed function in order to explain why it was removed.
   A guard that cannot tell "isApparel is back" from "here is why
   isApparel is gone" is a guard that punishes documentation, and the
   documentation is the more valuable half. Comments are stripped. */
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

/* row() is module-private and the file is a Vercel handler, so these
   assert on the source. Crude, but it is the behaviour that matters
   and it names the exact regression. */

test('the nicotine classifiers are gone', () => {
  for (const dead of [
    'guessStrength', 'guessPuffs', 'isTobaccoSnus',
    'SNUS_BRANDS', 'SNUS_WORDS', 'subclassify',
  ]) {
    /* Allowed in prose; a call or a definition is the regression. */
    assert.equal(new RegExp('(function|const|let)\\s+' + dead + '\\b').test(src), false,
      dead + ' is defined again')
    assert.equal(new RegExp('\\b' + dead + '\\s*\\(').test(src), false,
      dead + ' is called again')
  }
})

test('rows no longer carry nicotine fields', () => {
  for (const f of ['strength:', 'puffs:', 'tobacco:', 'nic0:', 'sub:']) {
    assert.equal(src.includes('    ' + f), false, 'row() still emits ' + f)
  }
})

test('isApparel is not reintroduced', () => {
  /* THE ONE MOST LIKELY TO COME BACK. It reads as obviously sensible
     hygiene, and on this site it would delete the Wardrobe room and
     half the Vault: five registered merchants sell nothing but
     apparel, and the Vault stocks keychains, pins and stickers.
     A genuine merch problem gets a per-merchant exclude written from
     that merchant's capture, never a global regex. */
  assert.equal(/function\s+isApparel\b/.test(src), false, 'isApparel is back')
  assert.equal(/\bisApparel\s*\(/.test(src), false, 'isApparel is being called')
})

test('row() drops a product the classifier refuses', () => {
  /* The bug this replaced: `const room = o.room || classify(...)`
     took '' and shipped the row anyway, so the refusal was computed
     and thrown away. A blank room renders and appears under no facet
     — wrong in the way nobody reports. */
  assert.ok(/if \(!room\) return null/.test(src),
    "row() must drop a product whose room is '' ")
})

test('one word for one thing: no `dept` survives', () => {
  assert.equal(/\bdept\b/.test(src), false,
    'products.js, _stores.js and _scene.js must all say `room`')
})

test('the classifier still refuses the things row() now drops', () => {
  /* Ties the two halves together: the source check above proves row()
     honours '', and this proves '' is what these actually produce. */
  const st = { key: 'x', room: 'play' }
  for (const junk of ['Gift Card', 'Route Package Protection', 'Stainless Steel Air Fryer 5L']) {
    assert.equal(classify(st, junk), '', junk + ' should be refused')
  }
})

test('apparel and collectibles are NOT refused', () => {
  /* The other side of the isApparel removal, asserted on the real
     classifier rather than on the absence of a regex. */
  const wardrobe = { key: 'gamingtees', room: 'wardrobe' }
  const vault = { key: 'mazzcomics', room: 'vault' }
  for (const good of ['Retro Gaming T-Shirt', 'Pixel Art Hoodie', 'Kawaii Pastel Skirt']) {
    assert.equal(classify(wardrobe, good), 'wardrobe', good + ' must survive')
  }
  for (const good of ['Enamel Pin Set', 'Vinyl Sticker Pack', 'Acrylic Keychain']) {
    assert.notEqual(classify(vault, good), '', good + ' must survive')
  }
})
