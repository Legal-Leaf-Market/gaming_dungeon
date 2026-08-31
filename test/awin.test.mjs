/* THE AWIN LINK, END TO END, ON A FAKE SHOP.
   ------------------------------------------------------------
   Every other merchant in this registry is paid by appending
   `?ref=<code>` to the product URL. Big Wall Decor is the first that
   is paid by a REDIRECT: the destination is wrapped in an
   awin1.com/cread.php link carrying our publisher id and their
   advertiser id, and the shopper arrives via AWIN.

   This has its own file rather than another case in ingest.test.mjs
   because that harness asserts on exact store and product counts, and
   a second fixture merchant would have quietly changed six numbers in
   tests that are about something else.

   WHY IT IS WORTH A TEST AT ALL. Every failure mode in this shape is
   invisible from outside:

     a wrong or missing awinmid   the shopper still lands on the right
                                  page and the commission is zero
     a missing publisher id       same, and it is the only part that
                                  is per-SITE, so the obvious mistake
                                  is pasting a sister site's
     a double wrap                the link works, arrives, and credits
                                  the outer hop only
     the destination unescaped    cread.php reads the first & as the
                                  end of `ued` and the shopper lands
                                  on the shop's home page

   Nothing errors in any of those. The money simply does not arrive,
   and the evidence you would use to notice is the conversion report,
   which shows clicks either way.

   NO NETWORK AND NO DATABASE, same as the ingest harness: `fetch` is
   a fake shop and `_stores.js` is a one-merchant registry.
*/

import { test, before, after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const STORES_URL = new URL('../api/_stores.js', import.meta.url).href
const AFFID = '3064967'
const MID = '65850'

/* One product. Its URL is built by the Shopify strategy from the
   handle, so it carries no query of its own -- which is exactly why
   the escaping assertion below reads the RAW link text rather than
   parsing it. Through URLSearchParams an escaped `ued` and an
   unescaped one come back identical, and the first draft of this test
   passed with encodeURIComponent removed. */
const PRODUCTS = [{
  handle: 'oversize-canvas', title: 'Oversized Canvas Wall Art, Ridge Triptych',
  product_type: 'Wall Art', vendor: 'Fixture Walls', tags: '',
  variants: [{ id: 1, price: '555.00', available: true }],
  images: [{ src: 'https://fixture-walls.test/art.jpg' }],
}]

let tmp, cwd, requested

before(async () => {
  cwd = process.cwd()
  tmp = mkdtempSync(join(tmpdir(), 'gd-awin-'))
  mkdirSync(join(tmp, 'data', 'captured'), { recursive: true })
  writeFileSync(join(tmp, 'data', 'captured', 'walls.json'), JSON.stringify({
    key: 'walls', reviewedBy: 'the awin test', include: ['Wall Art'], roomMap: {},
  }))
  process.chdir(tmp)

  mock.module(STORES_URL, {
    namedExports: {
      STORES: [{
        key: 'walls', name: 'Fixture Walls', room: 'walls',
        domain: 'fixture-walls.test', platform: 'shopify',
        ref: '', network: 'awin', awinmid: MID,
        rate: '10%', cookie: 30, tier: 1, pending: false,
      }],
      AWIN_PUBLISHER: AFFID,
      PROSPECTS: [], REJECTED: [], ROOM_ORDER: ['walls'],
      isAttributed: st => !!(st && (st.ref || st.awinmid)),
      byKey: k => (k === 'walls' ? { key: 'walls', name: 'Fixture Walls', room: 'walls' } : null),
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

async function catalogue (query = {}) {
  const { default: handler } = await import('../api/products.js?awin=' + Date.now())
  let payload
  const res = {
    statusCode: 200,
    setHeader () {}, getHeader () { return null },
    status (c) { this.statusCode = c; return this },
    json (o) { payload = o; return this },
    end () { return this },
  }
  await handler({ method: 'GET', query: { refresh: '1', ...query }, headers: {} }, res)
  return payload
}

test('an AWIN product links through cread.php, not to the shop', async () => {
  const out = await catalogue()
  assert.equal(out.items.length, 1, 'the fixture product should survive')
  const url = out.items[0].url

  assert.ok(url.startsWith('https://www.awin1.com/cread.php?'),
    'an AWIN store must emit a wrapped link; got ' + url)

  const q = new URL(url).searchParams
  assert.equal(q.get('awinmid'), MID, 'the advertiser id is wrong or missing')
  assert.equal(q.get('awinaffid'), AFFID,
    'the publisher id is wrong or missing: this is the per-SITE one, and a ' +
    'sister site\'s id here pays a sister site')

  const dest = q.get('ued')
  assert.ok(dest && dest.startsWith('https://fixture-walls.test/'),
    'the destination did not survive the wrap: ' + dest)
  assert.ok(dest.includes('/products/oversize-canvas'),
    'the wrap lost the product page and points at the shop: ' + dest)

  /* AND IT IS PERCENT-ENCODED, asserted on the raw string because
     that is the only place the difference exists. A destination left
     unescaped works right up until one carries a query, at which
     point cread.php reads its first & as the end of `ued` and the
     shopper lands on the shop's front page having been sold a
     specific product. Parsed with URLSearchParams both spellings
     decode the same, so this assertion has to look at the text. */
  assert.ok(url.includes('&ued=https%3A%2F%2F'),
    'the destination is not percent-encoded inside ued: ' + url)
})

test('a link AWIN already built is never wrapped a second time', async () => {
  /* An advertiser with a product feed hands over `aw_deep_link`,
     which is already a tracked awin1.com redirect. Wrapping that
     gives an awin1.com link whose destination is another awin1.com
     link: the shopper arrives, eventually, and only the outer hop is
     credited. Kawaii Katz's scar. */
  const src = await import('node:fs')
    .then(fs => fs.readFileSync(new URL('../api/products.js', import.meta.url), 'utf8'))
  assert.match(src, /ALREADY_AWIN\s*=\s*\/\^https\?/,
    'buildAff has no guard against wrapping an awin1.com URL twice')
  assert.match(src, /if \(ALREADY_AWIN\.test\(base\)\) return base/,
    'the double-wrap guard exists but nothing calls it')
})

test('the scraper never requests a tracked URL', async () => {
  /* A GET on a cread.php link registers a real click and pollutes the
     owner's own conversion stats with our traffic -- the one class of
     bug that corrupts the evidence you would use to find it. The
     registry's own rule, extended to the network that arrived after
     it was written. */
  await catalogue()
  for (const u of requested) {
    assert.equal(/awin1\.com|[?&](?:awinmid|awinaffid)=/.test(u), false,
      'the scraper requested a tracked AWIN URL: ' + u)
  }
})

test('no id, no wrap, and never a broken link', async () => {
  /* The standing rule everywhere in this file's neighbourhood: the
     shopper always gets where they were going. An AWIN store whose
     awinmid has not been filled in yet links direct and is reported
     unattributed, rather than emitting a cread.php link with an empty
     advertiser id, which resolves to an AWIN error page. */
  const src = await import('node:fs')
    .then(fs => fs.readFileSync(new URL('../api/products.js', import.meta.url), 'utf8'))
  const fn = src.slice(src.indexOf('function affTemplate'), src.indexOf('function buildAff'))
  assert.match(fn, /if \(!st\.awinmid \|\| !AWIN_PUBLISHER\) return ''/,
    'the AWIN branch must refuse to compose a link with either id missing')
})
