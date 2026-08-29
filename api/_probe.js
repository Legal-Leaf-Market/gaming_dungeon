/* ============================================================
   Read a merchant's catalogue from the shop's own feed, server-side.
   ------------------------------------------------------------
   THE SISTER SITES ALL HAVE ONE OF THESE and this repo did not.
   Herbal Leaf's guide names `scripts/vendor_probe.py` in its hard
   "do not" list: never clear a store's pending flag without running
   it and writing the include list from what the feed actually holds.
   Guessing fails in both directions -- no include list fills the
   shelf with gift cards and teaware, a guessed one matches nothing
   and reads as a merchant who sells nothing.

   WHY THIS EXISTS ALONGSIDE THE BOOKMARKLET, NOT INSTEAD OF IT.
   The capture-first inversion (see CLAUDE.md) is about the ORDER:
   read a merchant's catalogue and have a human review it before
   anything of theirs reaches a shelf. It is not about the browser
   being the only instrument. 53 of the 54 merchants here are Shopify,
   and Shopify publishes products.json precisely so machines can read
   it -- so for those, walking a shop by hand to learn what it stocks
   is ceremony rather than diligence.

   What this does NOT do is publish. It reads, it counts, and it hands
   back a summary to review. `data/captured/<key>.json` still has to
   arrive through a commit with a name in `reviewedBy`, and that is
   still the only thing that puts a product on a shelf.

   THE BOOKMARKLET IS STILL THE ANSWER for the one non-Shopify store,
   for any merchant whose feed is switched off at the edge, and for
   anything where you want to see the shop the way a shopper does.

   NO TRACKING LINK IS EVER FETCHED HERE. Every URL is built from
   `st.domain` and nothing reads `st.ref`. A GET on a ?ref= link
   registers a real click and pollutes the owner's own conversion
   stats with our traffic -- the one class of bug that corrupts the
   evidence you would use to find it.
   ============================================================ */

const UA = 'GamingDungeonBot/1.0 (+catalogue review; contact via the site)'
const PAGE = 250          /* Shopify's hard cap; asking for more returns 250 */
const MAX_PAGES = 12      /* 3000 products. Past that, read it in the browser. */

async function getJson(url, ms = 12000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal })
    const text = await res.text()
    if (!res.ok) return { ok: false, status: res.status, error: 'HTTP ' + res.status }
    if (text.slice(0, 15).toLowerCase().includes('<!doctype')) {
      return { ok: false, status: res.status, error: 'got HTML, not JSON: the feed is off or behind a wall' }
    }
    try { return { ok: true, status: res.status, data: JSON.parse(text) } }
    catch { return { ok: false, status: res.status, error: 'unparseable JSON' } }
  } catch (e) {
    return { ok: false, status: 0, error: e.name === 'AbortError' ? 'timed out' : e.message }
  } finally {
    clearTimeout(t)
  }
}

/**
 * Every product in a Shopify shop, as rows shaped like capture rows so
 * `analyse()` cannot tell the difference.
 *
 * PAGES UNTIL A SHORT PAGE COMES BACK, which is the only reliable end
 * signal Shopify gives: the API caps at 250 and truncates silently, so
 * a naive single request reports a 289-product vendor as a 250-product
 * one and nothing looks wrong. Herbal Leaf found that bug with a real
 * merchant. The page cap above is a runaway guard and is REPORTED when
 * it trips rather than swallowed, because a silent cap is the same bug
 * wearing a different hat.
 */
export async function readShopify(st, opts = {}) {
  const maxPages = opts.maxPages || MAX_PAGES
  const rows = []
  const notes = []
  let pages = 0, truncated = false

  for (let page = 1; page <= maxPages; page++) {
    const url = `https://${st.domain}/products.json?limit=${PAGE}&page=${page}`
    const got = await getJson(url)
    if (!got.ok) {
      if (page === 1) return { ok: false, error: got.error, rows: [], notes, pages: 0 }
      notes.push(`Page ${page} failed (${got.error}); stopped there with ${rows.length} products.`)
      break
    }
    const prods = (got.data && got.data.products) || []
    pages++
    for (const pr of prods) {
      rows.push({
        title: pr.title || '',
        product_type: pr.product_type || '',
        vendor: pr.vendor || '',
        handle: pr.handle || '',
        url: `https://${st.domain}/products/${pr.handle}`,
        image: (pr.images && pr.images[0] && pr.images[0].src) || '',
        price: firstPrice(pr),
        available: (pr.variants || []).some(v => v.available !== false),
        variants: (pr.variants || []).length,
      })
    }
    if (prods.length < PAGE) break
    if (page === maxPages) truncated = true
  }

  if (truncated) {
    notes.push(
      `STOPPED AT THE PAGE CAP: ${maxPages} pages of ${PAGE} came back full, so this is a SAMPLE, ` +
      'not the catalogue. Raise maxPages or walk the shop in a browser before writing an include list from it.')
  }
  return { ok: true, rows, notes, pages, truncated }
}

function firstPrice(pr) {
  for (const v of pr.variants || []) {
    const n = Number(v.price)
    if (n > 0) return n
  }
  return null
}

/**
 * What the rows say about a merchant, in the shape `/api/capture?report`
 * returns for a browser capture -- same questions, same words, so the
 * two readers are comparable at a glance.
 */
export function summarise(rows) {
  const priced = rows.filter(r => r.price > 0)
  const prices = priced.map(r => r.price).sort((a, b) => a - b)
  const types = tally(rows.map(r => (r.product_type || '').trim() || '(none)'))
  const vendors = tally(rows.map(r => (r.vendor || '').trim() || '(none)'))

  const notes = []
  if (!priced.length && rows.length) {
    notes.push('NOTHING IS PRICED. That is usually a brand site rather than a storefront; ' +
      'a shelf of cards with no price on them is not worth shipping.')
  }
  if (rows.length && !rows.some(r => r.available)) {
    notes.push('NOTHING IS IN STOCK across the whole feed. Check the shop is still trading.')
  }
  const noImage = rows.filter(r => !r.image).length
  if (noImage > rows.length / 4) {
    notes.push(`${noImage} of ${rows.length} products have no image. This shelf will look broken.`)
  }
  /* The registry warns that twenty of the anime domains are one
     operator's dropship catalogue. A single `vendor` value across a
     whole feed does not prove that, but it is the cheapest tell there
     is, and it is worth saying out loud next to the histogram. */
  if (vendors.length === 1 && rows.length > 30) {
    notes.push(`Every product carries the same vendor field ("${vendors[0][0]}"). Worth checking ` +
      'against the other domains in the same room before publishing both.')
  }

  return {
    products: rows.length,
    inStock: rows.filter(r => r.available).length,
    priced: priced.length,
    unpriced: rows.length - priced.length,
    withoutImage: noImage,
    priceRange: prices.length
      ? {
          min: prices[0],
          max: prices[prices.length - 1],
          median: prices[Math.floor(prices.length / 2)],
        }
      : null,
    productTypes: types,
    vendors: vendors.slice(0, 12),
    sampleTitles: rows.slice(0, 20).map(r => r.title),
    notes,
  }
}

function tally(values) {
  const m = new Map()
  for (const v of values) m.set(v, (m.get(v) || 0) + 1)
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1])
}
