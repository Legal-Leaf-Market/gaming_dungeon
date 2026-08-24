/* ============================================================
   /api/capture — where a capture lands, and where you read it back.
   ------------------------------------------------------------
     POST /api/capture              store one page's capture
     GET  /api/capture?report=<key> what that merchant actually stocks
     GET  /api/capture?worklist     what still needs capturing

   THE PASSCODE IS THE WHOLE OF THE AUTH, AND IT FAILS CLOSED.
   `ADMIN_PASSCODE` unset returns 503 rather than allowing writes,
   which is the same posture every sister site settled on after
   learning the other way round. Herbal-Leaf's guide records the
   version of this bug that mattered: before its RPC split, any page
   on the internet could email the member list.

   The passcode is typed into the collector's panel, in the tab where
   the capture happens, and used for one request. It is NEVER in the
   bookmarklet URL, which lives in a bookmarks bar in plain sight
   forever, and never on /collect, which anybody can load.
   ============================================================ */

import { STORES, isAttributed } from './_stores.js'
import { merge, readCapture, report, reviewedKeys, kvConfigured } from './_capture.js'

const PASS = process.env.ADMIN_PASSCODE || ''

function authed(req) {
  const sent = String(req.headers['x-gd-admin-token'] || '')
  if (!PASS || !sent) return false
  /* Length-independent compare is overkill against a human typing
     into a panel, but it costs one line and removes the question. */
  if (sent.length !== PASS.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ PASS.charCodeAt(i)
  return diff === 0
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body
  let raw = ''
  for await (const chunk of req) raw += chunk
  try { return JSON.parse(raw || '{}') } catch { return null }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-gd-admin-token')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()

  /* ------------------------------------------------------ POST */
  if (req.method === 'POST') {
    if (!PASS) {
      return res.status(503).json({
        error: 'ADMIN_PASSCODE is not set on this deployment, so captures cannot be accepted. ' +
               'This fails closed on purpose.',
      })
    }
    if (!authed(req)) return res.status(401).json({ error: 'bad passcode' })

    const body = await readBody(req)
    if (!body) return res.status(400).json({ error: 'body was not JSON' })

    const out = await merge(body.merchantKey, body.capture)
    return res.status(out.ok ? 200 : 422).json(out)
  }

  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })

  const q = req.query || {}

  /* ------------------------------------------- GET ?worklist
     PUBLIC ON PURPOSE, AND IT CARRIES NOTHING PRIVATE. It answers
     one question — which merchants still need somebody to open them
     in a browser — and that is exactly the question the operator
     wants answered from their phone while standing somewhere else.

     Rates, cookie windows and affiliate codes are NOT in it. Those
     are in _stores.js, which never reaches a browser. */
  if ('worklist' in q) {
    const reviewed = reviewedKeys()
    const rows = STORES.map(s => ({
      key: s.key,
      name: s.name,
      room: s.room,
      domain: s.domain,
      captured: reviewed.has(s.key),
      attributed: isAttributed(s),
      pending: !!s.pending,
    }))
    const todo = rows.filter(r => !r.captured)
    return res.status(200).json({
      ok: true,
      captureStore: kvConfigured() ? 'configured' : 'NOT CONFIGURED — set KV_REST_API_URL and KV_REST_API_TOKEN',
      total: rows.length,
      captured: rows.length - todo.length,
      remaining: todo.length,
      /* The order to work in. Attributed merchants first because a
         capture on one of those can go live and start earning the
         day it is reviewed; the rest are equally worth capturing but
         nothing is waiting on them. */
      next: todo.slice().sort((a, b) => (b.attributed ? 1 : 0) - (a.attributed ? 1 : 0)),
      rows,
    })
  }

  /* -------------------------------------------- GET ?report=<key>
     GATED. A raw capture is the merchant's whole catalogue sitting in
     one JSON response, which is a different thing from a worklist and
     is not ours to serve to the public. */
  const key = String(q.report || '').trim()
  if (key) {
    if (!PASS) return res.status(503).json({ error: 'ADMIN_PASSCODE is not set' })
    if (!authed(req)) return res.status(401).json({ error: 'bad passcode' })

    const box = await readCapture(key)
    if (!box) {
      return res.status(404).json({
        error: 'no capture on file for "' + key + '". Capture it from /collect first.',
      })
    }
    const r = report(box)

    /* THE LINE THE OPERATOR SHOULD READ FIRST. A partial capture
       looks exactly like a small catalogue, so it is said in words
       at the top rather than left to be inferred from two numbers
       further down. */
    return res.status(200).json({
      ok: true,
      readThisFirst: r.coverageNote ||
        'Coverage looks complete for the pages captured. Confirm the merchant has no rooms ' +
        'you did not walk before writing an include list from this.',
      nextStep: 'When this looks right, write the summary to data/captured/' + key + '.json and ' +
        'commit it. That file is the publish gate; clearing `pending` alone does nothing.',
      ...r,
    })
  }

  return res.status(400).json({
    error: 'nothing asked for',
    usage: {
      'POST /api/capture': 'store a capture (x-gd-admin-token header)',
      'GET /api/capture?worklist': 'what still needs capturing (public)',
      'GET /api/capture?report=<key>': 'what a merchant stocks (x-gd-admin-token header)',
    },
  })
}
