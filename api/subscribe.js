/* /api/subscribe — email capture (POST)
   Mirrors Legal-Leaf's endpoint. Fails soft: with no webhook configured
   it still returns 200 so the front end never shows an error to a
   shopper over a missing env var. */

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' })

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {})
  const email = String(body.email || '').trim()
  const name = String(body.name || '').trim()

  if (!email || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ ok: false, error: 'Valid email required' })
  }

  const hook = process.env.NM_CRM_WEBHOOK
  if (!hook) return res.status(200).json({ ok: true, stored: false })

  try {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email, name,
        country: body.country || '', region: body.region || '',
        source: 'nicotia-market', at: new Date().toISOString(),
      }),
    })
    return res.status(200).json({ ok: true, stored: true })
  } catch (e) {
    // Never lose the signup over a webhook hiccup.
    return res.status(200).json({ ok: true, stored: false, note: e.message })
  }
}

function safeParse(s) { try { return JSON.parse(s) } catch { return {} } }
