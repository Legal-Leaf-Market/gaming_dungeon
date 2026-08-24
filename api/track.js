/* /api/track — event sink (POST)
   Outbound clicks, add-to-cart, per-store checkout handoffs. Fire and
   forget: always 200, never blocks the shopper. */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false })

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {})
  const hook = process.env.NM_EVENTS_WEBHOOK
  if (!hook) return res.status(200).json({ ok: true, forwarded: false })

  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: String(body.event || 'unknown'),
        store: body.store || '', product: body.product || '',
        value: body.value ?? '', country: body.country || '',
        at: new Date().toISOString(),
      }),
    })
  } catch { /* swallow — analytics must never break the page */ }

  return res.status(200).json({ ok: true, forwarded: true })
}

function safeParse(s) { try { return JSON.parse(s) } catch { return {} } }
