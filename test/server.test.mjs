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

  assert.ok(endpoints.length >= 5, 'expected the real endpoints, found ' + endpoints.length)

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
