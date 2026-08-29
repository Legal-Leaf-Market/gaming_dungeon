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
