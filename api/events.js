/* ============================================================
   /api/events — the event sink. Public, unauthenticated, 204.
   ------------------------------------------------------------
   ALWAYS 204, EVEN WHEN IT FAILS. Nothing a visitor does should
   get worse because analytics broke. A 500 here shows up in the
   console of a shopper who did nothing wrong, and on a beacon
   sent during page unload it is a retry nobody wants. So a
   database outage silently drops events, the same way kvPut()
   in _db.js refuses to fail a request over a cache write.

   The cost is real and worth naming: if Neon is down for an
   hour, that hour is missing from /admin with nothing to mark
   it. Read a sudden flat spot as a possible outage before
   reading it as a drop in traffic.

   ------------------------------------------------------------
   AN OPEN ENDPOINT THAT WRITES ROWS
   ------------------------------------------------------------
   Anyone can POST here, so everything is clamped: a cap on
   events per request, a cap on string lengths, and an
   allow-list on the name. Without the allow-list a script could
   fill the table with invented names and /admin would render
   them as though they were real features of the site.

   Deliberately NOT rate limited by IP. See the note in
   _events.js: limiting by IP means holding an IP, and the whole
   design of that table is that it holds nothing identifying.
   ============================================================ */

import { EVENT_NAMES, dbConfigured, insertEvents, maybeSweep, str } from './_events.js'

const MAX_EVENTS = 40

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'POST only' })
  }

  /* A beacon sends a Blob, so the body may arrive already parsed
     or as a raw string depending on the content type the browser
     chose. Handle both rather than assuming. */
  let body = req.body
  if (typeof body === 'string') {
    try { body = JSON.parse(body) } catch { body = null }
  }

  const raw = body && Array.isArray(body.events) ? body.events.slice(0, MAX_EVENTS) : []
  const rows = []
  for (const e of raw) {
    const o = e || {}
    const name = str(o.name, 40)
    const sid = str(o.sid, 40)
    if (!name || !sid || !EVENT_NAMES.has(name)) continue
    rows.push({
      sid,
      name,
      path: str(o.path),
      productId: str(o.productId),
      vendor: str(o.vendor, 80),
      cat: str(o.cat, 40),
      meta: str(o.meta),
    })
  }

  if (!rows.length || !dbConfigured()) return res.status(204).end()

  try {
    await insertEvents(rows)
    await maybeSweep()
  } catch {
    /* fail open: see the note at the top */
  }
  return res.status(204).end()
}
