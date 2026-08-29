/* ============================================================
   test/shelf.test.mjs — the shelf's own behaviour

   grid.js ships to a browser and has never been exercised as code:
   every existing guard on it reads its SOURCE. That is why the shop
   filter could be dead for the whole life of the site without
   anything noticing. A source guard can tell you a line is present;
   only running the thing tells you it works.

   No DOM here and none needed. The parts worth testing are pure:
   pool(), counts() and facetOptions() take arrays and return arrays,
   and mount() is the only piece that touches a document.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = readFileSync(join(ROOT, 'public', 'js', 'grid.js'), 'utf8')

/* grid.js is an IIFE taking `global`. Hand it a bare object and it
   hangs GDGrid off that, which is the whole API.

   new Function rather than node:vm ON PURPOSE. A vm context is a
   separate realm, so arrays it builds have a different Array
   prototype and every deepEqual against a literal here fails with
   "same structure but not reference-equal" -- a confusing failure
   that says nothing about the code under test. Same realm, same
   prototypes, honest assertions. */
function loadGrid() {
  const g = {}
  new Function('window', SRC)(g)
  return g.GDGrid
}

/* Rows shaped exactly as api/products.js emits them: the store key is
   `k`, and there is no `shop` field. That detail IS the bug below. */
const ITEMS = [
  { k: 'bbkeyboard', room: 'battlestation', title: 'Mechanical Keyboard, Hot-Swap 75%', price: '99' },
  { k: 'bbkeyboard', room: 'battlestation', title: 'Keycap Set, Cherry Profile', price: '48' },
  { k: 'gearotaku', room: 'vault', title: 'Resin Figure, Limited Run', price: '120' },
  { k: 'powoxi', room: 'power', title: 'Solar Charge Controller 12V', price: '30' },
]

test('the shop facet exists, which it did not for the life of the shelf', () => {
  const G = loadGrid()
  const shops = G.facetOptions(ITEMS, {}, 'shop')
  assert.deepEqual(shops.map(o => o.value), ['bbkeyboard', 'gearotaku', 'powoxi'])
  assert.equal(shops[0].count, 2)

  /* The exact defect, stated as an assertion: the filter read `k` and
     the counter read `shop`, so this came back empty, chipRow saw
     fewer than two options and rendered nothing at all. */
  assert.ok(shops.length > 1,
    'the shop row needs two or more options or chipRow drops it silently')
})

test('facet counts are against the pool with the other facet applied, not itself', () => {
  const G = loadGrid()
  /* With a room chosen, the shop counts must describe THAT room. */
  const shops = G.facetOptions(ITEMS, { room: 'battlestation' }, 'shop')
  assert.deepEqual(shops.map(o => o.value), ['bbkeyboard'])
  /* And the room counts must still offer every room, or choosing one
     room would remove your way back to the others. */
  const rooms = G.facetOptions(ITEMS, { room: 'battlestation' }, 'room')
  assert.deepEqual(rooms.map(o => o.value).sort(), ['battlestation', 'power', 'vault'])
})

test('search is tokenised AND, so word order and punctuation do not matter', () => {
  const G = loadGrid()
  const hit = (q) => G.pool(ITEMS, { q }, null).map(i => i.title)

  /* The case that a plain indexOf on the raw query gets wrong: the
     words are separated by a hyphen in the data and a space in the
     query. */
  assert.deepEqual(hit('hot swap'), ['Mechanical Keyboard, Hot-Swap 75%'])
  /* Order must not matter. */
  assert.deepEqual(hit('swap hot'), ['Mechanical Keyboard, Hot-Swap 75%'])
  /* Every word has to appear: this is AND, not OR. An OR here turns
     any two-word search into most of the catalogue. */
  assert.deepEqual(hit('keyboard resin'), [])
  /* The shop name is searchable; the room deliberately is not, or
     typing a room name returns a thousand things. */
  assert.equal(hit('powoxi').length, 1)
  assert.equal(hit('battlestation').length, 0)
})

test('search narrows the facet counts, so a chip never promises more than it has', () => {
  const G = loadGrid()
  const shops = G.facetOptions(ITEMS, { q: 'keycap' }, 'shop')
  assert.deepEqual(shops.map(o => o.value), ['bbkeyboard'])
  assert.equal(shops[0].count, 1,
    'the count must describe the searched pool, not the whole catalogue')
})

test('a shop name matches everything that shop sells, and that is on purpose', () => {
  const G = loadGrid()
  /* Searching "keyboard" returns BOTH bbkeyboard products, including
     the keycaps whose title never says keyboard, because the shop
     name is part of the haystack. That looks like a false positive
     and is the opposite: somebody typing a maker's name wants that
     maker's shelf, and this is the cheapest way to give it to them
     without a second control.

     Written down because it is exactly the behaviour a future reader
     would "fix". If it ever has to go, the room facet is not the
     replacement -- rooms are deliberately NOT searchable, or typing
     one returns a thousand things. */
  const both = G.pool(ITEMS, { q: 'keyboard' }, null)
  assert.equal(both.length, 2)
  assert.ok(both.every(i => i.k === 'bbkeyboard'))
})

test('the satchel key is the shop and the url, never a hash of them', () => {
  /* A 32-bit hash over a few hundred saves is a small collision
     chance whose failure is somebody else's product appearing in your
     satchel, or your save landing on the wrong card. Rows carry no id
     of their own, so the honest key is the pair, stored whole. */
  assert.match(SRC, /function saveKeyOf\(it\)\s*\{\s*return \(it\.k[^}]*it\.url/,
    'saveKeyOf must build its key from k and url directly')
  assert.ok(!/saveKeyOf[\s\S]{0,300}(hash|charCodeAt|imul)/.test(SRC),
    'saveKeyOf must not hash: a collision puts the wrong product in somebody’s satchel')
})

test('the shelf writes its state to the URL, and reads all of it back', () => {
  /* A filtered shelf is a place, so it has to survive being sent to
     somebody. Every key that can be set has to be read, or a link
     arrives with a filter the page then ignores. */
  for (const key of ['q', 'shop', 'saved', 'sort']) {
    assert.ok(SRC.includes("p.get('" + key + "')"), 'readURL never reads ' + key)
    assert.ok(SRC.includes("p.set('" + key + "'"), 'writeURL never writes ' + key)
  }
  /* replaceState, not pushState: search runs per keystroke and
     pushing there buries the previous page under forty entries. */
  assert.ok(SRC.includes('history.replaceState'), 'the URL must be replaced, not pushed')
  assert.ok(!/history\.pushState/.test(SRC),
    'pushState on a per-keystroke search breaks the back button worse than not writing at all')
})
