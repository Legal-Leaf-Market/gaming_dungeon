/* Tests for the collector.
   ------------------------------------------------------------
   THE FIRST TEST IS THE ONE THAT MATTERS. The assembled program is
   pasted into a stranger's website, so a syntax error in it does not
   fail here, it fails silently on somebody else's shop with no error
   event and no way to tell the difference from "the bookmark is
   broken". Parsing it with `new Function` is the whole point of
   having a test file at all. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { collectorSource } from '../api/collector.js'
import { scanSource } from '../api/_scan.js'

/* Read straight off the functions, so a failure names which one. */
const scanSrc = scanSource.toString()

const { source, build } = collectorSource('https://example.test')
const capSrc = source.slice(source.indexOf('function captureSource'), source.indexOf('function scanSource'))

test('the assembled program parses', () => {
  /* Not executed — there is no DOM here — but a parse failure is the
     failure mode that reaches a merchant's page. */
  assert.doesNotThrow(() => new Function(source))
})

test('no placeholder survives assembly', () => {
  /* A left-behind %%INSTALL%% is a relay tab that opens
     `https://example.test/%%INSTALL%%?receive=1`, which 404s after
     the operator has already done all the capturing work. */
  assert.equal(/%%[A-Z]+%%/.test(source), false,
    'an unreplaced %%TOKEN%% is still in the source')
})

test('the build stamp is a hash of the finished program and appears in it', () => {
  assert.match(build, /^[0-9a-f]{8}$/)
  assert.ok(source.includes(build), 'the panel must be able to print its own build')
})

test('changing the origin changes the build', () => {
  /* Lesson 2: the stamp has to move whenever the program does, or a
     stale self-contained bookmarklet is indistinguishable from a
     current one. A stale reader does not throw; it under-reports. */
  const other = collectorSource('https://other.test')
  assert.notEqual(other.build, build)
})

test('the extractor closes over nothing', () => {
  /* captureSource is serialised with Function.prototype.toString(),
     so any reference to a module-scope binding becomes a
     ReferenceError on the merchant's page. These are the names that
     exist in api/collector.js beside it. */
  const fn = source.slice(source.indexOf('function captureSource'))
  for (const forbidden of ['INGEST_PATH', 'INSTALL_PATH', 'OPERATOR_SOURCE', 'createHash', 'collectorSource']) {
    assert.equal(fn.includes(forbidden), false,
      `the extractor references ${forbidden}, which will not exist when it runs`)
  }
})

test('neither serialised function contains a backtick, comments included', () => {
  /* Caught for real: a prose comment inside scanSource used backticks
     to quote a regex character class. It is inlined into a
     `javascript:` URL and pasted into consoles, so a backtick in a
     COMMENT is as fatal as one in code, and it is far easier to write
     by accident. Asserting on the two functions directly points at
     the offender; the emitted-program check below only says "somewhere". */
  for (const [name, fn] of [['captureSource', capSrc], ['scanSource', scanSrc]]) {
    assert.equal(fn.includes('`'), false, name + ' contains a backtick')
  }
})

test('it is ES5 enough for an old console', () => {
  /* It is pasted into consoles on sites of unknown vintage and
     inlined into a javascript: URL. A backtick is the specific
     hazard: a template literal inside the template literal that
     builds this is a debugging afternoon nobody needs. */
  assert.equal(source.includes('`'), false, 'no backticks in the emitted program')
  assert.equal(/=>/.test(source), false, 'no arrow functions in the emitted program')
})

test('the self-contained bookmarklet still fits a bookmarks bar', () => {
  /* Browsers vary, but a javascript: URL over ~500KB stops being
     draggable in practice. Worth knowing before an operator finds
     out by dragging one. */
  const url = 'javascript:' + encodeURIComponent(source)
  assert.ok(url.length < 500000, `bookmarklet is ${url.length} chars, too long to drag`)
})

test('the ingest path and install path are the real routes', () => {
  assert.ok(source.includes('/api/capture'), 'must post to the capture endpoint')
  assert.ok(source.includes('/collect'), 'must know where the relay tab lives')
})

test('no credential is baked into the program', () => {
  /* The passcode is typed into the panel and used for one request.
     A bookmarklet URL lives in a bookmarks bar in plain sight
     forever, so anything baked in here is published. */
  assert.equal(/ADMIN_PASSCODE\s*=/.test(source), false)
  assert.ok(source.includes('type="password"'), 'the panel must ask for it instead')
})
