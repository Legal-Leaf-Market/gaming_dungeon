/* ============================================================
   /api/roblox — the games hub's live data.
   ------------------------------------------------------------
   Public: it carries nothing private, and a player count is
   published information on the game's own page.

   THREE CALLS, IN ORDER, because Roblox splits what we need across
   three services and each one takes a different id:

     placeId  -> universeId   apis.roblox.com/universes/v1/places/{id}/universe
     universe -> details      games.roblox.com/v1/games?universeIds=
     universe -> thumbnail    thumbnails.roblox.com/v1/games/multiget/thumbnails

   SERVER-SIDE BECAUSE IT HAS TO BE. Roblox does not send CORS headers
   a browser will accept, so a fetch from the page fails; this is not
   a preference about where to put the logic.

   IT DEGRADES TO A LINK, NEVER TO AN ERROR. These endpoints are
   semi-documented and rate limited, and the hub is worth having when
   they are down: a cabinet with a name and a working link is most of
   the value, and a live player count is the garnish. So every fetch
   is wrapped, `live` says whether the numbers are real, and a failed
   lookup still returns the cabinet.
   ============================================================ */

import { CABINETS, configured, gameUrl } from './_games.js'
import { kvGet, kvPut } from './_db.js'

const UA = 'VerdaStoreHub/1.0 (+https://gaming-dungeon.vercel.app)'
const KEY = 'gd:roblox:v1'
/* Player counts move; visit counts do not. Five minutes is short
   enough that "playing now" is not a lie and long enough that a busy
   day does not put us into a rate limit. */
const TTL_MS = 5 * 60 * 1000

async function json(url, ms = 8000) {
  const ctl = new AbortController()
  const t = setTimeout(() => ctl.abort(), ms)
  try {
    const r = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: ctl.signal })
    if (!r.ok) return null
    return await r.json()
  } catch {
    return null
  } finally {
    clearTimeout(t)
  }
}

async function universeIds(cabs) {
  const out = new Map()
  for (const c of cabs) {
    const d = await json('https://apis.roblox.com/universes/v1/places/' + Number(c.placeId) + '/universe')
    const id = d && d.universeId
    if (id) out.set(c.key, id)
  }
  return out
}

async function live(cabs) {
  const ids = await universeIds(cabs)
  if (!ids.size) return { rows: new Map(), ok: false }

  const list = [...ids.values()].join(',')
  const [details, thumbs] = await Promise.all([
    json('https://games.roblox.com/v1/games?universeIds=' + list),
    json('https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=' + list +
         '&countPerUniverse=1&size=768x432&format=Png&isCircular=false'),
  ])

  const byUniverse = new Map()
  for (const d of (details && details.data) || []) byUniverse.set(d.id, d)
  const thumbFor = new Map()
  for (const t of (thumbs && thumbs.data) || []) {
    const first = (t.thumbnails || [])[0]
    if (first && first.state === 'Completed' && first.imageUrl) thumbFor.set(t.universeId, first.imageUrl)
  }

  const rows = new Map()
  for (const [key, uid] of ids) {
    const d = byUniverse.get(uid)
    rows.set(key, {
      universeId: uid,
      playing: d ? d.playing : null,
      visits: d ? d.visits : null,
      maxPlayers: d ? d.maxPlayers : null,
      creator: d && d.creator ? d.creator.name : null,
      /* The game's own name and description win over ours when they
         are there: they are what the player will see one click later,
         and a hub that disagrees with the page it links to is worse
         than one that says less. */
      name: d ? d.name : null,
      description: d ? d.description : null,
      thumb: thumbFor.get(uid) || null,
    })
  }
  return { rows, ok: byUniverse.size > 0 }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method !== 'GET') return res.status(405).json({ error: 'method not allowed' })

  const ready = CABINETS.filter(configured)
  const waiting = CABINETS.filter(c => !configured(c))

  /* NOTHING CONFIGURED IS AN ANSWER, NOT AN EMPTY LIST. The page
     needs to distinguish "the hub is empty because nobody has pasted
     a place id" from "the hub is empty because Roblox is down", and
     those look identical from a bare [] . */
  if (!ready.length) {
    return res.status(200).json({
      ok: true,
      cabinets: [],
      waiting: waiting.map(c => ({ key: c.key, name: c.name, ours: !!c.ours })),
      why: 'No cabinet has a place id yet. Paste each game\'s id into api/_games.js — it is the ' +
           'number in roblox.com/games/<PLACE ID>/<name>. Nothing is guessed here on purpose: an ' +
           'invented id resolves to a stranger\'s game under our recommendation.',
    })
  }

  let payload = null
  const cached = await kvGet(KEY)
  if (cached) {
    try {
      const c = JSON.parse(cached)
      if (c && Date.now() - c.at < TTL_MS) payload = c.payload
    } catch { /* a corrupt cache is a cache miss */ }
  }

  if (!payload) {
    const { rows, ok } = await live(ready)
    payload = {
      live: ok,
      cabinets: ready.map(c => {
        const r = rows.get(c.key) || {}
        return {
          key: c.key,
          name: r.name || c.name,
          blurb: c.blurb,
          ours: !!c.ours,
          url: gameUrl(c),
          placeId: Number(c.placeId),
          creator: r.creator || null,
          playing: typeof r.playing === 'number' ? r.playing : null,
          visits: typeof r.visits === 'number' ? r.visits : null,
          thumb: r.thumb || null,
        }
      }),
    }
    /* Cached even when the lookup failed, briefly, so a Roblox outage
       does not turn every page load into three more timing-out
       requests. The `live:false` in the payload is what the page
       reads to stop claiming the numbers are current. */
    await kvPut(KEY, JSON.stringify({ at: Date.now(), payload }), 60 * 60)
  }

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
  return res.status(200).json({
    ok: true,
    ...payload,
    waiting: waiting.map(c => ({ key: c.key, name: c.name, ours: !!c.ours })),
  })
}
