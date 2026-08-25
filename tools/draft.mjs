/* Draft a reviewed-summary file from a capture, and write it.
   ------------------------------------------------------------
     node tools/draft.mjs goretrogame
     npm run draft -- goretrogame

   Needs DATABASE_URL. On Node 20+: `node --env-file=.env tools/draft.mjs <key>`.

   THIS WRITES THE FILE AND STOPS. It does not clear `pending`, and it
   leaves `reviewedBy` empty, so the merchant still publishes nothing
   until a person has read the thing and said so. Both of those are
   the point rather than an omission — see the header of _capture.js.
*/
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { draft } from '../api/_capture.js'
import { classify } from '../api/_scene.js'
import { byKey } from '../api/_stores.js'

const key = (process.argv[2] || '').trim()
if (!key) {
  console.error('\n  usage: node tools/draft.mjs <merchant-key>\n')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('\n  DATABASE_URL is not set. The capture lives in Neon.\n' +
                '  Try: node --env-file=.env tools/draft.mjs ' + key + '\n')
  process.exit(1)
}
if (!byKey(key)) {
  console.error('\n  "' + key + '" is not in the registry (api/_stores.js).\n' +
                '  A capture filed under the wrong key is the failure that gets\n' +
                '  found by a shopper, so this refuses rather than guessing.\n')
  process.exit(1)
}

const file = await draft(key, classify, byKey)
if (!file) {
  console.error('\n  No capture on file for "' + key + '". Scan it from /collect first.\n')
  process.exit(1)
}

const dir = join(process.cwd(), 'data', 'captured')
const path = join(dir, key + '.json')
mkdirSync(dir, { recursive: true })

/* NEVER SILENTLY OVERWRITE A REVIEWED FILE. Re-running this after
   somebody filled in reviewedBy would wipe their reading and reset
   the gate to closed, which reads as "the draft tool is broken"
   rather than as "you just deleted a review". */
if (existsSync(path)) {
  let prev = null
  try { prev = JSON.parse(readFileSync(path, 'utf8')) } catch {}
  if (prev && String(prev.reviewedBy || '').trim()) {
    console.error('\n  ' + path + ' already exists and is REVIEWED by "' +
      prev.reviewedBy + '".\n  Refusing to overwrite it. Delete it deliberately if you' +
      ' mean to re-review.\n')
    process.exit(1)
  }
}

writeFileSync(path, JSON.stringify(file, null, 2) + '\n')

const t = file.productTypes
console.log('\n  ' + (byKey(key).name) + ' — ' + file.capture.products + ' products captured')
if (file.capture.partial) console.log('  \x1b[33mPARTIAL: ' + file.capture.claimedTotal + ' claimed\x1b[0m')
console.log('\n  TYPE                              N   ROOMS')
console.log('  ' + '-'.repeat(66))
for (const a of t.slice(0, 20)) {
  const rooms = Object.entries(a.rooms).map(([r, n]) => r + ' ' + n).join(', ') || '—'
  console.log('  ' + (a.propose === 'include' ? '\x1b[32m+\x1b[0m ' : '\x1b[2m-\x1b[0m ') +
    a.type.slice(0, 30).padEnd(31) + String(a.n).padStart(4) + '   ' + rooms +
    (a.refused ? '  \x1b[33m(' + a.refused + ' refused)\x1b[0m' : ''))
}
console.log('\n  wrote ' + path)
console.log('  \x1b[1mNow: read it, fill in reviewedBy, then clear `pending` in _stores.js.\x1b[0m')
console.log('  An empty reviewedBy publishes nothing.\n')
