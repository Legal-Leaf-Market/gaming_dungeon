/* THE MONEY PATH, END TO END, ON A FAKE SHOP.
   ------------------------------------------------------------
   Everything else in this suite reads source or calls one function.
   This drives the whole chain the way a real merchant would:

     reviewed summary  ->  publishable() lets the store through
     fake products.json ->  the Shopify strategy maps it
     include / roomMap ->  the human's decisions are applied
     _scene.js         ->  what is left gets a room, or is refused
     buildAff()        ->  the surviving URLs carry the tracking code
     respond()         ->  the payload the grid actually receives

   That chain had four bugs in it that no unit test caught, because
   every one of them was a mechanism that existed and was not called:
   buildAff was never invoked, include/roomMap were never read, row()
   ignored the classifier's refusal, and the dev server never served
   the endpoints. A test that runs the whole thing is the only kind
   that would have found them.

   NO NETWORK AND NO DATABASE. `fetch` is replaced with a fake shop
   and `_stores.js` with a one-merchant registry, so this runs
   anywhere and cannot be flaky. Mocking the registry rather than
   adding a test hook to it is deliberate: production code carrying
   scaffolding for its own tests is the thing this repo keeps
   deleting from other people's files.

   Needs --experimental-test-module-mocks; `npm test` passes it. If a
   future Node drops the flag this fails loudly with "bad option",
   which is the right way for it to break.
*/

import { test, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STORES_URL = new URL('../api/_stores.js', import.meta.url).href

/* ---------------------------------------------------------- the shop
   A deliberately mixed catalogue. Every row is here to prove one
   specific decision, and the comments say which. */
const PRODUCTS = [
  {
    /* Plainly belongs. Included type, classifier agrees. */
    handle: 'arcade-cabinet', title: 'Arcade Cabinet 2-Player Upright',
    product_type: 'Cabinets', vendor: 'Fixture Arcades', tags: 'retro',
    variants: [{ id: 1, price: '1899.00', available: true }],
    images: [{ src: 'https://fixture.test/cab.jpg' }],
  },
  {
    /* THE ORDERING FIX AND roomMap AT ONCE. "Retro Gaming" would drag
       this into the arcade on text alone; it is a shirt, and the
       reviewed summary also maps its type to the wardrobe. */
    handle: 'retro-tee', title: 'Retro Gaming T-Shirt',
    product_type: 'Apparel', vendor: 'Fixture Arcades', tags: '',
    variants: [{ id: 2, price: '24.00', available: true }],
    images: [{ src: 'https://fixture.test/tee.jpg' }],
  },
  {
    /* A non-product. Renders as a card with a price on it if nothing
       stops it, and its type IS in the include list — so only the
       classifier's refusal can save the shelf here. */
    handle: 'gift-card', title: 'Gift Card',
    product_type: 'Cabinets', vendor: 'Fixture Arcades', tags: '',
    variants: [{ id: 3, price: '50.00', available: true }],
    images: [],
  },
  {
    /* Off-scene, riding in on an included type. The general
       dropshipper problem in one row. */
    handle: 'air-fryer', title: 'Stainless Steel Air Fryer 5L',
    product_type: 'Cabinets', vendor: 'Fixture Arcades', tags: '',
    variants: [{ id: 4, price: '89.00', available: true }],
    images: [],
  },
  {
    /* A perfectly good product whose TYPE the human excluded. The
       classifier would happily place it; include must win. */
    handle: 'dice-tower', title: 'Resin Dice Tower',
    product_type: 'Teaware', vendor: 'Fixture Arcades', tags: '',
    variants: [{ id: 5, price: '40.00', available: true }],
    images: [],
  },
  {
    /* roomMap WITH TEETH. On its own text this is a cable and the
       classifier files it under `power`, correctly in general. On
       THIS merchant every "Accessory" is a desk accessory, and the
       human said so in the summary. If roomMap is not applied this
       lands in `power` and the assertion below catches it.

       The first version of this test used the t-shirt for roomMap and
       proved nothing: the classifier already puts a shirt in the
       wardrobe, so the assertion passed with roomMap disabled. A
       mutation run caught it. An assertion that cannot fail is worse
       than no assertion, because it is counted. */
    handle: 'coiled-cable', title: 'Coiled USB-C Cable, Lavender',
    product_type: 'Accessories', vendor: 'Fixture Arcades', tags: '',
    variants: [{ id: 7, price: '35.00', available: true }],
    images: [],
  },
  {
    /* Out of stock. Must survive, flagged, rather than vanish. */
    handle: 'sanwa-stick', title: 'Sanwa JLF Joystick',
    product_type: 'Cabinets', vendor: 'Fixture Arcades', tags: '',
    variants: [{ id: 6, price: '32.00', available: false }],
    images: [],
  },
]

let tmp, cwd, requested

before(async () => {
  cwd = process.cwd()
  tmp = mkdtempSync(join(tmpdir(), 'gd-ingest-'))
  mkdirSync(join(tmp, 'data', 'captured'), { recursive: true })

  /* The human's decisions, as a committed summary would carry them. */
  writeFileSync(join(tmp, 'data', 'captured', 'fixture.json'), JSON.stringify({
    key: 'fixture',
    reviewedBy: 'the ingest test',
    include: ['Cabinets', 'Apparel', 'Accessories'],
    roomMap: { Apparel: 'wardrobe', Accessories: 'battlestation' },
  }))
  process.chdir(tmp)

  mock.module(STORES_URL, {
    namedExports: {
      STORES: [{
        key: 'fixture', name: 'Fixture Arcades', room: 'arcade',
        domain: 'fixture.test', platform: 'shopify',
        ref: 'TESTCODE', rate: '10%', cookie: 30, tier: 1,
        pending: false,
      }, {
        /* SIGNED AND NOT YET READ. Contributes no products and no
           public store row, so every count in this file is unchanged
           by it; it exists so the `waiting` map has something to
           count. */
        key: 'fixture-waiting', name: 'Fixture Pending', room: 'wardrobe',
        domain: 'pending.test', platform: 'shopify',
        ref: '', rate: '10%', cookie: 30, tier: 1,
        pending: true,
      }],
      PROSPECTS: [], REJECTED: [], ROOM_ORDER: ['arcade', 'wardrobe'],
      /* products.js imports this for the AWIN link shape. A mocked
         module has to carry every named export the code under test
         imports, or the import itself throws before a single
         assertion runs -- which is exactly what adding the AWIN
         branch did to all seven tests in this file. */
      AWIN_PUBLISHER: '3064967',
      isAttributed: st => !!(st && st.ref),
      byKey: k => (k === 'fixture' ? { key: 'fixture', name: 'Fixture Arcades', room: 'arcade' } : null),
      byWindow: l => l,
    },
  })

  requested = []
  globalThis.fetch = async (url) => {
    const u = String(url)
    requested.push(u)
    if (u.includes('/meta.json')) {
      return new Response(JSON.stringify({ currency: 'USD' }), { status: 200 })
    }
    if (u.includes('/products.json')) {
      /* Page 2 empty, so the pager stops the way a real shop's would. */
      const page = Number(new URL(u).searchParams.get('page') || 1)
      return new Response(JSON.stringify({ products: page === 1 ? PRODUCTS : [] }), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  }
})

after(() => {
  process.chdir(cwd)
  rmSync(tmp, { recursive: true, force: true })
  mock.reset()
})

async function catalogue(query = {}) {
  const { default: handler } = await import('../api/products.js?ingest=' + Date.now())
  let payload
  const res = {
    statusCode: 200,
    setHeader() {}, getHeader() { return null },
    status(c) { this.statusCode = c; return this },
    json(o) { payload = o; return this },
    end() { return this },
  }
  await handler({ method: 'GET', query: { refresh: '1', ...query }, headers: {} }, res)
  return payload
}

test('the whole chain runs and only the right products survive', async () => {
  const out = await catalogue()
  assert.ok(out && out.ok, 'the handler did not produce a payload')

  const titles = out.items.map(i => i.title).sort()

  /* Three survive, and each of the three drops is a different rule. */
  assert.deepEqual(titles, [
    'Arcade Cabinet 2-Player Upright',
    'Coiled USB-C Cable, Lavender',
    'Retro Gaming T-Shirt',
    'Sanwa JLF Joystick',
  ])

  assert.equal(titles.includes('Gift Card'), false,
    'a non-product reached the shelf despite its type being included')
  assert.equal(titles.includes('Stainless Steel Air Fryer 5L'), false,
    'an off-scene product reached the shelf: row() is ignoring the classifier again')
  assert.equal(titles.includes('Resin Dice Tower'), false,
    'an excluded product_type reached the shelf: include is not being applied')
})

test('the reviewed summary decides the room, and the classifier decides the rest', async () => {
  const out = await catalogue()
  const by = Object.fromEntries(out.items.map(i => [i.title, i.room]))

  /* THE ONE THAT BITES. Left alone the classifier calls this cable
     `power`, and it is right to in general; this merchant's
     Accessories are all desk accessories and the human said so. */
  assert.equal(by['Coiled USB-C Cable, Lavender'], 'battlestation',
    'roomMap is not overriding the classifier')

  assert.equal(by['Retro Gaming T-Shirt'], 'wardrobe',
    'a garment must reach the wardrobe (roomMap agrees with the classifier here)')
  assert.equal(by['Arcade Cabinet 2-Player Upright'], 'arcade')
  assert.equal(by['Sanwa JLF Joystick'], 'arcade')
})

test('every surviving link carries the tracking code', async () => {
  /* The bug that would have cost real money: buildAff() existed and
     row() never called it, so every card linked bare and all 23 live
     codes paid nothing. Nothing about that errors. */
  const out = await catalogue()
  for (const it of out.items) {
    assert.match(it.url, /\?ref=TESTCODE$/, it.title + ' shipped without attribution')
  }
})

test('the scraper never fetches a URL carrying a tracking code', async () => {
  /* A GET on a ?ref= link registers a real click and pollutes the
     owner's own conversion stats with our traffic — the one class of
     bug that corrupts the evidence you would use to find it. */
  await catalogue()
  for (const u of requested) {
    assert.equal(/[?&]ref=/.test(u), false, 'the scraper requested a tracking URL: ' + u)
  }
})

test('out of stock is flagged, not hidden', async () => {
  const out = await catalogue()
  const oos = out.items.find(i => i.title === 'Sanwa JLF Joystick')
  assert.equal(oos.oos, 1, 'an out-of-stock product must be marked rather than dropped')
  const inStock = out.items.find(i => i.title === 'Arcade Cabinet 2-Player Upright')
  assert.equal(inStock.oos, undefined, 'in stock is the norm and carries no flag')
})

test('the payload carries what the grid needs and not what it should not', async () => {
  const out = await catalogue()

  assert.ok(out.byRoom.arcade >= 2, 'byRoom should count the shelf')
  assert.equal(out.stores.length, 1)

  /* publicStores() is an allow-list. A field added to a registry
     entry later must be invisible by default rather than leaked by
     default, and `ref` in particular is our paperwork. */
  const shop = out.stores[0]
  for (const secret of ['ref', 'rate', 'cookie', 'tier', 'note', 'amazon']) {
    assert.equal(secret in shop, false, 'publicStores leaked ' + secret)
  }
  assert.equal(shop.key, 'fixture')
  assert.equal(shop.room, 'arcade')
})

test('an unreviewed merchant publishes nothing, however live it looks', async () => {
  /* The gate, exercised through the real handler rather than by
     calling publishable() directly. Deleting the summary is the same
     thing as never having written one. */
  rmSync(join(tmp, 'data', 'captured', 'fixture.json'))
  try {
    const out = await catalogue()
    assert.equal(out.items.length, 0, 'a merchant with no reviewed capture reached the shelf')
    assert.equal(out.stores.length, 0, 'an unpublishable store appeared in stores[]')
  } finally {
    writeFileSync(join(tmp, 'data', 'captured', 'fixture.json'), JSON.stringify({
      key: 'fixture', reviewedBy: 'the ingest test',
      include: ['Cabinets', 'Apparel', 'Accessories'],
      roomMap: { Apparel: 'wardrobe', Accessories: 'battlestation' },
    }))
  }
})

test('an empty room says it is unread, not that it was rejected', async () => {
  /* THE EMPTY STATE WAS TELLING THE WRONG STORY, and it is the only
     thing most visitors will ever read. app.js has three cases: the
     API is down, nothing at all is publishable, and otherwise. A room
     with merchants signed but not yet captured fell into "otherwise",
     which says "nothing read so far belongs on these shelves" -- that
     we opened those shops and turned them down. Audio went from two
     merchants to twenty-five in one afternoon and said that sentence
     the whole time.

     So the payload carries a per-room count of what is registered and
     not yet publishable. A COUNT AND NOTHING ELSE: publicStores() is
     an allow-list because rates and tracking codes are our paperwork,
     and a number is not paperwork. */
  const out = await catalogue()
  assert.ok(out.waiting, 'the payload has no waiting map')
  assert.equal(out.waiting.wardrobe, 1,
    'a registered, pending store must be counted as waiting for its room')
  assert.equal(out.waiting.arcade, undefined,
    'a store that publishes must not also be counted as waiting')

  /* And the client has to actually read it. A payload nobody consumes
     is the failure this whole file was written about. */
  const app = readFileSync(new URL('../public/js/app.js', import.meta.url), 'utf8')
  assert.match(app, /state\.waiting\s*=\s*j\.waiting/,
    'app.js never takes `waiting` off the payload')
  /* Matched on the fragment either side of the singular/plural
     ternary rather than on a whole sentence, because the sentence is
     assembled at runtime and a whole-sentence regex would pass only
     until somebody fixed the pluralisation. */
  assert.match(app, /state\.waiting\[roomKey\]/,
    'the empty state never asks how many makers are waiting on this room')
  assert.match(app, /' signed for '/,
    'the empty state has no branch for a room whose makers are signed but unread')
})

test('a new payload field forces the cache key to be bumped', async () => {
  /* THE TEST ABOVE PASSED WHILE THE FEATURE DID NOTHING ON PRODUCTION,
     and that gap is what this one closes.

     `waiting` was added, deployed, and never once reached a browser.
     Every assertion above was true of the payload this harness builds,
     because this harness builds a FRESH one. Production did not: the
     shared cache in Neon holds the last good payload for six hours and
     serves it without inspecting it, so new code went on reading a
     payload that old code had written. `state.waiting` was `{}` on
     every page and the branch never ran. There is nothing to catch
     here at runtime, on either side: a missing field reads as an empty
     object and every fallback is polite by design.

     The rule that prevents it is that a SHAPE change bumps KV_KEY's
     version in the same commit. A rule nobody can forget is better, so:
     PAYLOAD_KEYS is declared one line above the version, this asserts
     it matches what the payload actually has, and adding a field is
     therefore a failing test until somebody edits the line next to the
     number they need to change. */
  const { PAYLOAD_KEYS } = await import('../api/products.js?shape=' + Date.now())
  const out = await catalogue()
  assert.deepEqual(
    Object.keys(out).sort(),
    [...PAYLOAD_KEYS].sort(),
    'the payload\'s top-level fields no longer match PAYLOAD_KEYS in api/products.js. ' +
    'If you added or renamed one, update that list AND bump the version in KV_KEY on ' +
    'the line below it, or a warm cache will serve the old shape for six hours after ' +
    'the deploy and the change will look like it did nothing.')

  const src = readFileSync(new URL('../api/products.js', import.meta.url), 'utf8')
  assert.match(src, /const KV_KEY = 'gd:catalogue:v(\d+)'/,
    'KV_KEY is no longer a versioned literal, so there is nothing to bump')
})
