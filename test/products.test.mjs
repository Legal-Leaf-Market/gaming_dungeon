/* Tests for the scraper's row shaping.
   ------------------------------------------------------------
   These exist because the de-nicotining removed real behaviour and
   fixed one silent bug, and both are the kind of thing that gets
   quietly reintroduced by somebody copying from a sister site. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { classify } from '../api/_scene.js'

const raw = readFileSync(new URL('../api/products.js', import.meta.url), 'utf8')

/* ASSERT ON CODE, NOT PROSE. The first cut of these tests failed
   three times over on the file's own tombstone comments, which name
   every removed function in order to explain why it was removed.
   A guard that cannot tell "isApparel is back" from "here is why
   isApparel is gone" is a guard that punishes documentation, and the
   documentation is the more valuable half. Comments are stripped. */
const src = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

/* row() is module-private and the file is a Vercel handler, so these
   assert on the source. Crude, but it is the behaviour that matters
   and it names the exact regression. */

test('the nicotine classifiers are gone', () => {
  for (const dead of [
    'guessStrength', 'guessPuffs', 'isTobaccoSnus',
    'SNUS_BRANDS', 'SNUS_WORDS', 'subclassify',
  ]) {
    /* Allowed in prose; a call or a definition is the regression. */
    assert.equal(new RegExp('(function|const|let)\\s+' + dead + '\\b').test(src), false,
      dead + ' is defined again')
    assert.equal(new RegExp('\\b' + dead + '\\s*\\(').test(src), false,
      dead + ' is called again')
  }
})

test('rows no longer carry nicotine fields', () => {
  for (const f of ['strength:', 'puffs:', 'tobacco:', 'nic0:', 'sub:']) {
    assert.equal(src.includes('    ' + f), false, 'row() still emits ' + f)
  }
})

test('isApparel is not reintroduced', () => {
  /* THE ONE MOST LIKELY TO COME BACK. It reads as obviously sensible
     hygiene, and on this site it would delete the Wardrobe room and
     half the Vault: five registered merchants sell nothing but
     apparel, and the Vault stocks keychains, pins and stickers.
     A genuine merch problem gets a per-merchant exclude written from
     that merchant's capture, never a global regex. */
  assert.equal(/function\s+isApparel\b/.test(src), false, 'isApparel is back')
  assert.equal(/\bisApparel\s*\(/.test(src), false, 'isApparel is being called')
})

test('row() drops a product the classifier refuses', () => {
  /* The bug this replaced: `const room = o.room || classify(...)`
     took '' and shipped the row anyway, so the refusal was computed
     and thrown away. A blank room renders and appears under no facet
     — wrong in the way nobody reports. */
  assert.ok(/if \(!room\) return null/.test(src),
    "row() must drop a product whose room is '' ")
})

test('one word for one thing: no `dept` survives', () => {
  assert.equal(/\bdept\b/.test(src), false,
    'products.js, _stores.js and _scene.js must all say `room`')
})

test('the classifier still refuses the things row() now drops', () => {
  /* Ties the two halves together: the source check above proves row()
     honours '', and this proves '' is what these actually produce. */
  const st = { key: 'x', room: 'play' }
  for (const junk of ['Gift Card', 'Route Package Protection', 'Stainless Steel Air Fryer 5L']) {
    assert.equal(classify(st, junk), '', junk + ' should be refused')
  }
})

test('apparel and collectibles are NOT refused', () => {
  /* The other side of the isApparel removal, asserted on the real
     classifier rather than on the absence of a regex. */
  const wardrobe = { key: 'gamingtees', room: 'wardrobe' }
  const vault = { key: 'mazzcomics', room: 'vault' }
  for (const good of ['Retro Gaming T-Shirt', 'Pixel Art Hoodie', 'Kawaii Pastel Skirt']) {
    assert.equal(classify(wardrobe, good), 'wardrobe', good + ' must survive')
  }
  for (const good of ['Enamel Pin Set', 'Vinyl Sticker Pack', 'Acrylic Keychain']) {
    assert.notEqual(classify(vault, good), '', good + ' must survive')
  }
})

/* ------------------------------------------------------------------
   The draft generator, and the counterweight it required.
   ------------------------------------------------------------------ */

import { publishable } from '../api/_capture.js'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('the gate refuses a summary with an empty reviewedBy', async () => {
  /* THE WHOLE REASON THIS TEST EXISTS. Once a summary file can be
     produced by one command, "the file exists" stops being evidence
     that anybody read the catalogue — which is the only thing the
     file was ever standing for. The draft generator leaves reviewedBy
     blank deliberately; this is what makes that blank mean something.

     Not a security control: anybody can type a name. The point is
     that an unreviewed merchant fails LOUDLY rather than publishing
     quietly. */
  const dir = mkdtempSync(join(tmpdir(), 'gd-gate-'))
  const cwd = process.cwd()
  try {
    process.chdir(dir)
    const captured = join(dir, 'data', 'captured')
    const { mkdirSync } = await import('node:fs')
    mkdirSync(captured, { recursive: true })

    const st = { key: 'acme', room: 'play', pending: false }

    writeFileSync(join(captured, 'acme.json'), JSON.stringify({ key: 'acme', reviewedBy: '' }))
    let v = publishable(st, new Set(['acme']))
    assert.equal(v.ok, false, 'blank reviewedBy must not publish')
    assert.match(v.why, /NOT REVIEWED/)

    writeFileSync(join(captured, 'acme.json'), JSON.stringify({ key: 'acme', reviewedBy: '   ' }))
    assert.equal(publishable(st, new Set(['acme'])).ok, false, 'whitespace is not a reviewer')

    writeFileSync(join(captured, 'acme.json'), JSON.stringify({ key: 'acme', reviewedBy: 'jacob' }))
    assert.equal(publishable(st, new Set(['acme'])).ok, true, 'a named reviewer publishes')
  } finally {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pending still beats a reviewed file', () => {
  /* The two halves are independent: `pending` is the editorial
     decision, the file is the factual precondition. Neither one
     overrides the other. */
  const v = publishable({ key: 'acme', room: 'play', pending: true }, new Set(['acme']))
  assert.equal(v.ok, false)
  assert.match(v.why, /PENDING/)
})

test('the draft leaves reviewedBy blank', () => {
  /* Asserted on the source: draft() needs a database to run, and the
     property that matters is a constant in the code rather than
     anything the data could change. */
  const d = readFileSync(new URL('../api/_capture.js', import.meta.url), 'utf8')
  assert.ok(/reviewedBy:\s*''/.test(d),
    'draft() must emit an empty reviewedBy, or the gate above is theatre')
})

/* ------------------------------------------------------------------
   Attribution, and the reviewed summary actually being consumed.
   Both of these were broken in the same way: a mechanism existed,
   looked complete, and nothing called it.
   ------------------------------------------------------------------ */

test('row() builds the tracked link instead of shipping the bare URL', () => {
  /* THE MOST EXPENSIVE BUG IN THE PORT, and invisible by
     construction. buildAff() came across from Nicotia and was never
     called: Nicotia drops attribution from the row and rebuilds it in
     the browser, and both halves of that were removed here. Every
     card linked bare. The link works, the shopper buys, and all 23
     live GoAffPro codes pay nothing.

     Nothing about that fails, errors or looks wrong from outside,
     which is why it gets a test rather than a comment. */
  assert.ok(/url: buildAff\(st, o\.url/.test(src),
    'row() must emit the affiliate URL, not o.url')
})

test('buildAff appends ?ref= for a GoAffPro store', () => {
  /* Reconstructed from source: buildAff is module-private and the
     file is a handler. The three branches that matter are the shape
     of every link this site emits. */
  const fn = src.slice(src.indexOf('function buildAff'), src.indexOf('function isAttributed'))
  assert.ok(/'ref=' \+ st\.ref/.test(fn), 'the GoAffPro branch must append ?ref=')
  assert.ok(/base\.includes\('\?'\) \? '&' : '\?'/.test(fn),
    'a product URL that already has a query must get & rather than a second ?')
  assert.ok(/if \(!st\.ref\) return base/.test(fn),
    'an unattributed store must link direct rather than emitting ?ref=undefined')
})

test('no sister site subId survives', () => {
  /* The impact and cj templates arrived hardcoded to nicotia. Those
     networks are unused here today, so this would have shipped
     mislabelled the first time one was switched on. */
  assert.equal(/nicotia/i.test(src), false, 'a sister site subId is still in the link templates')
})

test('the debug report names an unattributed GoAffPro store', () => {
  /* Roughly half this registry ships with an empty `ref` on purpose.
     On purpose is fine; unnoticed is the Kawaii Katz failure. The
     refresh report is the only place it gets said, and it covered cj
     and impact but not the case that is most of the registry. */
  assert.ok(/empty `ref`/.test(src), 'the no-ref case must be reported')
})

test('the reviewed summary is actually consumed by the ingest', () => {
  /* `include` and `roomMap` are the two decisions a human makes when
     they read a capture. Nothing read them: the draft produced them,
     the README promised the ingest would read them, and the ingest
     did not — so the whole review step was theatre that looked like a
     control. */
  assert.ok(/readReviewed/.test(src), 'products.js must read the summary')
  assert.ok(/rv\.include/.test(src), 'include must gate which product_types ship')
  assert.ok(/rv\.roomMap/.test(src), 'roomMap must be able to override the classifier')
})

test('an empty include means everything, not nothing', () => {
  /* A real choice rather than a missing one: plenty of merchants have
     no product_type taxonomy, and refusing their whole catalogue
     because a field is blank would read as "this shop returns
     nothing" — the exact symptom that is hardest to diagnose. */
  assert.ok(/Array\.isArray\(rv\.include\) && rv\.include\.length/.test(src),
    'an absent or empty include must not filter everything out')
})
