/* ============================================================
   /api/probe — read a candidate merchant's feed and report on it.
   ------------------------------------------------------------
     GET /api/probe?key=<store key>       what this merchant stocks
     GET /api/probe?key=<key>&draft       ...plus the file to commit
     GET /api/probe?keys=a,b,c            several, under a time budget

   ADMIN-GATED, for the same reason /api/capture?report is: what comes
   back is a merchant's whole catalogue in one response, and that is
   not ours to serve to the public. It fails closed when
   ADMIN_PASSCODE is unset.

   IT PUBLISHES NOTHING. The gate is still a committed
   data/captured/<key>.json with a name in `reviewedBy`, and this
   endpoint cannot write one. What it removes is the need to walk a
   Shopify shop by hand to learn what it sells.
   ============================================================ */

import { STORES, byKey } from './_stores.js'
import { classify } from './_scene.js'
import { analyse, reviewNotes, readReviewed } from './_capture.js'
import { readShopify, summarise } from './_probe.js'

const PASS = process.env.ADMIN_PASSCODE || ''

function authed(req) {
  const sent = String(req.headers['x-gd-admin-token'] || '')
  if (!PASS || !sent) return false
  if (sent.length !== PASS.length) return false
  let diff = 0
  for (let i = 0; i < sent.length; i++) diff |= sent.charCodeAt(i) ^ PASS.charCodeAt(i)
  return diff === 0
}

/* Vercel's maxDuration for this function, less room to serialise. A
   sweep that runs over is a 504 with nothing in it, which is worse
   than a partial answer that says it is partial. */
const BUDGET_MS = 50000

async function probeOne(st, deadline) {
  if (st.platform !== 'shopify') {
    return {
      key: st.key, name: st.name, domain: st.domain,
      ok: false,
      error: `platform is "${st.platform}", and this reads Shopify feeds only. ` +
             'Walk it with the bookmarklet from /collect instead.',
    }
  }

  const read = await readShopify(st)
  if (!read.ok) {
    return {
      key: st.key, name: st.name, domain: st.domain,
      ok: false,
      error: read.error,
      /* The two that actually happen, named, because "HTTP 403" on its
         own sends people to check their own code first. */
      hint: /403|HTML/.test(read.error)
        ? 'The feed is blocked at the edge or switched off. This one needs the bookmarklet.'
        : undefined,
    }
  }

  const rep = summarise(read.rows)
  const { analysis, include, roomMap } = analyse(read.rows, st, classify)
  const refused = analysis.reduce((n, a) => n + a.refused, 0)

  return {
    key: st.key, name: st.name, domain: st.domain, room: st.room,
    ok: true,
    pagesRead: read.pages,
    ...rep,
    /* The single number worth reading first. A merchant most of whose
       catalogue _scene.js refuses is a merchant who is mostly off
       scene -- which is a reason to drop them, not a reason to widen
       the classifier. */
    offScene: refused,
    offScenePct: read.rows.length ? Math.round((refused / read.rows.length) * 100) : 0,
    productTypeAnalysis: analysis,
    proposed: { include, roomMap },
    alreadyReviewed: !!readReviewed(st.key),
    notes: [...rep.notes, ...read.notes],
    timedOut: Date.now() > deadline,
  }
}

function draftFile(p) {
  return {
    key: p.key,
    /* EMPTY ON PURPOSE. publishable() refuses a blank one, and that is
       the only thing stopping this endpoint from being a way to
       publish 53 merchants nobody read. */
    reviewedBy: '',
    reviewedOn: new Date().toISOString().slice(0, 10),
    source: 'products.json read server-side by /api/probe',
    capture: {
      products: p.products,
      pagesRead: p.pagesRead,
      inStock: p.inStock,
      priceRange: p.priceRange,
      unpriced: p.unpriced,
      withoutImage: p.withoutImage,
      offScene: p.offScene,
      notes: p.notes,
    },
    productTypes: p.productTypeAnalysis,
    include: p.proposed.include,
    roomMap: p.proposed.roomMap,
    readThisBeforeCommitting: reviewNotes(
      p.offScenePct >= 50
        ? `${p.offScenePct}% of this catalogue is off scene. Read the sample titles before ` +
          'including anything: a merchant who is mostly not for us is a merchant to drop, ' +
          'not a reason to widen _scene.js.'
        : null),
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-gd-admin-token')
  res.setHeader('Cache-Control', 'no-store')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })

  if (!PASS) {
    return res.status(503).json({
      error: 'ADMIN_PASSCODE is not set on this deployment. This fails closed on purpose: ' +
             'what this returns is a merchant\'s whole catalogue.',
    })
  }
  if (!authed(req)) return res.status(401).json({ error: 'bad passcode' })

  const q = req.query || {}
  const wanted = String(q.keys || q.key || '').split(',').map(s => s.trim()).filter(Boolean)
  if (!wanted.length) {
    return res.status(400).json({
      error: 'nothing asked for',
      usage: {
        'GET ?key=<key>': 'read one merchant\'s feed and report on it',
        'GET ?key=<key>&draft': 'the same, plus the data/captured/<key>.json to commit',
        'GET ?keys=a,b,c': 'several, stopping when the time budget runs out',
      },
      keys: STORES.map(s => s.key),
    })
  }

  const deadline = Date.now() + BUDGET_MS
  const results = []
  const skipped = []
  for (const k of wanted) {
    const st = byKey(k)
    if (!st) { results.push({ key: k, ok: false, error: 'no such store key' }); continue }
    /* Stop rather than start something that cannot finish. A truncated
       read reported as a complete one is the bug this whole endpoint
       exists to prevent somebody making by hand. */
    if (Date.now() > deadline) { skipped.push(k); continue }
    results.push(await probeOne(st, deadline))
  }

  const out = { ok: true, probed: results.length, results }
  if (skipped.length) {
    out.skipped = skipped
    out.skippedWhy = 'the time budget ran out. Ask for these in a second call rather than ' +
      'assuming they have no feed.'
  }
  if ('draft' in q) {
    out.drafts = results.filter(r => r.ok).map(r => ({
      path: 'data/captured/' + r.key + '.json',
      file: draftFile(r),
    }))
  }
  return res.status(200).json(out)
}
