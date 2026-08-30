/* ============================================================
   /api/admin-stats — the numbers behind /admin. Operator only.
   ------------------------------------------------------------
   Same gate as /api/capture and /api/probe: the `x-gd-admin-token`
   header checked against `ADMIN_PASSCODE`, failing CLOSED when the
   variable is unset. One auth mechanism for this repo, not two.

   Aggregated server-side and never in the browser. The raw table
   is every click on the site; shipping it to the client to count
   there would mean the dashboard downloads the whole event log,
   which is slow and is a far bigger thing to leak if the passcode
   ever escapes. The browser only ever receives totals. See the
   long note above readStats() in _events.js.
   ============================================================ */

import { readStats, dbConfigured } from './_events.js'

const PASS = process.env.ADMIN_PASSCODE || ''

function authed(req) {
  const sent = String(req.headers['x-gd-admin-token'] || '')
  if (!PASS || !sent) return false
  /* Length-independent compare, copied from capture.js so the two
     gates cannot drift into behaving differently. */
  if (sent.length !== PASS.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ PASS.charCodeAt(i)
  return diff === 0
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-gd-admin-token')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  if (!PASS) {
    /* 503 rather than 401: the deployment is misconfigured, which is
       a different thing from the operator typing the wrong passcode,
       and the panel says so instead of looking like a bad password. */
    return res.status(503).json({
      error: 'ADMIN_PASSCODE is not set on this deployment, so the dashboard cannot be opened. ' +
             'Set it in the Vercel project and redeploy.',
    })
  }
  if (!authed(req)) return res.status(401).json({ error: 'Unauthorized' })

  if (!dbConfigured()) {
    return res.status(503).json({
      error: 'DATABASE_URL is not set on this deployment, so nothing is being recorded.',
    })
  }

  try {
    return res.status(200).json(await readStats(req.query && req.query.days))
  } catch (e) {
    /* Surfaced rather than swallowed: the reader is the operator, and
       "the table does not exist yet" needs a different reaction from
       "the query is wrong". */
    return res.status(500).json({ error: String((e && e.message) || e) })
  }
}
