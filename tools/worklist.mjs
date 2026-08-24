/* What still needs capturing. Reads the registry and data/captured/
   directly, so it works with no server and no network — which is the
   point: the answer to "what should I do next" should not require a
   deploy to be healthy. */
import { STORES, isAttributed } from '../api/_stores.js'
import { reviewedKeys } from '../api/_capture.js'

const reviewed = reviewedKeys()
const rows = STORES.map(s => ({ ...s, captured: reviewed.has(s.key), attributed: isAttributed(s) }))
const todo = rows.filter(r => !r.captured)

/* Attributed first: a capture on one of those can go live and start
   earning the day it is reviewed. Then by cookie window, longest
   first, because that is the order the whole registry sorts in. */
todo.sort((a, b) =>
  (b.attributed - a.attributed) || ((b.cookie || 0) - (a.cookie || 0)) || a.name.localeCompare(b.name))

console.log(`\n  ${rows.length - todo.length} of ${rows.length} captured. ${todo.length} to go.\n`)
console.log('  ATTR  COOKIE  ROOM           MERCHANT')
console.log('  ' + '-'.repeat(72))
for (const r of todo) {
  console.log(
    '  ' + (r.attributed ? ' ok ' : '  - ') +
    String(r.cookie || 0).padStart(6) + 'd  ' +
    r.room.padEnd(14) + ' ' + r.name +
    (r.domain ? '  \x1b[2m' + r.domain + '\x1b[0m' : ''))
}
console.log('\n  Capture them from /collect. Then write data/captured/<key>.json.\n')
