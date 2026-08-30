/* ============================================================
   test/copy.test.mjs — the two house rules about shipped words

   Both of these have been fixed on this site before and both came
   back, which is the definition of something that wants a test
   rather than a note.

   NO EM DASHES IN COPY. A house rule across all four sites. It is
   invisible in a diff, nobody notices it in review, and it arrives
   one `&mdash;` at a time.

   THE WORKSHOP DOES NOT TALK IN FRONT OF THE CUSTOMER. A public page
   named a source file and told the reader which line to paste an id
   into. The site had already been cleaned of exactly this once (see
   the four-states note in app.js): the earlier version printed the
   repo directory captures land in and a build command. The maintainer
   is standing in the file; the visitor is standing in the shop.

   WHAT THIS DOES NOT CHECK is comments. A source comment is written
   for whoever opens the file and may say anything, including both of
   the above; only the text that reaches a browser is in scope. So
   HTML is read with its comments stripped, and JS is checked only
   inside string literals.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

/* collect.html is the OPERATOR CONSOLE and its whole audience is
   whoever maintains this, so neither rule below applies to it.

   NAMED, NOT INFERRED. The first version of this exemption read the
   page's robots meta, on the reasoning that an operator page is
   noindex. It is, and so is arcade.html, which is noindex for a
   completely different reason (it is waiting on a game author's
   sign-off before it gets advertised) and has real visitors reaching
   it from the header. That inference silently exempted the exact
   page this test was written for, and the mutation run is the only
   reason it did not ship that way. noindex means "do not crawl",
   never "nobody reads it".

   A second operator page should be added here deliberately, which is
   the point of it being a list. */
const OPERATOR_PAGES = new Set(['collect.html'])
const PAGES = readdirSync(PUBLIC)
  .filter(f => f.endsWith('.html'))
  .filter(f => !OPERATOR_PAGES.has(f))
const SCRIPTS = readdirSync(join(PUBLIC, 'js')).filter(f => f.endsWith('.js'))

/* Comments out, and <style>/<script> blocks with them: a CSS or JS
   comment inside a page is no more visitor-facing than one in a
   file of its own. */
function visibleHtml (src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
}

/* Every single-, double- and back-quoted literal in a script. Rough
   by design: it over-collects (a regex body, a key name) and never
   under-collects, and over-collecting only makes the guard stricter
   about text that was never going to reach a reader anyway. */
function literals (src) {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ')
  return (bare.match(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g) || []).join('\n')
}

const EM = /—|&mdash;|&#8212;|&#x2014;/i

for (const page of PAGES) {
  test(`${page} ships no em dash`, () => {
    const text = visibleHtml(readFileSync(join(PUBLIC, page), 'utf8'))
    const hit = text.split('\n').findIndex(l => EM.test(l))
    assert.equal(hit, -1,
      `${page} line ${hit + 1} has an em dash in copy: use a comma, a colon or ` +
      `parentheses.\n  ${(text.split('\n')[hit] || '').trim().slice(0, 120)}`)
  })
}

for (const js of SCRIPTS) {
  test(`js/${js} ships no em dash in any string it prints`, () => {
    const text = literals(readFileSync(join(PUBLIC, 'js', js), 'utf8'))
    /* grid.js prints an em dash as the "no price" placeholder, on
       purpose and documented: it is a typographic mark standing in
       for a missing number, not a dash in a sentence. */
    const lines = text.split('\n').filter(l => !/^['"`]—['"`]$/.test(l.trim()))
    const hit = lines.findIndex(l => EM.test(l))
    assert.equal(hit, -1,
      `js/${js} has an em dash in a string: ${(lines[hit] || '').trim().slice(0, 120)}`)
  })
}

test('no page tells a visitor to edit a source file', () => {
  /* The tells, and each one is a thing that was actually on the page:
     a repo-relative path, an instruction to paste, an editor verb
     aimed at the reader. */
  const TELLS = [
    /\bapi\/_?[a-z]+\.js\b/i,
    /\bpublic\/(js|css|assets)\//i,
    /\bnpm run\b/i,
    /\bpaste .{0,24}\b(id|key|token)\b/i,
    /see the note at the top of/i,
  ]
  for (const page of PAGES) {
    const text = visibleHtml(readFileSync(join(PUBLIC, page), 'utf8'))
    for (const t of TELLS) {
      assert.ok(!t.test(text),
        `${page} says "${(text.match(t) || [''])[0]}" to a visitor. That is a note for ` +
        `whoever maintains this, and it belongs in the file they will be standing in.`)
    }
  }
})

test('the arcade empty state is written for a visitor, not a maintainer', () => {
  /* This one is served from the API rather than the page, so the
     guard above cannot see it, and it is the exact string that was
     being printed under "No cabinets yet". */
  const src = readFileSync(join(ROOT, 'api', 'roblox.js'), 'utf8')
  const why = /why:\s*((?:'(?:[^'\\]|\\.)*'\s*\+?\s*)+)/.exec(src)
  assert.ok(why, 'api/roblox.js no longer has a `why` for the empty shelf')
  const text = why[1]
  assert.ok(!/_games\.js|npm run|paste/i.test(text),
    'the empty-shelf message names a source file or tells the reader to edit one: ' + text)
})
