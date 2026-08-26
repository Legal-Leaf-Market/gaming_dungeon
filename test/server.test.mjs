/* Boots the real dev server and probes it.
   ------------------------------------------------------------
   THIS TEST EXISTS BECAUSE THE DEV SERVER WAS BROKEN FOR THE WHOLE
   LIFE OF THE PROJECT AND NOTHING SAID SO. It carried a hand-written
   map of Nicotia's three endpoints, so /api/capture and /api/collector
   -- the two the entire capture workflow runs on -- returned 404
   locally while working fine in production.

   Every other test in this repo reads source or calls a function.
   None of them would have caught it, because the bug was not in any
   function: it was in the wiring, and wiring is only testable by
   running the thing. So this one starts the server.
*/

import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const PORT = 3100 + Math.floor(Math.random() * 400)
const BASE = 'http://127.0.0.1:' + PORT

let child
async function boot() {
  if (child) return
  child = spawn(process.execPath, ['server.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  /* Wait for the port rather than sleeping a fixed amount: a fixed
     sleep is either slow or flaky, and usually becomes both. */
  const deadline = Date.now() + 15000
  for (;;) {
    try {
      await fetch(BASE + '/', { signal: AbortSignal.timeout(500) })
      return
    } catch {
      if (Date.now() > deadline) throw new Error('dev server did not start')
      await new Promise(r => setTimeout(r, 150))
    }
  }
}

after(() => { if (child) child.kill() })

test('every api/*.js endpoint is reachable in dev', async () => {
  /* THE REGRESSION THIS FILE IS FOR. The set is read from disk, so
     adding an endpoint extends the test automatically — which is the
     same property that fixed the bug: a hand-maintained list on
     either side is a list that goes stale. */
  await boot()
  const endpoints = readdirSync(join(ROOT, 'api'))
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .map(f => '/api/' + f.slice(0, -3))

  /* Named, not counted. The first version asserted `length >= 5` and
     broke the moment two dead endpoints were legitimately deleted --
     a guard whose only repair is bumping a number teaches people to
     bump the number. These three are the ones the site cannot work
     without, so name them; the loop below still covers whatever else
     is in api/. */
  for (const must of ['/api/products', '/api/capture', '/api/collector']) {
    assert.ok(endpoints.includes(must), must + ' is missing from api/')
  }

  for (const path of endpoints) {
    const r = await fetch(BASE + path)
    assert.notEqual(r.status, 404, path + ' 404s in dev but exists in api/')
    assert.notEqual(r.status, 500, path + ' threw in dev')
  }
})

test('underscore helpers are NOT served, matching Vercel', async () => {
  /* _stores.js holds commission rates and rejection reasons. Vercel
     excludes `_`-prefixed files from becoming functions; if dev did
     not, dev would serve our paperwork and nobody would notice
     because production is fine. */
  await boot()
  for (const f of readdirSync(join(ROOT, 'api')).filter(f => f.startsWith('_'))) {
    const r = await fetch(BASE + '/api/' + f.replace(/\.js$/, ''))
    assert.equal(r.status, 404, '/api/' + f + ' must not be served')
  }
})

test('room URLs from vercel.json all serve the dungeon', async () => {
  /* The rewrites are read from vercel.json rather than restated here,
     so this checks the parsing rather than a second copy of the list. */
  await boot()
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  for (const r of cfg.rewrites) {
    const path = r.source.replace(/:(\w+)/g, 'sample')
    const res = await fetch(BASE + path)
    assert.equal(res.status, 200, path + ' should rewrite to the app')
    const html = await res.text()
    assert.ok(html.includes('GAMING'), path + ' did not serve index.html')
  }
})

test('the API map is not hand-written', () => {
  /* The shape of the original bug, asserted directly: a literal route
     string in server.mjs means somebody re-introduced a list that has
     to be kept in step with the directory. */
  const src = readFileSync(join(ROOT, 'server.mjs'), 'utf8')
  assert.ok(/readdir\(join\(ROOT, "api"\)\)/.test(src),
    'API routes must be discovered from disk')
  assert.equal(/"\/api\/(products|capture|collector|track|subscribe)"\s*:/.test(src), false,
    'a hardcoded /api/... route is back in server.mjs')
})

test('the sitemap lists exactly the routes that serve, and nothing noindex', async () => {
  /* A sitemap is a third list to keep in step with vercel.json and
     public/, and this repo has been bitten twice by exactly that kind
     of drift. Here the failure is a crawler sent to a 404, which
     nobody on the team ever sees. So the file is generated, and this
     checks the generated file against the running server. */
  await boot()
  const { routes } = await import('../tools/sitemap.mjs')
  const xml = readFileSync(join(ROOT, 'public', 'sitemap.xml'), 'utf8')

  /* Parse the URL rather than regexing a path out of it — the first
     attempt matched the `//` in `https://` and reported a stale
     sitemap that was in fact correct. */
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname)
  assert.deepEqual(listed.sort(), routes().sort(),
    'public/sitemap.xml is stale — run `npm run sitemap`')

  for (const path of listed) {
    const r = await fetch(BASE + path)
    assert.equal(r.status, 200, path + ' is in the sitemap but does not serve')
    const html = await r.text()
    assert.equal(/name=["']robots["'][^>]*noindex/i.test(html), false,
      path + ' is noindex but is listed in the sitemap')
  }
})

test('robots.txt and the sitemap do not contradict each other', () => {
  /* Pre-launch robots blocks everything, so it must NOT also advertise
     a sitemap: "crawl nothing, here is a list of things to crawl" is
     the kind of contradiction Search Console reports as an error and
     a human reads straight past. */
  const robots = readFileSync(join(ROOT, 'public', 'robots.txt'), 'utf8')
  const active = robots.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'))
  const blocksAll = active.some(l => /^Disallow:\s*\/\s*$/i.test(l.trim()))
  const advertises = active.some(l => /^Sitemap:/i.test(l.trim()))
  assert.equal(blocksAll && advertises, false,
    'robots.txt blocks everything AND advertises a sitemap')
})

test('the disclosure page is reachable and linked from the front page', async () => {
  /* An affiliate site that does not disclose is the one compliance
     problem here with teeth outside our own codebase. A page nothing
     links to is a page nobody reads. */
  await boot()
  assert.equal((await fetch(BASE + '/disclosure')).status, 200)
  const home = await (await fetch(BASE + '/')).text()
  assert.ok(home.includes('/disclosure'), 'the front page must link the disclosure')
})

test('the three policy pages serve and cross-link each other', async () => {
  /* A policy page nothing links to is a page nobody reads, and the
     affiliate disclosure is the one obligation here with teeth
     outside our own codebase. */
  await boot()
  const pages = ['/disclosure', '/privacy', '/terms']
  for (const p of pages) {
    const r = await fetch(BASE + p)
    assert.equal(r.status, 200, p + ' does not serve')
    const html = await r.text()
    for (const other of pages.filter(x => x !== p)) {
      assert.ok(html.includes('href="' + other + '"'), p + ' must link ' + other)
    }
  }
  const home = await (await fetch(BASE + '/')).text()
  for (const p of pages) assert.ok(home.includes('href="' + p + '"'), 'the front page must link ' + p)
})

test('the privacy policy does not describe things the site does not do', () => {
  /* THE POINT OF WRITING IT LAST. A boilerplate policy that mentions
     cookies we do not set or a newsletter we do not run is not
     harmless padding — it is a false statement about our own conduct,
     and it is the kind that survives for years because nobody
     re-reads a policy page.

     Two dead endpoints were deleted rather than documented while this
     was written: /api/subscribe accepted email addresses and
     forwarded them to a webhook named after a sister site, and
     nothing on this site called it. A public PII intake nobody uses
     is a liability, not an asset. */
  const priv = readFileSync(join(ROOT, 'public', 'privacy.html'), 'utf8')
  const claimsNoCookies = /set no cookies/i.test(priv)
  assert.ok(claimsNoCookies, 'the policy should say we set no cookies')

  const pages = readdirSync(join(ROOT, 'public')).filter(f => f.endsWith('.html'))
  const js = readdirSync(join(ROOT, 'public', 'js')).filter(f => f.endsWith('.js'))
  const all = [...pages.map(f => join(ROOT, 'public', f)),
               ...js.map(f => join(ROOT, 'public', 'js', f))]
    .map(f => readFileSync(f, 'utf8')).join('\n')

  assert.equal(/document\.cookie\s*=/.test(all), false,
    'something sets a cookie but the privacy policy says we set none')
  for (const tracker of ['gtag(', 'googletagmanager', 'plausible.io', 'fathom', 'hotjar']) {
    assert.equal(all.includes(tracker), false,
      tracker + ' is present but the privacy policy says there is no analytics')
  }

  /* The one storage key the policy names, asserted to be the only one
     and to be the key it actually names. */
  const keys = [...all.matchAll(/localStorage\.(?:get|set)Item\(\s*["']([^"']+)/g)].map(m => m[1])
  assert.deepEqual([...new Set(keys)], ['gd_arcade_invaders'],
    'the privacy policy names exactly one storage key; the code disagrees')
  assert.ok(priv.includes('gd_arcade_invaders'), 'the policy must name the key it stores')
})

test('no endpoint accepts personal data', () => {
  /* /api/subscribe took an email and forwarded it to NM_CRM_WEBHOOK.
     Nothing called it, and a public unauthenticated email intake is a
     spam relay waiting for somebody to set the env var. Deleted, and
     this stops it coming back by copy-paste from a sister site. */
  const api = readdirSync(join(ROOT, 'api')).filter(f => f.endsWith('.js'))
  for (const f of api) {
    const src = readFileSync(join(ROOT, 'api', f), 'utf8')
    assert.equal(/body\.email\b/.test(src), false, f + ' reads an email address')
  }
})

test('every local file the pages link to actually serves', async () => {
  /* THE FAVICON CLASS OF BUG, CLOSED FOR GOOD. A <link> pointing at a
     file that is not there does not error, does not warn and does not
     show up in any log we read: the tab just keeps the browser's
     default glyph, or the home-screen icon comes out blank, on a
     device nobody here owns.

     Read out of the pages rather than listed, so a link added later
     is covered without anybody remembering this test exists. */
  await boot()
  const pages = readdirSync(join(ROOT, 'public')).filter(f => f.endsWith('.html'))
  const seen = new Map()

  for (const f of pages) {
    const html = readFileSync(join(ROOT, 'public', f), 'utf8')
    for (const m of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      const url = m[1]
      /* Rewrites and clean URLs are already covered by their own
         test; this one is about files. */
      if (!/\.[a-z0-9]+$/i.test(url)) continue
      if (!seen.has(url)) seen.set(url, [])
      seen.get(url).push(f)
    }
  }

  assert.ok(seen.has('/manifest.webmanifest'), 'no page links the manifest')
  assert.ok(seen.has('/favicon.ico'), 'no page links favicon.ico')

  for (const [url, from] of seen) {
    const r = await fetch(BASE + url)
    assert.equal(r.status, 200, url + ' is linked from ' + from.join(', ') + ' but does not serve')
  }
})

test('the manifest serves as a manifest, not as a download', async () => {
  /* Content-Type is the whole of it. Served as octet-stream the
     browser does not parse it, no install prompt ever appears, and
     nothing anywhere says so — the feature is simply absent. Vercel
     needs telling too; there is a header rule in vercel.json beside
     the one for the sitemap. */
  await boot()
  const r = await fetch(BASE + '/manifest.webmanifest')
  assert.equal(r.status, 200)
  assert.match(r.headers.get('content-type') || '', /application\/manifest\+json/,
    'the dev server is guessing a type for .webmanifest')

  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const rule = (cfg.headers || []).find(h => h.source === '/manifest.webmanifest')
  assert.ok(rule, 'vercel.json has no Content-Type rule for the manifest, so production will guess')
  assert.ok(rule.headers.some(h => h.key === 'Content-Type' && /manifest\+json/.test(h.value)))

  const mf = await r.json()
  assert.equal(mf.name, 'Gaming Dungeon')
})
