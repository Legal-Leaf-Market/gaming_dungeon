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
