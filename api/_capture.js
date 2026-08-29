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

   Verda Store inverts it. A human opens the merchant in their
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

/**
 * Resolved at CALL time, not at import.
 *
 * It was a module-level constant, and a test caught what that costs:
 * two assertions passed for the WRONG REASON. They asserted "a blank
 * reviewedBy does not publish" and got the right answer because the
 * frozen path pointed somewhere the file did not exist, so every
 * summary read as missing. The only case that failed was the one
 * where a file was supposed to be FOUND.
 *
 * That is the shape of a bug worth fixing rather than working around:
 * a constant that makes the failure path look correct while breaking
 * the success path. Reading cwd per call costs nothing.
 */
export function capturedDir() {
  return join(process.cwd(), 'data', 'captured')
}

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

/* ============================================================
   THE DRAFT — turning a capture into the file that is the gate.
   ------------------------------------------------------------
   Writing data/captured/<key>.json by hand is twenty minutes of
   transcribing a histogram, and twenty minutes of tedium at the one
   step that must not be skipped is a step that gets skipped. So this
   drafts it.

   WHICH IMMEDIATELY THREATENS THE THING THE GATE IS FOR. A generator
   that fills in `include` with everything and hands you a file to
   commit turns "a human read this catalogue" into "a human ran a
   command", and the gate becomes a rubber stamp that still looks like
   a gate. That is a worse failure than the tedium, because it is
   invisible: the file exists, the merchant publishes, and nobody
   knows the reading never happened.

   So the split is deliberate:

   MEASURED FACTS ARE FILLED IN. Counts, the product_type histogram,
   the price range, coverage, how many rows carry no image. Nobody
   needs to retype a number this already knows.

   JUDGEMENT IS PROPOSED AND MARKED AS A PROPOSAL. `include` and
   `roomMap` arrive as suggestions with the evidence attached, never
   as settled answers.

   AND `reviewedBy` ARRIVES EMPTY, WITH TEETH. publishable() refuses a
   summary whose reviewedBy is blank, so a file generated and
   committed without anybody looking publishes nothing. That is the
   counterweight to the convenience, added in the same change that
   added the convenience.

   ------------------------------------------------------------
   THE PER-TYPE ROOM BREAKDOWN IS THE USEFUL PART
   ------------------------------------------------------------
   A bare histogram says "Accessories: 52". What you actually need
   before writing an include list is where those 52 would LAND:

     Accessories  52 -> battlestation 40, power 9, refused 3

   That one line answers "does this type belong on the shelf", "which
   room does it want", and "is this merchant carrying junk" at once,
   and it is why the draft runs the real classifier over every
   captured row rather than summarising titles.
   ============================================================ */

/**
 * Build the reviewed-summary file for a merchant, from its capture.
 *
 * Returns the object to write to data/captured/<key>.json, or null
 * when there is no capture to draft from.
 */
/**
 * THE ANALYSER, SHARED BY BOTH WAYS OF READING A MERCHANT.
 *
 * A catalogue reaches us two ways -- walked in a browser with the
 * bookmarklet, or read server-side from the shop's own products.json
 * -- and the DECISION made from it must not depend on which. Two
 * copies of this arithmetic would drift, and they would drift
 * invisibly: the same merchant would get a different include list on
 * a Tuesday than on a Wednesday and nothing would say so.
 *
 * So it takes rows and returns proposals, and knows nothing about
 * where the rows came from.
 *
 * Rows need `title`, `product_type` and `vendor`. Anything else is
 * ignored here.
 */
export function analyse(rows, st, classify) {
  const types = new Map()
  for (const r of rows) {
    const t = (r.product_type || '').trim() || '(none)'
    if (!types.has(t)) types.set(t, { type: t, n: 0, rooms: {}, refused: 0 })
    const e = types.get(t)
    e.n++
    const room = classify(st || { room: '' }, r.title || '',
      [r.product_type, r.vendor].filter(Boolean).join(' '), r.product_type || '')
    if (!room) e.refused++
    else e.rooms[room] = (e.rooms[room] || 0) + 1
  }

  const analysis = Array.from(types.values()).sort((a, b) => b.n - a.n).map(e => {
    const ranked = Object.entries(e.rooms).sort((a, b) => b[1] - a[1])
    const top = ranked[0]
    /* A PROPOSAL, and the threshold is stated rather than hidden: a
       type is proposed for inclusion when most of it lands somewhere
       real. Everything else is proposed for exclusion WITH the
       numbers, so disagreeing is a judgement rather than a guess. */
    const placed = e.n - e.refused
    const propose = placed / e.n >= 0.6 ? 'include' : 'exclude'
    return {
      type: e.type,
      n: e.n,
      rooms: Object.fromEntries(ranked),
      refused: e.refused,
      propose,
      /* Only when the type's products disagree with the store's
         default room. A roomMap entry that restates the default is
         noise somebody has to read past. */
      suggestRoom: top && st && top[0] !== st.room ? top[0] : undefined,
    }
  })

  const roomMap = {}
  for (const a of analysis) if (a.propose === 'include' && a.suggestRoom) roomMap[a.type] = a.suggestRoom

  /* ---- THE UNTYPED TRAP -------------------------------------
     An include list can only name types, and a product with no
     product_type matches no name, so a NON-EMPTY include list drops
     every untyped product in the catalogue. The proposal below used
     to be built from the typed rows alone and say nothing about it.

     That is not a hypothetical. customgamingchair has 23 products, 18
     of them untyped; the proposed list covered the other 5, and
     publishing it would have shipped five chairs out of twenty-three
     with nothing anywhere saying so. It was caught by hand, once, and
     the fix was written up as "remember to read the (none) row" --
     which is exactly the kind of rule this repo does not trust,
     because the next fifty drafts each need somebody to remember it.

     So the arithmetic does it. When untyped products are a large
     enough share that an include list would throw a real part of the
     catalogue away, the proposal becomes an EMPTY include, which
     means everything and lets the classifier place each product. That
     is not a fudge: it is the correct answer for a merchant with no
     taxonomy, and it is what both such merchants were published with.

     A quarter is the line. Stated here rather than buried, and
     reported in `coverage` either way so the number is visible even
     when it does not trip. */
  const total = rows.length || 1
  const untyped = (types.get('(none)') || { n: 0 }).n
  const untypedShare = untyped / total

  let include = analysis.filter(a => a.propose === 'include' && a.type !== '(none)').map(a => a.type)
  let untypedNote = null

  if (untypedShare >= 0.25) {
    untypedNote =
      untyped + ' of ' + total + ' products (' + Math.round(untypedShare * 100) + '%) have no ' +
      'product_type. An include list can only name types, so a non-empty one would drop every ' +
      'single one of them. Proposing an EMPTY include, which means everything and lets _scene.js ' +
      'place each product. If you replace it with a list, you are choosing to drop those ' +
      untyped + ' products.'
    include = []
  }

  /* How much of the catalogue the proposal actually publishes.
     Reported always, because "the include list looks sensible" and
     "the include list keeps most of the shop" are different claims
     and only the second one is checkable. */
  const kept = include.length
    ? analysis.filter(a => include.some(t => t.toLowerCase() === a.type.toLowerCase()))
        .reduce((n, a) => n + a.n, 0)
    : total
  const coverage = {
    products: total,
    untyped,
    wouldPublish: kept,
    wouldDrop: total - kept,
    pct: Math.round((kept / total) * 100),
    note: untypedNote,
  }

  return { analysis, include, roomMap, coverage }
}

/* The four lines every summary file carries, so the instructions do
   not fork between the two readers either. */
export function reviewNotes(coverageNote) {
  return [
    coverageNote || 'Coverage looks complete for the pages read.',
    'include and roomMap are PROPOSALS from the numbers above, not answers. ' +
      'A type is proposed for inclusion when 60% or more of its products land in a real room.',
    'Fill in reviewedBy. A summary with an empty reviewedBy publishes nothing — ' +
      'that is deliberate, and it is what stops this generator becoming a rubber stamp.',
    'Then clear `pending` in api/_stores.js and commit both together.',
  ]
}

export async function draft(key, classify, storeFor) {
  if (!dbConfigured()) return null

  const rows = await q(s => s`
    SELECT title, price, product_type, vendor, data
    FROM capture_products WHERE merchant_key = ${key}`)
  if (!rows || !rows.length) return null

  const st = storeFor ? storeFor(key) : null
  const rep = await report(key)

  const { analysis, include, roomMap, coverage } = analyse(rows, st, classify)

  return {
    key,
    /* EMPTY ON PURPOSE. publishable() refuses a blank one. */
    reviewedBy: '',
    reviewedOn: new Date().toISOString().slice(0, 10),
    capture: {
      products: rep.products,
      pagesCaptured: rep.pagesCaptured,
      claimedTotal: rep.claimedTotal,
      partial: rep.partial,
      platform: (rows[0] && rows[0].data && rows[0].data.source) || null,
      priceRange: rep.priceRange,
      unpriced: rep.unpriced,
      withoutImage: rep.withoutImage,
      notes: rep.notes,
    },
    /* The evidence the two proposals below were made from. Kept in
       the committed file so that in six months "why these four types"
       has an answer next to the code that acts on it. */
    productTypes: analysis,
    coverage,
    include,
    roomMap,
    readThisBeforeCommitting: reviewNotes(rep.coverageNote),
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
        ? classify(st || { room: '' }, r.title || '', [r.product_type, r.vendor].filter(Boolean).join(' '), r.product_type || '')
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
    const dir = capturedDir()
    if (!existsSync(dir)) return new Set()
    return new Set(
      readdirSync(dir)
        .filter(f => f.endsWith('.json'))
        .map(f => f.slice(0, -5))
    )
  } catch { return new Set() }
}

export function readReviewed(key) {
  try {
    const p = join(capturedDir(), key + '.json')
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

  /* THE COUNTERWEIGHT TO THE DRAFT GENERATOR.
     Once a summary file can be produced by one command, "the file
     exists" stops being evidence that anybody read the catalogue —
     which was the entire thing the file was standing for. A named
     reviewer is the smallest honest signal that a person looked, and
     the generator deliberately leaves it blank so the last step is
     always a human one.

     It is not a security control and is not pretending to be. Anybody
     can type a name. The point is that they have to type it, and that
     an unreviewed merchant fails LOUDLY here instead of publishing
     quietly. */
  const summary = readReviewed(st.key)
  if (!summary || !String(summary.reviewedBy || '').trim()) {
    return {
      ok: false,
      why: 'CAPTURE NOT REVIEWED: data/captured/' + st.key + '.json has an empty ' +
           '`reviewedBy`. The draft generator leaves it blank on purpose — fill in ' +
           'who read the catalogue.',
    }
  }
  return { ok: true, why: '' }
}
