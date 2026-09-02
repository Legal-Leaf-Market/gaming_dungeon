/* ============================================================
   test/monochrome.test.mjs — the site has no colour, and this is
   what keeps it that way.

   The owner's instruction on 2026-09-02 was one line repeated four
   ways: "zero color on the website... I don't wanna see any color."
   The accompanying brief is stricter than "make it grayscale" and
   names the failure mode it is worried about:

     NO color. No accent colors. No hidden tinting. No warm or cool
     palette shifts beyond grayscale. Use black, white and gray only.

   WHY THIS NEEDS A TEST RATHER THAN A NOTE. Every other rule in this
   repo that came back came back the same way -- one plausible edit at
   a time -- and a palette is the most plausible of all of them. Nobody
   reintroduces "the colour scheme". Somebody picks #f2efe4 for a paper
   because flat grey looks clinical, or #1b1815 for an ink because it
   is warmer, and both of those are three unequal channels, and the
   site has a colour temperature again. That is precisely the "hidden
   tinting" the brief rules out, and it is invisible in a diff.

   This repo has a whole file of scars that begin "nothing errored".
   A drifting palette does not error either.

   WHAT IS IN SCOPE: every value that reaches a browser as a colour --
   hex literals and rgb()/rgba() triples in the stylesheets, the
   generated scene and map SVGs, the brand mark, the pages' own inline
   styles, the client JS and the two data files that carry the realm
   bands.

   WHAT IS NOT: comments. Half the explanation of how this site got
   here quotes the colours it used to have, and a guard that forbade
   naming #7fd0b0 in a paragraph about why #7fd0b0 is gone would make
   the reasoning unwritable. So every file is read with its comments
   stripped, the same posture test/copy.test.mjs takes for the same
   reason.

   COLOUR KEYWORDS ARE IN SCOPE TOO, because `red` is exactly the edit
   somebody makes in a hurry, and it does not look like a hex.
   ============================================================ */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = join(ROOT, 'public')

/* ------------------------------------------------------------
   The subject list is READ FROM DISK, never enumerated.

   CLAUDE.md's standing rule, earned by the opacity test that derived
   its own subject list from the flag it was checking: deleting the
   flag removed the file from the test instead of failing it. A guard
   that can be silenced by deleting something is not a guard.

   So this walks the directories. A new stylesheet is in scope the
   moment it exists, and the only way to take one out of scope is to
   add it to SKIP below, in writing, with a reason.
   ------------------------------------------------------------ */
const SKIP = new Set([
  /* The vendored Chromium offline game, kept with its own licence.
     It is somebody else's source and we do not restyle it; it is
     reached only from a cabinet the visitor has to open. */
  'arcade/dino/index.html',
  'arcade/dino/index.js',
])

function walk (dir, base = '') {
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? base + '/' + e.name : e.name
    if (e.isDirectory()) { out.push(...walk(join(dir, e.name), rel)); continue }
    if (!['.css', '.svg', '.html', '.js', '.webmanifest'].includes(extname(e.name))) continue
    if (SKIP.has(rel)) continue
    out.push(rel)
  }
  return out
}

/* Comments out, so prose may name a colour it is explaining. The
   three syntaxes are stripped in one pass rather than three, because
   a `/* *​/` inside an HTML comment and an `<!--` inside a CSS
   comment both exist in this repo's headers. */
function stripComments (src, ext) {
  let s = src.replace(/<!--[\s\S]*?-->/g, ' ')
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ')
  if (ext === '.js' || ext === '.mjs') s = s.replace(/(^|[^:"'`\\])\/\/[^\n]*/g, '$1 ')
  return s
}

const HEX = /#([0-9a-fA-F]{3,8})\b/g
const RGB = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g
/* Every CSS named colour that is not a grey. `transparent`,
   `currentColor`, `black`, `white` and the greys are all fine. */
const NAMED = new RegExp('(?<![-\\w])(' + [
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue',
  'chartreuse', 'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson',
  'cyan', 'darkblue', 'darkcyan', 'darkgoldenrod', 'darkgreen', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred',
  'darksalmon', 'darkseagreen', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gold', 'goldenrod', 'green', 'greenyellow', 'honeydew', 'hotpink',
  'indianred', 'indigo', 'ivory', 'khaki', 'lavender', 'lawngreen', 'lemonchiffon',
  'lightblue', 'lightcoral', 'lightgreen', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumspringgreen', 'mediumturquoise', 'midnightblue',
  'mintcream', 'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive',
  'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod', 'palegreen',
  'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
  'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown',
  'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'skyblue', 'slateblue', 'springgreen', 'steelblue', 'tan', 'teal',
  'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'yellow', 'yellowgreen',
].join('|') + ')(?![-\\w])', 'gi')

/* Two things look like colours and are not, and both are all over
   this repo:

     SVG FRAGMENT IDS. The canopy plates define every blossom once and
     place it with <use>, so they are thousands of `id="f20"` and
     `url(#f20)` -- which is a valid three-digit hex and is not a
     colour. Stripped by shape, not by file, so a real `fill="#f20"`
     in the same document would still be caught.

     JS IDENTIFIERS. tools/branding.mjs holds `const violet` and
     `const gold` from two dead themes, both of which now contain
     greys; api and client code have `gold:` and `red:` as object
     keys. A bare word is only a colour in CSS-ish syntax, so the
     keyword list is applied to stylesheets, SVG and markup, and in
     script only to quoted strings. */
function stripRefs (s) {
  return s
    .replace(/\bid\s*=\s*"[^"]*"/g, ' ')
    .replace(/url\(\s*#[^)]*\)/g, ' ')
    .replace(/\b(?:xlink:)?href\s*=\s*"#[^"]*"/g, ' ')
}

function chromatic (src, ext) {
  const s = stripRefs(stripComments(src, ext))
  const bad = []
  for (const m of s.matchAll(HEX)) {
    let v = m[1]
    if (v.length === 3) v = v.split('').map(c => c + c).join('')
    if (v.length !== 6 && v.length !== 8) continue
    const [r, g, b] = [v.slice(0, 2), v.slice(2, 4), v.slice(4, 6)].map(h => h.toLowerCase())
    if (r !== g || g !== b) bad.push(m[0])
  }
  for (const m of s.matchAll(RGB)) {
    if (m[1] !== m[2] || m[2] !== m[3]) bad.push(m[0] + ')')
  }
  const script = ext === '.js' || ext === '.mjs'
  const words = script
    /* only inside quoted strings, where a bare word can reach CSS */
    ? [...s.matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)].map(m => m[1] ?? m[2]).join('\n')
    : s
  for (const m of words.matchAll(NAMED)) bad.push(m[0])
  return bad
}

test('nothing that reaches a browser carries a hue', () => {
  const files = walk(PUBLIC)
  assert.ok(files.length >= 20,
    `expected the site's stylesheets, pages and generated art; found ${files.length}`)

  const offenders = []
  for (const rel of files) {
    const bad = chromatic(readFileSync(join(PUBLIC, rel), 'utf8'), extname(rel))
    if (bad.length) offenders.push(`${rel}: ${[...new Set(bad)].slice(0, 6).join(' ')}`)
  }
  assert.deepEqual(offenders, [],
    'colour is back on the site. Every value that reaches a browser must have ' +
    'three equal channels -- see the head of public/css/tokens.css:\n  ' +
    offenders.join('\n  '))
})

test('the sources that GENERATE art carry no hue either', () => {
  /* The scene, the map, the icons and the share card are all built by
     tools/, so a hue put back in a generator is a hue in ten committed
     files the next time anybody runs it. Catching it in the SVG only
     is catching it one build too late, and only if somebody rebuilds. */
  const dir = join(ROOT, 'tools')
  const offenders = []
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
    const bad = chromatic(readFileSync(join(dir, f), 'utf8'), '.mjs')
    if (bad.length) offenders.push(`tools/${f}: ${[...new Set(bad)].slice(0, 6).join(' ')}`)
  }
  /* api/_scene.js holds the realm bands and public/js/app.js mirrors
     them; both are already covered above for app.js, and _scene.js is
     server-side so it is named here. */
  /* api/_scene.js holds the realm bands. api/collector.js is the
     bookmarklet's own panel: it is injected into a MERCHANT's page
     rather than served from ours, which is exactly why it gets
     forgotten -- it never appears in a screenshot of this site. It is
     still our interface and an operator still looks at it, so it is
     held to the same rule. It arrived from Nicotia in that site's
     purple and kept it through two redesigns for want of anybody
     scanning it. */
  for (const rel of ['api/_scene.js', 'api/collector.js']) {
    const bad = chromatic(readFileSync(join(ROOT, rel), 'utf8'), '.js')
    if (bad.length) offenders.push(`${rel}: ${[...new Set(bad)].slice(0, 6).join(' ')}`)
  }

  assert.deepEqual(offenders, [], 'a generator would put colour back:\n  ' + offenders.join('\n  '))
})

test('the realm bands are a value ladder, and both copies of it agree', () => {
  /* Hue used to carry the realms and value now does, so the ladder is
     no longer decoration: it is the ONLY thing distinguishing realm 1
     from realm 10 on a door. Three things can break it and all three
     are silent -- the two copies drifting apart, the ladder losing its
     order, or a band going lighter than the wash it sits on. */
  const grab = (src) => {
    const out = {}
    for (const m of src.matchAll(/key:'([a-z-]+)'[\s\S]{0,160}?realm:\s*(\d+),\s*band:'(#[0-9a-f]{6})'/g)) {
      out[m[1]] = { realm: Number(m[2]), band: m[3] }
    }
    return out
  }
  const server = grab(readFileSync(join(ROOT, 'api', '_scene.js'), 'utf8'))
  const client = grab(readFileSync(join(PUBLIC, 'js', 'app.js'), 'utf8'))
  assert.equal(Object.keys(server).length, 10, 'expected ten rooms server-side')

  for (const [key, v] of Object.entries(server)) {
    assert.ok(client[key], `${key} is on the server's map and not the browser's`)
    assert.equal(client[key].band, v.band,
      `${key}'s band disagrees between api/_scene.js and public/js/app.js`)
  }

  const lum = h => parseInt(h.slice(1, 3), 16)  /* neutral, so any channel is the value */
  const rows = Object.values(server).sort((a, b) => a.realm - b.realm)
  for (let i = 1; i < rows.length; i++) {
    assert.ok(lum(rows[i].band) > lum(rows[i - 1].band),
      `realm ${rows[i].realm} is not lighter than realm ${rows[i - 1].realm}: ` +
      'the ladder has to ascend or it says nothing')
  }
  /* And it must stay ON the sheet. A band lighter than --wash is a
     door nobody can see, which is the failure the old palette could
     not have (every hue was mid-value by construction). */
  const tokens = readFileSync(join(PUBLIC, 'css', 'tokens.css'), 'utf8')
  const wash = /--wash:\s*#([0-9a-f]{2})/i.exec(tokens)
  assert.ok(wash, '--wash is gone, so there is nothing to measure the ladder against')
  const ceiling = parseInt(wash[1], 16)
  for (const r of rows) {
    assert.ok(lum(r.band) < ceiling,
      `realm ${r.realm}'s band ${r.band} is lighter than --wash: invisible on paper`)
  }
})

test('the art library is greyscale, and the transparent half reads as ink', () => {
  /* The delivered library arrived as light marks drawn for a near-
     black page. On paper a light mark is not there, and it fails
     silently -- CLAUDE.md 8c, written up the first time it happened.
     So the check is not only "no colour" but "the right way up".

     WebP has no decoder here and the repo has one dependency, so this
     reads the container rather than the pixels: it asserts the files
     exist at the names the CSS uses, which is the failure that would
     take a room's art off the page entirely. The pixel check is done
     at conversion time and recorded in the commit. */
  const art = join(PUBLIC, 'art')
  const css = readFileSync(join(PUBLIC, 'css', 'art.css'), 'utf8')
  const named = [...css.matchAll(/url\(\/art\/([a-z0-9-]+\.webp)\)/g)].map(m => m[1])
  assert.ok(named.length >= 14, `art.css names only ${named.length} files`)
  for (const f of new Set(named)) {
    assert.ok(existsSync(join(art, f)), `art.css asks for /art/${f} and it is not there`)
  }
})
