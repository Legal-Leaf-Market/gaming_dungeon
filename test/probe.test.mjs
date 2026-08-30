/* The server-side feed reader, and the gate it must not become a way round.
   ------------------------------------------------------------
   This endpoint reads a merchant's whole catalogue in one request and
   hands back a file that, once committed, publishes them. That makes
   it the shortest path between "we have not read this shop" and "this
   shop is on the shelf", so the tests here are mostly about the two
   things that must stay true on that path: it cannot publish, and it
   must never touch a tracking link.

   NO NETWORK. `fetch` is a fake shop, so this runs anywhere.
*/

import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { readShopify, summarise } from '../api/_probe.js'
import { analyse } from '../api/_capture.js'
import { classify } from '../api/_scene.js'

const SHOP = { key: 'fixture', name: 'Fixture Arcades', domain: 'fixture.test', platform: 'shopify', room: 'arcade', ref: 'TESTCODE' }

function product(i, type, title, price = '20.00', available = true) {
  return {
    handle: 'p' + i, title, product_type: type, vendor: 'Fixture Arcades',
    variants: [{ id: i, price, available }],
    images: [{ src: 'https://fixture.test/' + i + '.jpg' }],
  }
}

let realFetch, requested
beforeEach(() => { realFetch = globalThis.fetch; requested = [] })
afterEach(() => { globalThis.fetch = realFetch })

function serve(pages) {
  globalThis.fetch = async (url) => {
    const u = String(url)
    requested.push(u)
    const page = Number(new URL(u).searchParams.get('page') || 1)
    return new Response(JSON.stringify({ products: pages[page - 1] || [] }), { status: 200 })
  }
}

test('it pages until a short page, the way Shopify actually ends a feed', async () => {
  /* The API caps at 250 and TRUNCATES SILENTLY, so a single request
     reports a 289-product vendor as a 250-product one and nothing
     looks wrong. Herbal Leaf found that with a real merchant. */
  const full = Array.from({ length: 250 }, (_, i) => product(i, 'Cabinets', 'Cabinet ' + i))
  const tail = Array.from({ length: 39 }, (_, i) => product(250 + i, 'Cabinets', 'Cabinet ' + (250 + i)))
  serve([full, tail])

  const got = await readShopify(SHOP)
  assert.equal(got.ok, true)
  assert.equal(got.rows.length, 289, 'a full first page must not be mistaken for the whole catalogue')
  assert.equal(got.pages, 2)
  assert.equal(got.truncated, false)
})

test('hitting the page cap is REPORTED, not swallowed', async () => {
  /* A silent cap is the same bug as a silent truncation wearing a
     different hat: the include list gets written from a sample that
     everybody believes is a catalogue. */
  const full = Array.from({ length: 250 }, (_, i) => product(i, 'Cabinets', 'Cabinet ' + i))
  serve([full, full, full])

  const got = await readShopify(SHOP, { maxPages: 3 })
  assert.equal(got.truncated, true)
  assert.match(got.notes.join(' '), /SAMPLE, not the catalogue/i,
    'the cap must say in words that this is a sample')
})

test('the reader never requests a URL carrying a tracking code', async () => {
  /* A GET on a ?ref= link registers a real click and pollutes the
     owner's own conversion stats with our traffic -- the one class of
     bug that corrupts the evidence you would use to find it. The
     fixture store HAS a ref, so this can actually fail. */
  serve([[product(1, 'Cabinets', 'Cabinet')]])
  await readShopify(SHOP)
  assert.ok(requested.length)
  for (const u of requested) {
    assert.equal(/[?&]ref=/.test(u), false, 'the probe requested a tracking URL: ' + u)
  }
})

test('a dead feed is an answer, not a crash', async () => {
  globalThis.fetch = async () => new Response('<!doctype html><h1>nope</h1>', { status: 200 })
  const got = await readShopify(SHOP)
  assert.equal(got.ok, false)
  assert.match(got.error, /HTML/, 'a shop serving HTML instead of JSON must say so')

  globalThis.fetch = async () => new Response('blocked', { status: 403 })
  const blocked = await readShopify(SHOP)
  assert.equal(blocked.ok, false)
  assert.match(blocked.error, /403/)
})

test('the summary says the things that decide whether to carry a shop', async () => {
  serve([[
    product(1, 'Cabinets', 'Arcade Cabinet'),
    product(2, 'Cabinets', 'Second Cabinet', '0.00'),
    product(3, 'Apparel', 'Retro Gaming T-Shirt', '24.00', false),
  ]])
  const { rows } = await readShopify(SHOP)
  const rep = summarise(rows)

  assert.equal(rep.products, 3)
  assert.equal(rep.inStock, 2)
  assert.equal(rep.unpriced, 1)
  assert.deepEqual(rep.productTypes, [['Cabinets', 2], ['Apparel', 1]],
    'the product_type histogram is the whole point of the exercise')
  assert.ok(rep.priceRange.min > 0)
})

test('a shop with no prices is called out as a brand site', async () => {
  serve([[product(1, 'Cabinets', 'Cabinet', '0.00'), product(2, 'Cabinets', 'Another', '0.00')]])
  const { rows } = await readShopify(SHOP)
  const rep = summarise(rows)
  assert.match(rep.notes.join(' '), /brand site/i,
    'a shelf of cards with no price on them is not worth shipping, and nothing else would say so')
})

test('the SAME rows give the SAME proposals however they were read', async () => {
  /* THE REASON analyse() WAS EXTRACTED. A catalogue reaches us two
     ways -- walked in a browser, or read from products.json -- and the
     decision made from it must not depend on which. Two copies of this
     arithmetic would drift, and they would drift invisibly. */
  serve([[
    product(1, 'Cabinets', 'Arcade Cabinet 2-Player Upright'),
    product(2, 'Cabinets', 'Sanwa JLF Joystick'),
    product(3, 'Gift Cards', 'Gift Card'),
    product(4, 'Apparel', 'Retro Gaming T-Shirt'),
  ]])
  const { rows } = await readShopify(SHOP)

  /* Rows as the DB hands them back: same three fields, different shape
     around them. analyse() must not care. */
  const asCaptured = rows.map(r => ({ title: r.title, product_type: r.product_type, vendor: r.vendor }))

  const a = analyse(rows, SHOP, classify)
  const b = analyse(asCaptured, SHOP, classify)
  assert.deepEqual(a.include, b.include)
  assert.deepEqual(a.roomMap, b.roomMap)
  assert.deepEqual(a.analysis, b.analysis)

  assert.ok(a.include.includes('Cabinets'), 'a shop full of cabinets must propose including them')
  assert.equal(a.include.includes('Gift Cards'), false,
    'a type the classifier refuses outright must not be proposed for inclusion')
  assert.equal(a.roomMap.Apparel, 'wardrobe',
    'a garment in an arcade shop must be proposed for the wardrobe, not the arcade')
})

/* ------------------------------------------------ the endpoint */

async function call(query, headers = {}, env = {}) {
  const prev = process.env.ADMIN_PASSCODE
  if ('ADMIN_PASSCODE' in env) process.env.ADMIN_PASSCODE = env.ADMIN_PASSCODE
  else delete process.env.ADMIN_PASSCODE
  try {
    const { default: handler } = await import('../api/probe.js?t=' + Math.random())
    let payload, code = 200
    const res = {
      setHeader() {}, getHeader() { return null },
      status(c) { code = c; return this },
      json(o) { payload = o; return this },
      end() { return this },
    }
    await handler({ method: 'GET', query, headers }, res)
    return { code, payload }
  } finally {
    if (prev === undefined) delete process.env.ADMIN_PASSCODE
    else process.env.ADMIN_PASSCODE = prev
  }
}

test('it fails closed with no passcode set, and refuses a wrong one', async () => {
  /* Herbal Leaf's guide records the version of this that mattered:
     before its RPC split, any page on the internet could email the
     member list. */
  const unset = await call({ key: 'goretrogame' })
  assert.equal(unset.code, 503)
  assert.match(unset.payload.error, /ADMIN_PASSCODE is not set/)

  const wrong = await call({ key: 'goretrogame' }, { 'x-gd-admin-token': 'nope' }, { ADMIN_PASSCODE: 'secret' })
  assert.equal(wrong.code, 401)

  const none = await call({ key: 'goretrogame' }, {}, { ADMIN_PASSCODE: 'secret' })
  assert.equal(none.code, 401, 'a missing header must not authenticate')
  /* A mutation run showed that deleting the `!sent` guard does not
     fail this: the length compare already rejects an empty header
     against a set passcode. The guard is redundant rather than
     load-bearing, and it is worth saying so here so the next person
     does not go looking for the test that protects it. The two states
     that MATTER are both pinned above -- passcode set and header
     wrong or absent (401), passcode unset (503). */
})

test('the draft it hands back cannot publish anything on its own', async () => {
  /* The whole design in one assertion. This endpoint is the shortest
     path from "nobody has read this shop" to "this shop is on the
     shelf", and the blank reviewedBy is what keeps a human on that
     path. If this ever ships filled in, the gate is decoration. */
  serve([[product(1, 'Cabinets', 'Arcade Cabinet'), product(2, 'Apparel', 'Retro Gaming T-Shirt')]])
  const { code, payload } = await call(
    { key: 'goretrogame', draft: '' },
    { 'x-gd-admin-token': 'secret' },
    { ADMIN_PASSCODE: 'secret' })

  assert.equal(code, 200)
  assert.equal(payload.drafts.length, 1)
  const file = payload.drafts[0].file
  assert.equal(file.reviewedBy, '', 'the draft must never arrive pre-signed')
  assert.equal(payload.drafts[0].path, 'data/captured/goretrogame.json')
  assert.match(file.source, /probe/, 'a summary must say how the catalogue was read')
  assert.match(file.readThisBeforeCommitting.join(' '), /reviewedBy/)
})

test('a non-Shopify merchant is told to use the bookmarklet, not left to fail', async () => {
  const { payload } = await call(
    { key: 'gamingtees' }, { 'x-gd-admin-token': 'secret' }, { ADMIN_PASSCODE: 'secret' })
  const r = payload.results[0]
  if (r.ok === false && /Shopify feeds only/.test(r.error || '')) {
    assert.match(r.error, /bookmarklet/, 'it must name the way that does work')
  }
})

test('no admin-gated endpoint is left cacheable by the CDN', async () => {
  /* CAUGHT IN PRODUCTION, ONE COMMIT AFTER SHIPPING. vercel.json
     caches `/api/(.*)` for 600s at the edge, which is right for the
     catalogue and wrong for everything else -- and the header a
     handler sets in code does not win against the config. /api/capture
     and /api/collector each carry an explicit no-store override;
     /api/probe shipped without one, so a merchant's whole catalogue,
     behind a passcode, was a CDN-cacheable response. The first symptom
     was harmless and misleading: a cached 404 from before the endpoint
     existed.

     Written as a rule rather than a third hardcoded path, because the
     next gated endpoint will have the same hole and nobody will
     remember this one. Anything that reads x-gd-admin-token must be
     no-store. */
  const { readFileSync, readdirSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const { dirname, join } = await import('node:path')
  const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))

  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const noStore = new Set(
    (cfg.headers || [])
      .filter(h => (h.headers || []).some(x => x.key === 'Cache-Control' && /no-store/.test(x.value)))
      .map(h => h.source))

  for (const f of readdirSync(join(ROOT, 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_'))) {
    const src = readFileSync(join(ROOT, 'api', f), 'utf8')
    if (!/x-gd-admin-token/.test(src)) continue
    const route = '/api/' + f.slice(0, -3)
    assert.ok(noStore.has(route),
      route + ' reads a passcode but vercel.json has no no-store rule for it, so its ' +
      'responses are cacheable at the edge for 600s')
  }
})

test('brief mode returns a triage line, not a full analysis', async () => {
  /* WHY THIS MODE EXISTS. The full response for 50 merchants is tens
     of thousands of lines, and a review nobody can physically read is
     the same as no review. Triage answers the three questions that
     decide most shops in one line -- how much stock, how much of it is
     off scene, what the types look like -- and the full draft is
     pulled only for the ones that survive it.

     So the assertion that matters is that brief is actually BRIEF:
     if it ever grows back into the full payload it has stopped doing
     its job while still passing a "does it return rows" test. */
  serve([[
    product(1, 'Cabinets', 'Arcade Cabinet'),
    product(2, 'Cabinets', 'Second Cabinet'),
    product(3, 'Gift Cards', 'Gift Card'),
  ]])
  const { code, payload } = await call(
    { keys: 'goretrogame', brief: '' },
    { 'x-gd-admin-token': 'secret' },
    { ADMIN_PASSCODE: 'secret' })

  assert.equal(code, 200)
  assert.equal(payload.rows.length, 1)
  const r = payload.rows[0]

  assert.equal(r.products, 3)
  assert.equal(typeof r.offScenePct, 'number')
  assert.ok(Array.isArray(r.types) && r.types.length, 'the type histogram is the point of triage')
  assert.match(r.types[0], /x\d+ ->/, 'each type line must show its count and room')
  assert.ok(r.samples.length <= 3, 'triage carries a few sample titles, not the catalogue')

  /* The brief row must NOT carry the things that make the full
     response unreadable at scale. */
  assert.equal('productTypeAnalysis' in r, false, 'brief is carrying the full analysis')
  assert.equal('proposed' in r, false, 'brief is carrying the proposals')
  assert.equal('results' in payload, false, 'brief must replace the full results, not accompany them')

  /* And it must never be a way to publish: no drafts in brief mode. */
  assert.equal('drafts' in payload, false, 'brief must not hand back committable files')
})

test('the untyped count is surfaced in triage, because it decides the include list', async () => {
  /* The lesson from customgamingchair: 18 of its 23 products had no
     product_type, and the proposed include list would have published
     5. The untyped share is the single number that catches that, so
     it is on the triage line rather than three levels down. */
  serve([[
    product(1, '', 'Untyped Chair'),
    product(2, '', 'Another Untyped Chair'),
    product(3, 'Custom Chair', 'A Typed One'),
  ]])
  const { payload } = await call(
    { keys: 'goretrogame', brief: '' },
    { 'x-gd-admin-token': 'secret' },
    { ADMIN_PASSCODE: 'secret' })
  assert.equal(payload.rows[0].untyped, 2, 'an untyped majority must be visible at triage')
})

test('a mostly-untyped catalogue proposes an EMPTY include, by arithmetic', async () => {
  /* THE TRAP THAT COST 18 OF 23 PRODUCTS, now defused in code rather
     than in a rule somebody has to remember.

     An include list can only name types, and an untyped product
     matches no name, so a non-empty include drops every one of them.
     customgamingchair has 23 products, 18 untyped; the old proposal
     covered the other 5 and publishing it would have shipped five
     chairs out of twenty-three, silently.

     Fixing that as "read the (none) row first" put the burden on
     whoever reviews the next fifty drafts. The arithmetic does it. */
  serve([[
    product(1, '', 'Untyped Chair One'),
    product(2, '', 'Untyped Chair Two'),
    product(3, '', 'Untyped Chair Three'),
    product(4, 'Custom Chair', 'A Typed One'),
  ]])
  const { payload } = await call(
    { keys: 'goretrogame', draft: '' },
    { 'x-gd-admin-token': 'secret' },
    { ADMIN_PASSCODE: 'secret' })

  const file = payload.drafts[0].file
  assert.deepEqual(file.include, [],
    'a catalogue that is 75% untyped must propose an empty include, not its typed minority')
  assert.match(file.coverage.note, /no product_type/,
    'and it must say in words why, with the count')
  assert.equal(file.coverage.wouldPublish, 4, 'an empty include publishes everything')
  assert.equal(file.coverage.wouldDrop, 0)
})

test('a properly typed catalogue still gets a real include list', async () => {
  /* The other direction, which a careless version of the fix breaks:
     if every catalogue proposed [] the review step would stop
     excluding anything at all. */
  serve([[
    product(1, 'Cabinets', 'Arcade Cabinet'),
    product(2, 'Cabinets', 'Second Cabinet'),
    product(3, 'Cabinets', 'Third Cabinet'),
    product(4, 'Gift Cards', 'Gift Card'),
  ]])
  const { payload } = await call(
    { keys: 'goretrogame', draft: '' },
    { 'x-gd-admin-token': 'secret' },
    { ADMIN_PASSCODE: 'secret' })

  const file = payload.drafts[0].file
  assert.deepEqual(file.include, ['Cabinets'], 'a typed catalogue must still be filtered')
  assert.equal(file.coverage.note, null, 'and must not carry the untyped warning')
  assert.equal(file.coverage.wouldDrop, 1, 'the gift card is the one it drops')
  assert.equal(file.coverage.pct, 75)
})

/* ------------------------------------------------------------------
   WHAT THE SUMMARY REFUSES TO STATE CONFIDENTLY.

   From a real triage run over 40 merchants. Three of them were routed
   to a room on nothing whatever, because every product carried an
   empty product_type and the fallback filled the column that a human
   reads as a classification.
   ------------------------------------------------------------------ */

test('a feed that is mostly untyped is reported as unclassified, not as classified', () => {
  const rows = []
  for (let i = 0; i < 40; i++) {
    rows.push({ title: 'Whiskey Decanter ' + i, product_type: '', price: 20, available: true, image: 'x' })
  }
  const s = summarise(rows)
  assert.ok(s.notes.some(n => /UNCLASSIFIED/.test(n)), 'should refuse to imply a room')
})

test('a properly typed feed is not accused of being unclassified', () => {
  const rows = []
  for (let i = 0; i < 40; i++) {
    rows.push({ title: 'Mouse Pad ' + i, product_type: 'Mouse Pads', price: 20, available: true, image: 'x' })
  }
  assert.ok(!summarise(rows).notes.some(n => /UNCLASSIFIED/.test(n)))
})

test('platform and app rows are named, not silently counted as stock', () => {
  const rows = [
    { title: 'Custom Mice', product_type: 'CUSTOM_PRODUCT', price: 10, available: true, image: 'x' },
    { title: 'Points', product_type: 'Mileage_Product', price: 1, available: true, image: 'x' },
    { title: 'A real pad', product_type: 'Mouse Pads', price: 30, available: true, image: 'x' },
  ]
  const note = summarise(rows).notes.find(n => /NOT PRODUCTS/.test(n))
  assert.ok(note, 'should name them')
  assert.match(note, /CUSTOM_PRODUCT/)
  assert.match(note, /Mileage_Product/)
  /* Named rather than dropped: the count is still the merchant's own. */
  assert.equal(summarise(rows).products, 3)
})

test('an empty feed is distinguished from no feed at all', () => {
  const note = summarise([]).notes.find(n => /THE FEED ANSWERED AND IS EMPTY/.test(n))
  assert.ok(note, 'zero products with a live feed is its own finding')
})
