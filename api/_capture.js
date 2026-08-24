/* ============================================================
   _capture.js — the capture store, and the gate it enforces.
   ------------------------------------------------------------
   This file is why the site is built in the order it is built.

   THE ORDER, AND WHY IT IS BACKWARDS FROM THE SISTER SITES
   ------------------------------------------------------------
   Herbal-Leaf, Nicotia and Kawaii Katz all did it the same way:
   register a vendor, point the scraper at their products.json, ship
   it, and learn afterwards what actually came back. Every one of the
   three has a paragraph in its own guide about what that cost.
   Kawaii Katz's is the bluntest — an intake "went onto the shelf
   unread", Tokyo Tiger returned nothing at all and still does, and
   two vendors put 466 products up that earn nothing to this day.

   Gaming Dungeon inverts it. A human opens the merchant in their own
   browser, runs the collector bookmarklet, and we read what is
   actually there BEFORE any scraper is pointed at it. Only then does
   a merchant get an `include` list, a room, and a cleared `pending`
   flag.

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

     KV                     the RAW capture. Everything the browser
                            saw, per page, unfiltered. Large,
                            ephemeral, expires. Written by the
                            bookmarklet, read by /api/capture?report.

     data/captured/<key>.json   the REVIEWED SUMMARY. Small, committed,
                            diffable. Written by a person who has
                            looked at the report and decided the
                            merchant is understood.

   The split is the point. Raw captures are too big and too churny to
   commit, and a gate that reads ephemeral cache state is a gate that
   opens by itself when the cache expires. A committed file is a gate
   that somebody had to deliberately walk through, and the walking
   through shows up in a pull request.

   `capture-summary` also means the evidence outlives the capture.
   Six months from now the question "why does this merchant have
   these four product_types in its include list" has an answer in the
   repo instead of in a cache that expired in April.

   ------------------------------------------------------------
   CAPTURE EVERYTHING, FILTER NEVER
   ------------------------------------------------------------
   Inherited verbatim from legal-leafmarket.com/coldwater-collect,
   which has been in operator use long enough to have paid for it: a
   partial pull gets analysed, a conclusion gets drawn, and then the
   missing rows turn out to have changed the answer and the work is
   done twice. So the extractor keeps what it found in full, raw
   source objects and per-card HTML included. Whittling happens
   downstream, where it can be redone without re-browsing forty pages.

   ------------------------------------------------------------
   AN EMPTY CAPTURE IS REFUSED, NOT STORED
   ------------------------------------------------------------
   Also inherited, also paid for. Captures merge by merchant, so
   storing an empty one would let a mis-timed run — the bookmarklet
   pressed before the grid finished rendering — wipe out good earlier
   work. `merge()` refuses a capture with no products rather than
   recording it as a merchant with none.
   ============================================================ */

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const KV_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL   || ''
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || ''

const KEY_PREFIX = 'gd:capture:v1:'
/* 30 days. Long enough to capture a merchant over several sittings,
   short enough that a raw capture nobody promoted does not sit in
   the store forever pretending to be current. */
const KV_TTL_SECONDS = 60 * 60 * 24 * 30

export const CAPTURED_DIR = join(process.cwd(), 'data', 'captured')

/* ---------------------------------------------------------------- KV */

async function kv(cmd) {
  if (!KV_URL || !KV_TOKEN) return null
  try {
    const r = await fetch(KV_URL, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + KV_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmd),
      signal: AbortSignal.timeout(6000),
    })
    if (!r.ok) return null
    const j = await r.json()
    return j && 'result' in j ? j.result : null
  } catch { return null }
}

export function kvConfigured() {
  return !!(KV_URL && KV_TOKEN)
}

export async function readCapture(merchantKey) {
  const raw = await kv(['GET', KEY_PREFIX + merchantKey])
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

async function writeCapture(merchantKey, box) {
  return kv(['SET', KEY_PREFIX + merchantKey, JSON.stringify(box), 'EX', String(KV_TTL_SECONDS)])
}

/* ------------------------------------------------------- merge + store */

/** A product's identity within a capture. URL first; a title is a weak second. */
function identity(p) {
  const u = String((p && (p.url || p.href)) || '').split('?')[0].replace(/\/$/, '')
  if (u) return 'u:' + u.toLowerCase()
  const t = String((p && (p.title || p.name)) || '').trim().toLowerCase()
  return t ? 't:' + t : ''
}

/**
 * Merge one page's capture into the merchant's accumulated record.
 *
 * Returns { ok, stored, added, total, error }. A refusal is a normal
 * outcome and carries a reason, because the operator is standing in
 * front of the panel waiting to be told what happened.
 */
export async function merge(merchantKey, capture) {
  const key = String(merchantKey || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!key) return { ok: false, error: 'no merchant key' }

  const incoming = Array.isArray(capture && capture.products) ? capture.products : []

  /* THE REFUSAL THAT PROTECTS EARLIER WORK. See the header. */
  if (!incoming.length) {
    return {
      ok: false,
      error: 'empty capture refused: the page had no products when you pressed the button. ' +
             'If the grid lazy-loads, scroll to the bottom first and run it again.',
    }
  }

  if (!kvConfigured()) {
    return {
      ok: false,
      error: 'no capture store configured. Set KV_REST_API_URL and KV_REST_API_TOKEN, or use ' +
             'Copy on the panel and paste the JSON into /collect by hand.',
    }
  }

  const prev = (await readCapture(key)) || { merchantKey: key, pages: [], products: [] }
  const seen = new Map()
  for (const p of prev.products) { const id = identity(p); if (id) seen.set(id, p) }

  let added = 0
  for (const p of incoming) {
    const id = identity(p)
    if (!id) continue
    if (!seen.has(id)) added++
    /* Newest wins on a re-capture: prices move, and the reason to run
       it again is usually that they have. */
    seen.set(id, p)
  }

  const pageUrl = String((capture && capture.pageUrl) || (capture && capture.url) || '')
  const pages = prev.pages.filter(pg => pg.url !== pageUrl)
  pages.push({
    url: pageUrl,
    at: new Date().toISOString(),
    found: incoming.length,
    build: String((capture && capture.build) || ''),
    coverage: (capture && capture.coverage) || null,
  })

  const box = {
    merchantKey: key,
    updated: new Date().toISOString(),
    build: String((capture && capture.build) || ''),
    pages,
    products: Array.from(seen.values()),
  }

  await writeCapture(key, box)
  return { ok: true, stored: incoming.length, added, total: box.products.length, merchantKey: key }
}

/* ------------------------------------------------------------- report */

/**
 * What did we actually find? This is the thing you read before
 * writing an `include` list.
 *
 * Modelled on `vendor_probe.py` and Kawaii Katz's `pnpm probe`, with
 * one difference that matters: those two ASK THE MERCHANT, over the
 * network, from a datacentre IP. This reads a capture a human already
 * made in their own browser, so it works on the merchants those two
 * cannot reach — the 403-on-Vercel ones, and the ones with no
 * products.json at all.
 */
export function report(box) {
  const products = (box && box.products) || []
  const types = new Map()
  const vendors = new Map()
  let priced = 0, sumPrice = 0, minPrice = Infinity, maxPrice = -Infinity, imaged = 0

  for (const p of products) {
    const t = String((p && (p.productType || p.product_type || p.type)) || '(none)').trim() || '(none)'
    types.set(t, (types.get(t) || 0) + 1)

    const v = String((p && (p.vendor || p.brand)) || '(none)').trim() || '(none)'
    vendors.set(v, (vendors.get(v) || 0) + 1)

    const n = Number(p && p.price)
    if (Number.isFinite(n) && n > 0) {
      priced++; sumPrice += n
      if (n < minPrice) minPrice = n
      if (n > maxPrice) maxPrice = n
    }
    if (p && (p.image || p.img)) imaged++
  }

  const desc = m => Array.from(m.entries()).sort((a, b) => b[1] - a[1])

  /* WHAT THE CAPTURE DID NOT SEE IS WORTH MORE THAN WHAT IT DID.
     A capture holding 24 of 1,180 products looks exactly like a small
     catalogue. Anything the pages claimed but we did not collect is
     reported in words, and `partial` is what a reader should look at
     first. */
  const pages = (box && box.pages) || []
  const claimed = pages.reduce((n, pg) => Math.max(n, Number(pg.coverage && pg.coverage.claimedTotal) || 0), 0)
  const notes = []
  for (const pg of pages) for (const n of ((pg.coverage && pg.coverage.notes) || [])) if (!notes.includes(n)) notes.push(n)

  return {
    merchantKey: box && box.merchantKey,
    updated: box && box.updated,
    pagesCaptured: pages.length,
    products: products.length,
    claimedTotal: claimed || null,
    partial: !!(claimed && products.length < claimed),
    coverageNote: claimed && products.length < claimed
      ? `SAMPLE, NOT A CATALOGUE: the pages claimed ${claimed} results and this capture holds ` +
        `${products.length}. Page through the rest before drawing any conclusion from it.`
      : null,
    productTypes: desc(types),
    vendors: desc(vendors).slice(0, 25),
    priced,
    unpriced: products.length - priced,
    priceRange: priced ? { min: minPrice, max: maxPrice, mean: Math.round((sumPrice / priced) * 100) / 100 } : null,
    withoutImage: products.length - imaged,
    notes,
    sampleTitles: products.slice(0, 15).map(p => String((p && (p.title || p.name)) || '')).filter(Boolean),
  }
}

/* --------------------------------------------------------- THE GATE */

/**
 * Which merchants have a reviewed capture committed to the repo?
 *
 * Read from disk every call rather than cached at module scope: a
 * serverless instance can outlive a deploy, and a gate that answers
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
 * BOTH halves, and the reasons are different:
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
