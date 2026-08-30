/* Generate public/sitemap.xml from the routes that actually exist.
   ------------------------------------------------------------
     npm run sitemap

   TWO SOURCES, BOTH REAL, NEITHER RESTATED HERE:

     vercel.json   the room URLs, read from the rewrites
     public/*.html the standalone pages, read from disk

   A hand-written sitemap is a third list to keep in step with the
   other two, and this repo has now been bitten twice by exactly that
   -- server.mjs's API map, and the /api/capture usage block. A
   sitemap that drifts is worse than most drift, because the failure
   is a crawler being sent to a 404 and nobody on the team ever
   seeing it.

   A PAGE THAT SAYS noindex IS NEVER LISTED. That is read out of the
   file's own meta tag rather than from a list here, so /collect and
   /arcade cannot be added back by accident: the page's own head is
   the authority on whether it wants to be indexed. Listing a noindex
   page in a sitemap is a direct contradiction, and Google reports it
   as an error rather than guessing which one you meant.
*/
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/* THE SITE'S ADDRESS, WRITTEN DOWN ONCE. Two domains point here,
   verdacultivation.store and verdastudio.store, and exactly one of
   them can be canonical: two hostnames serving identical content is
   duplicate content, split ranking signal and a canonical mess that
   is far more work to unpick than to prevent. verdastudio.store
   redirects to this one in vercel.json, so the pair never compete.

   FLIPPED TO verdastudio.store once the brand artwork arrived: the
   site is Verda Studio, so it belongs at the studio's address, and
   verdacultivation.store is the game's. Costless to change right now
   because robots.txt still blocks indexing, so no crawler has formed
   an opinion about either host yet. It gets expensive the day
   indexing opens; do it before then or not at all.

   To swap which is canonical, change this line and the redirect in
   vercel.json together, then re-run `npm run sitemap`. Changing one
   without the other creates a loop. */
export const SITE = process.env.SITE_URL || 'https://verdastudio.store'

/* Does the file behind this path ask not to be indexed? One reader,
   used by both loops below.

   IT USED TO BE USED BY ONLY ONE OF THEM, and that was a real hole
   rather than a tidiness point: standalone pages were checked and
   rewrites were added unconditionally, so the first rewrite pointing
   at a noindex page listed it. /admin found that the day it was
   added. A rewrite is a pretty name for a file, and the file is still
   the authority on whether it wants to be indexed. */
function noindexed(root, file) {
  try {
    const html = readFileSync(join(root, 'public', file), 'utf8')
    return /name=["']robots["'][^>]*noindex/i.test(html)
  } catch {
    /* No such file: the rewrite points at something generated or at
       nothing. Not this function's business to decide, and "cannot
       read it" must not read as "it consented to being indexed". */
    return false
  }
}

export function routes(root = process.cwd()) {
  const out = new Set(['/'])

  /* Room URLs, from the same file the server routes on. */
  const cfg = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'))
  for (const r of cfg.rewrites || []) {
    /* A :param route is a template, not a page. /shop/:key becomes a
       real URL only once a shop is published, and publishing one does
       not currently regenerate this -- so it is left out rather than
       guessed at. Worth revisiting when the first shop ships. */
    if (r.source.includes(':')) continue
    const dest = String(r.destination || '/')
    const file = dest === '/' ? 'index.html'
      : dest.replace(/^\//, '') + (/\.html$/.test(dest) ? '' : '.html')
    if (noindexed(root, file)) continue
    out.add(r.source)
  }

  /* Standalone pages, minus anything that asked not to be indexed. */
  for (const f of readdirSync(join(root, 'public'))) {
    if (!f.endsWith('.html') || f === 'index.html') continue
    if (noindexed(root, f)) continue
    out.add('/' + f.replace(/\.html$/, ''))
  }

  return Array.from(out).sort()
}

export function build(root = process.cwd(), site = SITE) {
  const urls = routes(root).map(p =>
    '  <url><loc>' + site + (p === '/' ? '/' : p) + '</loc></url>').join('\n')
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.w3.org/1999/xhtml/../../schemas/sitemap/0.9">\n'
      .replace('http://www.w3.org/1999/xhtml/../../schemas/sitemap/0.9',
               'http://www.sitemaps.org/schemas/sitemap/0.9') +
    urls + '\n</urlset>\n'
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const xml = build()
  writeFileSync(join(process.cwd(), 'public', 'sitemap.xml'), xml)
  console.log('\n  ' + routes().join('\n  ') + '\n\n  wrote public/sitemap.xml (' + SITE + ')\n')
}
