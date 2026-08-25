/* ============================================================
   _capture.js — the capture store, and the gate it enforces.
   ------------------------------------------------------------
   This file is why the site is built in the order it is built.

   THE ORDER, AND WHY IT IS BACKWARDS FROM THE SISTER SITES
   ------------------------------------------------------------
   Herbal-Leaf, Nicotia and Kawaii Katz all did it the same way:
   register a vendor, point the scraper at its products.json, ship
   it, and learn afterwards what actually came back. Every one of
   the three has a paragraph in its own guide about what that cost.
   Kawaii Katz's is the bluntest — an intake "went onto the shelf
   unread", Tokyo Tiger returned nothing at all and still does, and
   two vendors put 466 products up that earn nothing to this day.

   Gaming Dungeon inverts it. A human opens the merchant in their
   own browser, runs the collector bookmarklet, and we read what is
   actually there BEFORE any scraper is pointed at it. Only then
   does a merchant get an `include` list, a room, and a cleared
   `pending` flag.

   The inversion is only real if something enforces it, because the
   sister sites did not intend to ship unread vendors either. So:

   ------------------------------------------------------------
   THE GATE: data/captured/<key>.json MUST EXIST
   ------------------------------------------------------------
   `publishable()` refuses any store without a reviewed capture on
   file, whatever its `pending` flag says. Editing `pending: false`
   in _stores.js is NOT sufficient and is not meant to be — that is
   the exact edit somebody makes at midnight to see if a merchant
   works, and the exact edit that ships an unread catalogue.

   TWO PLACES, ON PURPOSE, AND THEY HOLD DIFFERENT THINGS:

     Neon                   the RAW capture. Everything the browser
                            saw, one row per product, unfiltered.
                            Written by the bookmarklet, read by
                            /api/capture?report.

     data/captured/<key>.json   the REVIEWED SUMMARY. Small,
                            committed, diffable. Written by a person
                            who has looked at the report and decided
                            the merchant is understood.

   The split is the point. Raw captures are too big and too churny
   to commit, and a gate that reads mutable database state is a gate
   that can be opened with an INSERT. A committed file is a gate
   somebody had to deliberately walk through, and the walking
   through shows up in a pull request.

   It also means the evidence outlives the database. Six months from
   now the question "why does this merchant have these four
   product_types in its include list" has an answer in the repo,
   next to the code that acts on it.

   ------------------------------------------------------------
   CAPTURE EVERYTHING, FILTER NEVER
   ------------------------------------------------------------
   Inherited verbatim from legal-leafmarket.com/coldwater-collect,
   which has been in operator use long enough to have paid for it: a
   partial pull gets analysed, a conclusion gets drawn, and then the
   missing rows turn out to have changed the answer and the work is
   done twice. So the extractor keeps what it found in full, raw
   source objects and per-card HTML included. Whittling happens
   downstream, where it can be redone without re-browsing forty
   pages.

   ------------------------------------------------------------
   AN EMPTY CAPTURE IS REFUSED, NOT STORED
   ------------------------------------------------------------
   Also inherited, also paid for. Running the bookmarklet before the
   grid finished rendering must not be able to register a merchant
   as having no products. Under the old blob-per-merchant store this
   was existential — an empty write REPLACED good earlier work.
   One row per product makes it merely wrong rather than
   destructive, and it is still refused, because a merchant recorded
   as empty is a merchant somebody crosses off the worklist.
   ============================================================ */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { q, dbConfigured, dbHealth } from './_db.js'

export { dbConfigured, dbHealth }

export const CAPTURED_DIR = join(process.cwd(), 'data', 'captured')

/* ------------------------------------------------------- identity */

/**
 * A product's identity within a merchant's capture.
 *
 * URL first, with the query string and trailing slash stripped: a
 * Shopify grid links the same product as `/products/x`,
 * `/collections/all/products/x` and `/products/x?variant=123`, and
 * three rows for one product would inflate every count a decision
 * gets made from.
 *
 * Title is the fallback rather than the primary even though it is
 * more stable across those variants, because two genuinely
 * different products routinely share a title ("Mystery Box") and
 * collapsing those loses stock we captured.
 */
function identity(p) {
  const u = String((p && (p.url || p.href)) || '').split('?')[0].replace(/\/$/, '')
  if (u) return 'u:' + u.toLowerCase()
  const t = String((p && (p.title || p.name)) || '').trim().toLowerCase()
  return t ? 't:' + t : ''
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function str(v, max = 400) {
  const s = v == null ? '' : String(v).trim()
  return s ? s.slice(0, max) : null
}

/* ------------------------------------------------------- merge */

/**
 * Store one page's capture.
 *
 * An UPSERT per product, so this is atomic and two tabs capturing
 * two pages of the same shop cannot lose each other's work. The old
 * KV version read the merchant's whole blob, merged, and wrote it
 * back, which raced exactly there.
 *
 * Returns { ok, stored, added, total, error }. A refusal is a normal
 * outcome and carries a reason in words, because the operator is
 * stood in front of the panel waiting to be told what happened.
 */
export async function merge(merchantKey, capture) {
  const key = String(merchantKey || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!key) return { ok: false, error: 'no merchant key' }

  const incoming = Array.isArray(capture && capture.products) ? capture.products : []

  /* THE REFUSAL. See the header. */
  if (!incoming.length) {
    return {
      ok: false,
      error: 'empty capture refused: the page had no products when you pressed the button. ' +
             'If the grid lazy-loads, scroll to the bottom first and run it again.',
    }
  }

  if (!dbConfigured()) {
    return {
      ok: false,
      error: 'no capture store configured. Set DATABASE_URL to the Neon connection string, ' +
             'or use Copy on the panel and paste the JSON into /collect by hand.',
    }
  }

  const rows = []
  const seen = new Set()
  for (const p of incoming) {
    const id = identity(p)
    if (!id || seen.has(id)) continue
    seen.add(id)
    rows.push({
      id,
      productType: str(p.productType || p.product_type || p.type, 200),
      vendor: str(p.vendor || p.brand, 200),
      title: str(p.title || p.name, 600),
      price: num(p.price),
      data: p,
    })
  }
  if (!rows.length) return { ok: false, error: 'capture had products but none carried a usable identity' }

  try {
    const before = await q(s => s`
      SELECT count(*)::int AS n FROM capture_products WHERE merchant_key = ${key}`)
    const wasTotal = (before && before[0] && before[0].n) || 0

    /* Chunked so one statement never carries a whole 1,200-product
       page. Neon's SQL-over-HTTP has a request ceiling and the raw
       per-card HTML we deliberately keep is what would hit it. */
    const CHUNK = 100
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK)
      await q(s => s`
        INSERT INTO capture_products
          (merchant_key, identity, product_type, vendor, title, price, data)
        SELECT ${key}, x.identity, x.product_type, x.vendor, x.title, x.price, x.data
        FROM jsonb_to_recordset(${JSON.stringify(slice.map(r => ({
          identity: r.id, product_type: r.productType, vendor: r.vendor,
          title: r.title, price: r.price, data: r.data,
        })))}::jsonb)
          AS x(identity text, product_type text, vendor text, title text, price numeric, data jsonb)
        ON CONFLICT (merchant_key, identity) DO UPDATE SET
          captured_at  = now(),
          product_type = excluded.product_type,
          vendor       = excluded.vendor,
          title        = excluded.title,
          price        = excluded.price,
          /* Newest wins on a re-capture: prices move, and the reason
             to run it again is usually that they have. */
          data         = excluded.data`)
    }

    const pageUrl = String((capture && capture.pageUrl) || (capture && capture.url) || '')
    if (pageUrl) {
      await q(s => s`
        INSERT INTO capture_pages (merchant_key, url, found, build, coverage)
        VALUES (${key}, ${pageUrl}, ${incoming.length},
                ${String((capture && capture.build) || '')},
                ${JSON.stringify((capture && capture.coverage) || null)}::jsonb)
        ON CONFLICT (merchant_key, url) DO UPDATE SET
          captured_at = now(), found = excluded.found,
          build = excluded.build, coverage = excluded.coverage`)
    }

    const after = await q(s => s`
      SELECT count(*)::int AS n FROM capture_products WHERE merchant_key = ${key}`)
    const total = (after && after[0] && after[0].n) || rows.length

    return { ok: true, stored: rows.length, added: total - wasTotal, total, merchantKey: key }
  } catch (e) {
    return { ok: false, error: 'capture store rejected the write: ' + (e && e.message ? e.message : 'unknown') }
  }
}

/* ------------------------------------------------------------- report */

/**
 * What did we actually find? The thing you read before writing an
 * `include` list.
 *
 * The histogram is a GROUP BY rather than a download-and-count,
 * which is the whole reason this is Postgres and not a blob: a
 * 1,200-product merchant answers this in one indexed query instead
 * of shipping megabytes of raw card HTML to be parsed in JS.
 *
 * Modelled on `vendor_probe.py` and Kawaii Katz's `pnpm probe`, with
 * one difference that matters: those two ASK THE MERCHANT, over the
 * network, from a datacentre IP. This reads a capture a human
 * already made in their own browser, so it works on the merchants
 * those two cannot reach — the 403-on-Vercel ones, and the ones with
 * no products.json at all.
 */
export async function report(key) {
  if (!dbConfigured()) return null

  const [totals] = await q(s => s`
    SELECT count(*)::int AS products,
           count(*) FILTER (WHERE price IS NOT NULL AND price > 0)::int AS priced,
           count(*) FILTER (WHERE data ? 'image' AND data->>'image' <> '')::int AS imaged,
           min(price) AS min_price, max(price) AS max_price, avg(price) AS mean_price,
           max(captured_at) AS updated
    FROM capture_products WHERE merchant_key = ${key}`)

  if (!totals || !totals.products) return null

  const types = await q(s => s`
    SELECT coalesce(nullif(product_type, ''), '(none)') AS t, count(*)::int AS n
    FROM capture_products WHERE merchant_key = ${key}
    GROUP BY 1 ORDER BY n DESC`)

  const vendors = await q(s => s`
    SELECT coalesce(nullif(vendor, ''), '(none)') AS v, count(*)::int AS n
    FROM capture_products WHERE merchant_key = ${key}
    GROUP BY 1 ORDER BY n DESC LIMIT 25`)

  const pages = await q(s => s`
    SELECT url, found, build, coverage, captured_at
    FROM capture_pages WHERE merchant_key = ${key} ORDER BY captured_at`)

  const samples = await q(s => s`
    SELECT title FROM capture_products
    WHERE merchant_key = ${key} AND title IS NOT NULL
    ORDER BY captured_at LIMIT 15`)

  /* WHAT THE CAPTURE DID NOT SEE IS WORTH MORE THAN WHAT IT DID. */
  let claimed = 0
  const notes = []
  for (const pg of pages || []) {
    const c = pg.coverage || {}
    const n = Number(c.claimedTotal) || 0
    if (n > claimed) claimed = n
    for (const note of c.notes || []) if (!notes.includes(note)) notes.push(note)
  }

  const products = totals.products
  const partial = !!(claimed && products < claimed)

  return {
    merchantKey: key,
    updated: totals.updated,
    pagesCaptured: (pages || []).length,
    products,
    claimedTotal: claimed || null,
    partial,
    coverageNote: partial
      ? `SAMPLE, NOT A CATALOGUE: the pages claimed ${claimed} results and this capture holds ` +
        `${products}. Page through the rest before drawing any conclusion from it.`
      : null,
    productTypes: (types || []).map(r => [r.t, r.n]),
    vendors: (vendors || []).map(r => [r.v, r.n]),
    priced: totals.priced,
    unpriced: products - totals.priced,
    priceRange: totals.priced
      ? {
          min: Number(totals.min_price),
          max: Number(totals.max_price),
          mean: Math.round(Number(totals.mean_price) * 100) / 100,
        }
      : null,
    withoutImage: products - totals.imaged,
    notes,
    sampleTitles: (samples || []).map(r => r.title),
  }
}

/**
 * Captured products, shaped like catalogue items so the SAME grid
 * renderer draws them.
 *
 * THIS IS THE PREVIEW, AND IT IS NOT A BACK DOOR ROUND THE GATE.
 * It is admin-gated, it is served only to /collect (which is
 * noindex and an operator tool), and nothing it returns reaches
 * /api/products or a shopper. What it buys is the ability to LOOK at
 * a merchant's catalogue the moment it is scanned, instead of
 * hand-reading a JSON histogram and imagining the shelf.
 *
 * That matters for the decision it feeds. "Does this merchant belong
 * in the Vault or the Wardrobe" and "is this the same dropship stock
 * as the other anime domain" are both questions you answer far faster
 * by looking at ninety product cards than by reading a table, and the
 * second one is a question the registry explicitly asks somebody to
 * settle before publishing either shop.
 *
 * Rooms are assigned here by the real classifier rather than left
 * blank, so the preview also shows where _scene.js WOULD file each
 * product. A room that comes out obviously wrong on real titles is a
 * pattern to fix before the merchant ships, not after.
 */
export async function previewItems(key, classify, storeFor) {
  if (!dbConfigured()) return []
  const rows = await q(s => s`
    SELECT merchant_key, title, price, product_type, vendor, data
    FROM capture_products
    WHERE merchant_key = ${key}
    ORDER BY captured_at
    LIMIT 1000`)
  return (rows || []).map(r => {
    const d = r.data || {}
    const st = storeFor ? storeFor(r.merchant_key) : null
    return {
      k: r.merchant_key,
      shopName: (st && st.name) || r.merchant_key,
      title: r.title || d.title || '',
      price: r.price == null ? undefined : String(r.price),
      cur: d.currency || undefined,
      image: d.image || undefined,
      url: d.url || undefined,
      ptype: r.product_type || undefined,
      oos: d.available === false ? 1 : undefined,
      room: classify
        ? classify(st || { room: '' }, r.title || '', [r.product_type, r.vendor].filter(Boolean).join(' '))
        : '',
    }
  })
}

/** Which merchants have any capture at all. Drives the worklist. */
export async function capturedCounts() {
  if (!dbConfigured()) return new Map()
  try {
    const rows = await q(s => s`
      SELECT merchant_key, count(*)::int AS n
      FROM capture_products GROUP BY 1`)
    return new Map((rows || []).map(r => [r.merchant_key, r.n]))
  } catch { return new Map() }
}

/* --------------------------------------------------------- THE GATE */

/**
 * Which merchants have a reviewed capture committed to the repo?
 *
 * Read from disk every call rather than cached at module scope: a
 * serverless instance can outlive a deploy, and a gate answering
 * from a stale module-level Set would keep a merchant off the shelf
 * for hours after somebody committed its capture. Reading a small
 * directory is cheap; explaining that outage is not.
 */
export function reviewedKeys() {
  try {
    if (!existsSync(CAPTURED_DIR)) return new Set()
    return new Set(
      readdirSync(CAPTURED_DIR)
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5))
    )
  } catch { return new Set() }
}

export function readReviewed(key) {
  try {
    const p = join(CAPTURED_DIR, key + '.json')
    if (!existsSync(p)) return null
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch { return null }
}

/**
 * May this store be scraped and published?
 *
 * BOTH halves, and they are different KINDS of thing:
 *
 *   pending    an editorial decision. "We have not decided to stock
 *              this yet." A human sets it.
 *   captured   a factual precondition. "Nobody has read this feed."
 *              A committed file sets it, and no edit to _stores.js
 *              can fake it.
 *
 * Note what is NOT here: a filled `ref`. Kawaii Katz requires real
 * tracking before publishing and that is right for Kawaii Katz. Here
 * the owner has decided explicitly to build the right site rather
 * than the site we are approved for, so an unattributed merchant may
 * ship. It may not ship SILENTLY — `?debug` names every one — but
 * that is a reporting duty, not a gate.
 */
export function publishable(st, reviewed = reviewedKeys()) {
  if (!st) return { ok: false, why: 'no store' }
  if (st.pending) return { ok: false, why: 'PENDING: not yet cleared for the shelf' }
  if (!reviewed.has(st.key)) {
    return {
      ok: false,
      why: 'NO CAPTURE ON FILE: data/captured/' + st.key + '.json does not exist. ' +
           'Capture it from /collect first. Clearing `pending` alone does not publish a merchant.',
    }
  }
  return { ok: true, why: '' }
}
