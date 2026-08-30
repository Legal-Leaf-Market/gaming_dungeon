/* ============================================================
   _events.js — what visitors actually do here.
   ------------------------------------------------------------
   PORTED FROM Kawaii Katz (lib/site-events.ts + /api/events +
   /api/admin/stats), which is where the model was proven. The
   shape of the table is IDENTICAL to that site's `site_events`,
   for the same reason `kv` matches Herbal Leaf's (see _db.js):
   two sites that may one day share a database should not need a
   reconciliation first.

   ------------------------------------------------------------
   WHY THIS EXISTS WHEN VERCEL ANALYTICS IS ALREADY ON
   ------------------------------------------------------------
   They answer different questions and only one of them is about
   the shelf.

     Vercel Web Analytics   how many people came, from where, to
                            which URL. Traffic. It knows nothing
                            about a product or a merchant.
     THIS                   which products, which merchants,
                            which rooms, and where a visit stops.

   Only the second can answer "build another room like that one
   or not", because only the second records the shape of a visit
   rather than its existence.

   ------------------------------------------------------------
   OUR CLICKS ARE NOT THEIR SALES
   ------------------------------------------------------------
   Worth stating here because every number downstream is bounded
   by it. This site never takes payment. The furthest thing we
   can observe is `outbound_click`, the moment somebody leaves
   for a maker's shop. That moment is the GOAL — it is the only
   event here that can earn anything — and it is also the last
   one we can see. Whether the visit turned into a sale lives in
   the merchant's affiliate dashboard and nowhere else.

   `/admin` says so on the page rather than letting a reader
   assume otherwise.

   ------------------------------------------------------------
   THE PRIVACY CEILING IS THE DESIGN, NOT A SETTING
   ------------------------------------------------------------
   `sid` is a random value in sessionStorage. It dies with the
   tab, is never sent anywhere else, and cannot follow a person
   between visits or across devices. No IP, no cookie, no
   account, no fingerprint. It exists so a funnel can tell one
   visit's steps from another's, which is the minimum that makes
   "where does a visit stop" answerable at all.

   That is also why /api/events is NOT rate limited by IP:
   limiting by IP means holding an IP, and a padded table is a
   cheaper problem than a log of who visited. The clamps below
   (name allow-list, length caps, per-request cap) bound the
   damage instead, and retention clears it either way.
   ============================================================ */

import { q, dbConfigured } from './_db.js'

/** How long events are kept. A season, and bounded. */
export const RETAIN_DAYS = 120

/* The vocabulary. A closed list, because an open one means a
   typo becomes a row nobody notices is missing from the
   dashboard rather than something that fails loudly. Every name
   here is emitted by /js/events.js; nothing else is stored. */
export const EVENT_NAMES = new Set([
  /* where people are */
  'page_view',
  'room_view',
  'shop_view',
  /* interest, in ascending order of intent */
  'card_zoom',
  'save_add',
  'save_remove',
  /** The money event. The last thing we can see before a maker's shop takes over. */
  'outbound_click',
  /* finding things */
  'search',
  'search_zero',
  'filter_set',
  'sort_set',
  /* the arcade, which sells nothing and is measured anyway */
  'arcade_open',
  'arcade_play',
])

export { dbConfigured }

/* ------------------------------------------------------------
   The table is created on demand, like everything else here.
   _db.js's q() runs its own ensureSchema() first and hands us
   the tagged-template client, so this rides along rather than
   editing that file's table list.
   ------------------------------------------------------------ */
let ready = null
async function ensureEvents() {
  if (ready) return ready
  ready = (async () => {
    await q(s => s`
      CREATE TABLE IF NOT EXISTS site_events (
        id         text PRIMARY KEY,
        ts         timestamptz NOT NULL DEFAULT now(),
        sid        text NOT NULL,
        name       text NOT NULL,
        path       text,
        product_id text,
        vendor     text,
        cat        text,
        meta       text
      )`)
    await q(s => s`CREATE INDEX IF NOT EXISTS site_events_ts_idx ON site_events (ts)`)
    await q(s => s`CREATE INDEX IF NOT EXISTS site_events_name_ts_idx ON site_events (name, ts)`)
    await q(s => s`CREATE INDEX IF NOT EXISTS site_events_sid_idx ON site_events (sid)`)
    await q(s => s`CREATE INDEX IF NOT EXISTS site_events_product_idx ON site_events (product_id)`)
    return true
  })().catch(e => { ready = null; throw e })
  return ready
}

const MAX_LEN = 200

/** Trim, cap, and turn an empty string into null so COUNT ignores it. */
export function str(v, max = MAX_LEN) {
  if (typeof v !== 'string') return null
  const s = v.trim().slice(0, max)
  return s || null
}

function rid() {
  /* randomUUID exists in the Vercel node runtime; the fallback is
     for a local `node --test` where the global may be absent. */
  try { return globalThis.crypto.randomUUID() } catch {
    return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  }
}

/**
 * Write a batch. Returns how many rows landed.
 *
 * Inserts one row at a time through the tagged template rather
 * than building a multi-row VALUES list by hand: a batch here is
 * at most 40 rows arriving on a beacon, and hand-assembled SQL
 * is how an injection gets in through the one endpoint on this
 * site that anybody can POST to.
 */
export async function insertEvents(list) {
  if (!dbConfigured() || !list.length) return 0
  await ensureEvents()
  let n = 0
  for (const e of list) {
    await q(s => s`
      INSERT INTO site_events (id, sid, name, path, product_id, vendor, cat, meta)
      VALUES (${rid()}, ${e.sid}, ${e.name}, ${e.path}, ${e.productId},
              ${e.vendor}, ${e.cat}, ${e.meta})`)
    n++
  }
  return n
}

/**
 * Retention, swept opportunistically rather than on a cron.
 *
 * This repo has no scheduler and adding one for a DELETE is more
 * moving parts than the problem deserves. Roughly one request in
 * two hundred sweeps, which bounds the table without putting a
 * delete in the hot path of every beacon. At zero traffic the
 * table stops growing anyway, so a sweep that never fires costs
 * nothing.
 */
export async function maybeSweep() {
  if (Math.random() > 1 / 200) return
  try {
    await q(s => s`DELETE FROM site_events WHERE ts < now() - interval '1 day' * ${RETAIN_DAYS}`)
  } catch { /* a failed sweep is not worth a log line on a beacon */ }
}

const num = v => Number(v ?? 0)

/**
 * Everything /admin renders, aggregated HERE and never in the browser.
 *
 * The raw table is every click on the site. Shipping it to the
 * client and counting there would mean the dashboard downloads
 * the whole event log: slow, and a much bigger thing to leak if
 * the passcode ever escapes. The browser only ever receives
 * totals.
 *
 * EVERY FUNNEL STEP COUNTS DISTINCT sid, NOT EVENTS. A funnel
 * counted in events lies: one person setting six filters and
 * clicking nothing looks like six steps of engagement. Counting
 * sessions means each visit contributes at most one to each step
 * and the gap between steps is a gap in people. The consequence
 * to hold on to when reading it: a session is a TAB, so one
 * person over two visits is two sessions. Good for shape, wrong
 * for "how many humans", and nothing here claims the latter.
 */
export async function readStats(days) {
  await ensureEvents()
  const d = [1, 7, 30, 90].includes(Number(days)) ? Number(days) : 7

  const [totals, byName, topProducts, topStores, topRooms, searches, zeroSearches, daily, funnel] =
    await Promise.all([
      q(s => s`
        SELECT count(DISTINCT sid)                                        AS sessions,
               count(*) FILTER (WHERE name = 'page_view')                 AS views,
               count(*) FILTER (WHERE name = 'outbound_click')            AS outbound,
               count(DISTINCT sid) FILTER (WHERE name = 'outbound_click') AS outbound_sessions,
               count(*) FILTER (WHERE name = 'save_add')                  AS saves,
               count(*) FILTER (WHERE name = 'arcade_play')               AS arcade
        FROM site_events WHERE ts >= now() - interval '1 day' * ${d}`),

      q(s => s`
        SELECT name, count(*) AS c, count(DISTINCT sid) AS s
        FROM site_events WHERE ts >= now() - interval '1 day' * ${d}
        GROUP BY name ORDER BY c DESC`),

      /* Ranked by the furthest thing we can observe, never by views. */
      q(s => s`
        SELECT product_id, max(vendor) AS vendor, max(cat) AS cat,
               count(*) FILTER (WHERE name = 'outbound_click') AS clicks,
               count(*) FILTER (WHERE name = 'card_zoom')      AS zooms,
               count(*) FILTER (WHERE name = 'save_add')       AS saves
        FROM site_events
        WHERE ts >= now() - interval '1 day' * ${d} AND product_id IS NOT NULL
        GROUP BY product_id
        ORDER BY clicks DESC, saves DESC LIMIT 40`),

      q(s => s`
        SELECT vendor,
               count(*) FILTER (WHERE name = 'outbound_click') AS clicks,
               count(*) FILTER (WHERE name = 'save_add')       AS saves,
               count(DISTINCT product_id)                      AS products
        FROM site_events
        WHERE ts >= now() - interval '1 day' * ${d} AND vendor IS NOT NULL
        GROUP BY vendor ORDER BY clicks DESC, saves DESC LIMIT 25`),

      /* A room is this site's section. `meta` carries the room key
         on room_view, which is why it is not derived from `path`:
         every room rewrites to "/" (see vercel.json), so the path
         is the same string for all nine of them. */
      q(s => s`
        SELECT coalesce(meta, '(map)') AS room,
               count(*) FILTER (WHERE name = 'room_view')      AS views,
               count(DISTINCT sid)                             AS sessions,
               count(*) FILTER (WHERE name = 'outbound_click') AS clicks
        FROM site_events
        WHERE ts >= now() - interval '1 day' * ${d} AND name IN ('room_view','outbound_click')
        GROUP BY 1 ORDER BY views DESC LIMIT 25`),

      q(s => s`
        SELECT meta AS term, count(*) AS c
        FROM site_events
        WHERE ts >= now() - interval '1 day' * ${d} AND name = 'search' AND meta IS NOT NULL
        GROUP BY meta ORDER BY c DESC LIMIT 25`),

      /* Searches that returned nothing are the most actionable list
         on the page: each one is a thing somebody expected to find
         here and a room or a merchant that might be worth adding. */
      q(s => s`
        SELECT meta AS term, count(*) AS c
        FROM site_events
        WHERE ts >= now() - interval '1 day' * ${d} AND name = 'search_zero' AND meta IS NOT NULL
        GROUP BY meta ORDER BY c DESC LIMIT 25`),

      q(s => s`
        SELECT to_char(date_trunc('day', ts), 'YYYY-MM-DD')     AS day,
               count(DISTINCT sid)                              AS sessions,
               count(*) FILTER (WHERE name = 'outbound_click')  AS clicks
        FROM site_events WHERE ts >= now() - interval '1 day' * ${d}
        GROUP BY 1 ORDER BY 1`),

      q(s => s`
        SELECT count(DISTINCT sid)                                          AS visited,
               count(DISTINCT sid) FILTER (WHERE name = 'room_view')        AS opened_room,
               count(DISTINCT sid) FILTER (WHERE name = 'outbound_click')   AS reached_shop,
               count(DISTINCT sid) FILTER (WHERE name = 'search')           AS searched,
               count(DISTINCT sid) FILTER (WHERE name = 'search_zero')      AS searched_zero
        FROM site_events WHERE ts >= now() - interval '1 day' * ${d}`),
    ])

  const t = (totals && totals[0]) || {}
  const f = (funnel && funnel[0]) || {}

  return {
    days: d,
    totals: {
      sessions: num(t.sessions), views: num(t.views), outbound: num(t.outbound),
      outboundSessions: num(t.outbound_sessions), saves: num(t.saves), arcade: num(t.arcade),
    },
    byName: (byName || []).map(r => ({ name: r.name, count: num(r.c), sessions: num(r.s) })),
    topProducts: (topProducts || []).map(r => ({
      productId: r.product_id, vendor: r.vendor || '', cat: r.cat || '',
      clicks: num(r.clicks), zooms: num(r.zooms), saves: num(r.saves),
    })),
    topStores: (topStores || []).map(r => ({
      vendor: r.vendor, clicks: num(r.clicks), saves: num(r.saves), products: num(r.products),
    })),
    topRooms: (topRooms || []).map(r => ({
      room: r.room, views: num(r.views), sessions: num(r.sessions), clicks: num(r.clicks),
    })),
    searches: (searches || []).map(r => ({ term: r.term, count: num(r.c) })),
    zeroSearches: (zeroSearches || []).map(r => ({ term: r.term, count: num(r.c) })),
    daily: (daily || []).map(r => ({ day: r.day, sessions: num(r.sessions), clicks: num(r.clicks) })),
    funnels: [
      {
        key: 'browse',
        title: 'Map to maker',
        note:
          'Coverage, not a strict pipeline: a visit can reach a shop from search without ' +
          'opening a room. The last step is the goal. Whether any of them bought is only ' +
          'visible in the merchant’s affiliate dashboard, never here.',
        steps: [
          { label: 'Visited', sessions: num(f.visited) },
          { label: 'Opened a room', sessions: num(f.opened_room) },
          /* `goal` marks the step that is the POINT of the funnel
             rather than another rung on it, so the dashboard draws
             it as a win. Without it a drop-off note lands under the
             outbound step and reads as a leak, which is exactly
             backwards: leaving for a maker is the only thing here
             that can earn. */
          { label: 'Reached a shop', sessions: num(f.reached_shop), goal: true },
        ],
      },
      {
        key: 'search',
        title: 'Search',
        note: 'A strict pipeline. The zero-result terms below are the list worth reading.',
        steps: [
          { label: 'Searched', sessions: num(f.searched) },
          { label: 'Got nothing back', sessions: num(f.searched_zero) },
        ],
      },
    ],
  }
}
