/* Tests for the scanner.
   ------------------------------------------------------------
   THE ROBOTS TESTS ARE THE POINT OF THIS FILE. A decorative
   robots.txt parser is worse than none at all: it lets everybody
   believe the crawl is polite while it walks straight through a
   Disallow. So the rules are exercised against the real shapes —
   wildcards, `$` anchors, and Allow-inside-Disallow, which Shopify
   shops use as a matter of routine. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanSource } from '../api/_scan.js'
import { collectorSource } from '../api/collector.js'

/* The parser and matcher are private to the serialised function, so
   they are reached the way the bookmarklet reaches them: by reading
   the source. This is the same trick the collector itself uses, and
   it means the tests exercise the code that actually ships rather
   than a copy. */
function robotsHarness() {
  const src = scanSource.toString()
  const toRe = src.slice(src.indexOf('function toRe('), src.indexOf('function parseRobots('))
  const parse = src.slice(src.indexOf('function parseRobots('), src.indexOf('/* Longest match wins'))
  const allow = src.slice(src.indexOf('function allowed('), src.indexOf('function delay('))
  return new Function(`
    var robots = { disallow: [], allow: [], delay: 0, present: false }
    ${toRe}
    ${parse}
    ${allow}
    return { parse: parseRobots, allowed: allowed, robots: robots }
  `)()
}

test('a plain Disallow blocks, and everything else passes', () => {
  const h = robotsHarness()
  h.parse('User-agent: *\nDisallow: /checkout\nDisallow: /cart\n')
  assert.equal(h.allowed('/checkout'), false)
  assert.equal(h.allowed('/cart/add'), false)
  assert.equal(h.allowed('/products.json'), true)
  assert.equal(h.allowed('/collections/all'), true)
})

test('rules under another user-agent do not apply to us', () => {
  /* Reading a Googlebot-only block as if it were ours would refuse
     pages we are allowed to read, which fails quietly as a thin
     capture rather than as an error. */
  const h = robotsHarness()
  h.parse('User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /admin\n')
  assert.equal(h.allowed('/products.json'), true)
  assert.equal(h.allowed('/admin'), false)
})

test('wildcards and $ anchors are honoured', () => {
  const h = robotsHarness()
  h.parse('User-agent: *\nDisallow: /collections/*/products\nDisallow: /*.pdf$\n')
  assert.equal(h.allowed('/collections/sale/products'), false)
  assert.equal(h.allowed('/collections/sale'), true)
  assert.equal(h.allowed('/manual.pdf'), false)
  /* The anchor means only a URL ENDING in .pdf is refused. */
  assert.equal(h.allowed('/manual.pdf.html'), true)
})

test('a longer Allow beats a shorter Disallow', () => {
  /* Shopify shops do exactly this: block a broad path, then re-open
     a narrower one inside it. Getting the precedence backwards
     silently halves a catalogue. */
  const h = robotsHarness()
  h.parse('User-agent: *\nDisallow: /collections\nAllow: /collections/all\n')
  assert.equal(h.allowed('/collections/sale'), false)
  assert.equal(h.allowed('/collections/all'), true)
  assert.equal(h.allowed('/collections/all?page=2'), true)
})

test('comments and blank lines do not break the parse', () => {
  const h = robotsHarness()
  h.parse('# hello\n\nUser-agent: *   # everyone\nDisallow: /x   # nope\n')
  assert.equal(h.allowed('/x'), false)
  assert.equal(h.allowed('/y'), true)
})

test('Crawl-delay is read and clamped', () => {
  const h = robotsHarness()
  h.parse('User-agent: *\nCrawl-delay: 2\n')
  assert.equal(h.robots.delay, 2000)
  const h2 = robotsHarness()
  /* A shop asking for a minute a page would hang the panel forever;
     clamped, and the cap plus the stop button cover the rest. */
  h2.parse('User-agent: *\nCrawl-delay: 600\n')
  assert.equal(h2.robots.delay, 10000)
})

test('the scanner closes over nothing', () => {
  /* Serialised into the bookmarklet, so any module-scope reference
     becomes a ReferenceError on the merchant's page. */
  const src = scanSource.toString()
  for (const forbidden of ['INGEST_PATH', 'INSTALL_PATH', 'OPERATOR_SOURCE', 'captureSource', 'createHash']) {
    assert.equal(src.includes(forbidden), false, `scanSource references ${forbidden}`)
  }
})

test('every network call in the scanner goes through get()', () => {
  /* get() is where the cap, the robots check, the throttle and the
     stop flag live. A direct fetch() elsewhere bypasses all four at
     once, on somebody else's shop. robots.txt itself is the sole
     exception, since it is what get() needs in order to decide. */
  const src = scanSource.toString()
  const calls = src.match(/fetch\(/g) || []
  assert.equal(calls.length, 2, 'expected exactly two fetch( sites: get() and robots.txt')
  assert.ok(src.includes("fetch('/robots.txt')"), 'one of them must be robots.txt')
})

test('the assembled bookmarklet still parses and carries both halves', () => {
  const { source } = collectorSource('https://example.test')
  assert.doesNotThrow(() => new Function(source))
  assert.ok(source.includes('/robots.txt'), 'the scanner must be inlined')
  assert.ok(source.includes('gd-scan'), 'the scan button must be inlined')
  assert.equal(/%%[A-Z]+%%/.test(source), false)
})

test('inlining does not corrupt the regex escape in the robots parser', () => {
  /* String.replace expands `$&` in a REPLACEMENT, and the parser
     contains a literal `\\$&`. Passing the source as a replacement
     string rewrote it into the matched text and emitted a program
     that would not parse. Function replacers fixed it; this stops it
     coming back, because the next such fragment might stay
     syntactically valid and ship silently broken. */
  const { source } = collectorSource('https://example.test')
  assert.ok(source.includes("replace(/[.+^${}()|[\\]\\\\?]/g, '\\\\$&')"),
    'the robots escape was mangled during inlining')
})

/* ------------------------------------------------------------------
   WHY A DOOR DID NOT OPEN.

   The scanner used to collapse every failure into one null value, so
   a shop with its feed switched off, a shop returning 403, and a path
   robots.txt forbids all produced the identical outcome: "the scan
   found nothing". Reproduced in a real browser against a fixture whose
   products.json answers 200 with storefront HTML, whose Woo endpoint
   404s and whose sitemap 403s, the operator was told nothing at all.
   These pin each reason to its own words.
   ------------------------------------------------------------------ */

function scanBody() {
  return scanSource.toString()
}

test('every HTTP status an operator has to act on differently is worded differently', () => {
  const src = scanBody()
  const meaning = src.slice(src.indexOf('function meaning('), src.indexOf('function get('))
  const fn = new Function(`${meaning}; return meaning`)()

  /* 402 is the one nobody guesses: a frozen Shopify store, not a
     payment the crawler is being asked for. */
  assert.match(fn(402), /frozen or unpaid/)
  assert.match(fn(403), /refused, not missing/)
  assert.match(fn(401), /refused, not missing/)
  assert.match(fn(404), /no such endpoint/)
  assert.match(fn(429), /rate limited/)
  assert.match(fn(503), /worth one retry/)

  /* A refusal and an absence must never read alike: one means stop,
     the other means try another door. */
  assert.notEqual(fn(403), fn(404))
})

test('a feed that answers with HTML is reported as off, not as missing', () => {
  const src = scanBody()
  assert.match(src, /answered with HTML, not JSON: the feed is off or behind a wall/)
  /* It has to be decided by PARSING, not by the status: the shop
     returns 200 and its own storefront, so the status is fine. */
  assert.match(src, /JSON\.parse\(body\)/)
})

test('an endpoint that answers and is empty is not the same as one that is absent', () => {
  assert.match(scanBody(), /answered, and the shop is empty/)
})

test('the shut doors are reported, so a fruitless scan says which were tried', () => {
  const src = scanBody()
  assert.match(src, /Doors tried: /)
  /* And they travel with the capture, so the reason a merchant
     produced nothing is stored rather than just the zero. */
  assert.match(src, /doors: doors/)
})

test('bot management is read off the page, never probed for', () => {
  const src = scanBody()
  assert.match(src, /Akamai Bot Manager/)
  assert.match(src, /DataDome/)
  /* Read from what the page already set. A probe for a wall would be
     the exact request this is trying to avoid making. */
  assert.match(src, /document\.cookie/)
  assert.ok(!/fetch\((['"])\/(cdn-cgi|_bm)/.test(src), 'must not probe for a wall')
})

test('an empty scan still hands its notes back to the panel', () => {
  const { source } = collectorSource('https://example.test')
  /* The panel returned early on an empty scan and never redrew, so
     every reason the scanner had just worked out was discarded. */
  const branch = source.slice(source.indexOf('if (!res || !res.products.length)'))
  const guard = branch.slice(0, branch.indexOf('res.build = BUILD'))
  assert.match(guard, /redrawCounts\(\)/)
  assert.match(guard, /coverage\.notes/)
  /* But it must NOT adopt the scan's empty product list over a page
     capture that holds real rows. */
  assert.ok(!/capture = res/.test(guard), 'an empty scan must not replace the page capture')
})
