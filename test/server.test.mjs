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
    /* Fingerprint the SHOP, not the brand. This asserted on the word
       "GAMING" and broke the day the site was renamed to Verda Store,
       which is a rename failing a routing test: the wrong thing was
       load-bearing. #doors is the map container, it exists on every
       rewrite target by definition, and it survives the next rename. */
    assert.ok(html.includes('id="doors"'), path + ' did not serve index.html')
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

  /* og:image and og:url are absolute -- no unfurler resolves a
     relative one -- so they are not href/src and the sweep above
     misses them entirely. They are the links most likely to rot,
     because the only person who ever sees one resolve is a stranger
     pasting our URL into a chat. */
  for (const f of pages) {
    const html = readFileSync(join(ROOT, 'public', f), 'utf8')
    for (const m of html.matchAll(/<meta property="og:(?:image|url)" content="(https?:[^"]+)"/g)) {
      const path = new URL(m[1]).pathname
      if (!seen.has(path)) seen.set(path, [])
      seen.get(path).push(f + ' (og)')
    }
  }

  assert.ok(seen.has('/manifest.webmanifest'), 'no page links the manifest')
  assert.ok(seen.has('/favicon.ico'), 'no page links favicon.ico')
  assert.ok(seen.has('/assets/og.png'), 'no page names a share card')

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
  assert.equal(mf.name, 'Verda Store')
})

test('no heading is left standing over content that is hidden', async () => {
  /* THE FRONT PAGE SHIPPED "EVERYTHING" OVER AN EMPTY SPACE. app.js
     hid #allGrid when nothing was published, but the heading lives one
     level up in #allShelf, so a visitor got a section title promising
     a shelf with nothing under it -- worse than the empty map above
     it, because the map at least says "not stocked yet" in each door.

     The fix is structural: the heading and the grid are one claim, so
     the SECTION is what gets hidden, and it ships hidden so it cannot
     flash before /api/products answers.

     Asserted against the source rather than a rendered page, because
     there is no DOM in this suite and adding one to check three lines
     of toggling would be the largest dependency in the repo. So it
     pins the three facts that together make the bug impossible. */
  const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8')
  const app = readFileSync(join(ROOT, 'public', 'js', 'app.js'), 'utf8')

  const shelf = /<section[^>]*id="allShelf"[^>]*>([\s\S]*?)<\/section>/.exec(html)
  assert.ok(shelf, 'index.html has no #allShelf section')
  assert.match(shelf[0], /<section[^>]*\bhidden\b/,
    '#allShelf must ship hidden, or EVERYTHING flashes before the fetch lands')
  assert.match(shelf[1], /<h2[^>]*>EVERYTHING<\/h2>/,
    'the heading must live inside the section that gets hidden')

  assert.match(app, /shelf\.hidden = true/, 'app.js must hide the section, not only the grid')
  assert.equal(/\ball\.hidden = true\b/.test(app), false,
    'app.js is hiding only #allGrid again, which leaves the heading orphaned')
})

test('the brand mark in the header is the actual mark', async () => {
  /* It was a 14px violet rounded square for as long as there was no
     logo. There is one now, and a logo that is not the logo is the
     kind of thing everybody sees and nobody files. */
  await boot()
  const css = readFileSync(join(ROOT, 'public', 'css', 'app.css'), 'utf8')
  const rule = /\.brand-mark\{([^}]*)\}/.exec(css)
  assert.ok(rule, 'no .brand-mark rule')
  const url = /url\((\/[^)]+)\)/.exec(rule[1])
  assert.ok(url, '.brand-mark still paints a plain colour instead of the mark')
  assert.equal((await fetch(BASE + url[1])).status, 200, url[1] + ' does not serve')
})

test('the worklist distinguishes captured from published, per row', async () => {
  /* THE CONFUSION THIS COST. Four shops were scraped, the table said
     "302" under a column headed Captured, and nothing on the page said
     a capture publishes nothing. The honest reading of that table was
     "this shop is in", so the reasonable next thought was that the
     site was broken.

     `reviewed` was in the API payload the whole time and was rendered
     only in a summary sentence above the table. A per-row state that
     exists in the data and not in the UI is the same class of bug this
     repo keeps finding: a mechanism that is computed and then thrown
     away. */
  await boot()
  const html = readFileSync(join(ROOT, 'public', 'collect.html'), 'utf8')

  assert.match(html, /NEEDS REVIEW/,
    'a captured-but-unreviewed shop must say so in its own row')
  assert.match(html, /r\.reviewed/,
    'the worklist must render the reviewed flag per row, not only in a summary')
  assert.match(html, /captured but not reviewed/i,
    'the page must say in words that a capture is not a publish')

  /* The API has to keep supplying it. */
  const src = readFileSync(join(ROOT, 'api', 'capture.js'), 'utf8')
  assert.match(src, /reviewed: reviewed\.has\(s\.key\)/,
    '?worklist must keep reporting reviewed per store')
})

test('the Roblox shelf never claims a game is playable here', async () => {
  /* THE ONE GENUINELY DISHONEST THING THIS PAGE COULD DO. The arcade
     already has cabinets that really are playable in the browser. A
     Roblox game is not and cannot be: the browser player was
     discontinued years ago, games run only in the Roblox client, and
     there is no third-party embed product. Presenting the two shelves
     the same way would tell a visitor they can play something they
     cannot.

     So: no iframe anywhere near it, every card says it opens Roblox,
     and the section says so in prose too. */
  await boot()
  const html = readFileSync(join(ROOT, 'public', 'arcade.html'), 'utf8')
  const js = readFileSync(join(ROOT, 'public', 'js', 'hub.js'), 'utf8')

  assert.match(html, /open on Roblox rather than\s+here/i,
    'the section must say the games open elsewhere')
  assert.match(js, /opens roblox/i, 'every cabinet must be labelled as leaving the site')

  assert.equal(/<iframe[^>]+roblox/i.test(html + js), false,
    'a Roblox iframe cannot work and must not be attempted')
  assert.equal(/roblox:\/\//.test(js + html), false,
    'a roblox:// protocol link dies silently without the client installed')
})

test('no place id is ever invented', () => {
  /* An invented affiliate campaign id dies at the network. An
     invented Roblox place id is worse: it RESOLVES, to a stranger's
     game, under our recommendation. So the registry ships zeroes and
     the endpoint refuses to serve a cabinet without a real one. */
  const games = readFileSync(join(ROOT, 'api', '_games.js'), 'utf8')
  const ids = [...games.matchAll(/placeId:\s*(\d+)/g)].map(m => Number(m[1]))
  assert.ok(ids.length, 'the registry should have at least one cabinet')
  for (const id of ids) {
    assert.equal(id, 0,
      'a non-zero placeId is in the registry. If it was pasted from the game\'s own URL, ' +
      'delete this assertion in the same commit and say where it came from.')
  }
  assert.match(games, /configured/, 'a cabinet without an id must be gated, not served')
})

/* ============================================================
   TWO DOMAINS, ONE CANONICAL

   verdacultivation.store and verdastudio.store both resolve here.
   Exactly one may serve content; the other must redirect, or they
   are duplicate content competing for the same ranking signal, which
   robots.txt has carried a warning about since before either domain
   existed.

   The failure this guards is a HALF rename. The canonical address
   lives in one constant and the redirect lives in vercel.json, and
   changing one without the other either resurrects the duplicate or,
   worse, points the redirect at itself and loops every request on
   the live site.
   ============================================================ */
import { SITE as CANON_SITE } from '../tools/sitemap.mjs'

test('the canonical host never redirects to itself', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const host = new URL(CANON_SITE).host
  for (const r of cfg.redirects || []) {
    const on = (r.has || []).find(h => h.type === 'host')
    if (!on) continue
    assert.notEqual(on.value, host,
      'vercel.json redirects the canonical host ' + host + ' away from itself. ' +
      'Every request on the live site would loop.')
  }
})

test('every host-matched redirect lands on the canonical site', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'))
  const hostRules = (cfg.redirects || []).filter(r => (r.has || []).some(h => h.type === 'host'))
  assert.ok(hostRules.length > 0,
    'no host redirect at all: the alternate domain would serve a duplicate of the site')
  for (const r of hostRules) {
    assert.ok(r.destination.startsWith(CANON_SITE),
      'a host redirect points at ' + r.destination + ' but the canonical site is ' +
      CANON_SITE + '. Change SITE and the redirect together.')
  }
})

test('no page still advertises the old deploy URL', () => {
  /* og:url and the sitemap are what a crawler believes. One page left
     on the deploy address is one page telling Google the site lives
     somewhere else. */
  for (const f of ['index.html', 'disclosure.html', 'privacy.html', 'terms.html', 'sitemap.xml']) {
    const html = readFileSync(join(ROOT, 'public', f), 'utf8')
    assert.ok(!html.includes('gaming-dungeon.vercel.app'),
      f + ' still points at the old deploy URL')
  }
})
