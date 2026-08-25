/* ============================================================
   /api/products — the live scraper.
   ------------------------------------------------------------
   PORTED FROM NICOTIA MARKET'S api/products.js, which is itself
   Legal-Leaf's pipeline moved off Apps Script. Kept because it is
   the expensive, proven half: a strategy ladder per platform
   (Shopify products.json, Shopify collections, WooCommerce Store
   API, Woo category walk, BigCommerce, Magento GraphQL, CSV feed,
   JSON-LD), concurrent fan-out under a wall-clock budget, a KV
   layer so no visitor ever pays for a cold scrape, and a `get()`
   that refuses to fetch our own tracking links.

   Apps Script fetched from Google's egress IPs, which storefront
   WAFs treat as bots and 403 — only 2 of 11 stores were coming
   through. Node on Vercel gets ordinary egress and a real UA.

   Response shape is `{ ok, stores, meta, items, updated }` and the
   front end depends on it. Keep it stable.

     GET /api/products           cached
     GET /api/products?refresh   force a fresh scrape
     GET /api/products?debug     per-store counts and which door worked

   ============================================================
   THE PORT IS FINISHED. WHAT WAS TAKEN OUT, AND WHY IT MATTERS
   ------------------------------------------------------------
   This arrived as Nicotia's scraper and carried its subject with it.
   The scraping is the valuable half and is untouched; the nicotine
   half is gone. Recorded here because two of the removals were not
   dead weight — they were ACTIVELY WRONG on this site, and both would
   have failed silently.

   REMOVED AS MERELY DEAD: guessStrength, guessPuffs, isTobaccoSnus,
   SNUS_BRANDS/SNUS_WORDS, the six-department SUBCATS map and
   subclassify(), and the `strength`, `puffs`, `tobacco`, `nic0` and
   `sub` fields on every row. `dept` is `room` throughout, so this
   file, _stores.js and _scene.js finally use one word for one thing.

   REMOVED BECAUSE IT WAS WRONG: isApparel(). It dropped hoodies,
   t-shirts, keychains, stickers and decals — correct for a pouch
   shop, catastrophic here, where THE WARDROBE IS A ROOM and the Vault
   stocks pins and keychains. It would have deleted five merchants'
   entire catalogues with every room still rendering. The tombstone
   above row() has the full note.

   FIXED, NOT REMOVED: row() now honours `''` from classify(). The
   contract that '' means "we do not carry this" existed from the
   first commit and nothing implemented it — the value was computed
   and discarded, so every off-scene product a general dropshipper
   carries would have shipped with a blank room. A blank room renders.
   It just never appears under a facet, which is the version of wrong
   nobody reports.

   The brand lists were nicotine vocabulary and are now scene
   vocabulary, deliberately short: MULTIWORD should grow from captures
   when one shows a two-word brand cut in half, never from guessing.
   ============================================================ */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ' +
           'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/* THE REGISTRY LIVES IN _stores.js. Underscore-prefixed so Vercel
   does not publish it as a function, which matters: it holds our
   commission rates and rejection reasons. `publicStores()` below is
   the whitelist that decides what a browser is allowed to see, and
   it is an ALLOW-list rather than a deny-list on purpose — a field
   added to a store entry later is invisible by default rather than
   leaked by default. */
import { STORES } from './_stores.js'
import { classify as classifyScene } from './_scene.js'
import { publishable, reviewedKeys, readReviewed } from './_capture.js'
import { kvGet, kvPut } from './_db.js'

export { STORES }

function publicStores() {
  const reviewed = reviewedKeys()
  return STORES.filter(s => publishable(s, reviewed).ok).map(s => ({
    key: s.key, name: s.name, room: s.room, domain: s.domain,
    click: affTemplate(s), platform: s.platform || '',
    cartPath: s.cartPath || '', logo: s.logo || '', noFavicon: !!s.noFavicon,
    /* WHAT IS DELIBERATELY ABSENT: `ref`, `rate`, `cookie`, `tier`,
       `note`, `amazon`. The rate and cookie are our commission
       paperwork and the browser has no use for them; `ref` is not
       needed because `click` is the finished template and app.js
       substitutes the destination into it. Kawaii Katz's guide is
       blunt about the general rule and it holds here: every byte a
       client file imports is served to every visitor. */
  }))
}


/* ============================================================
   CLASSIFIERS
   ============================================================ */
function classify(st, blob, name) {
  /* ONE RULE, ONE FILE. The body of this used to be ~110 lines of
     nicotine vocabulary. It is now a delegation, because the same
     question is asked by the ingest, by the probe and by the tests,
     and three copies of a classifier drift silently — all three
     keep working, they just stop agreeing. _scene.js is the only
     place a room is decided.

     Returns '' for "we do not carry this", which callers must treat
     as a drop rather than as an unknown room. */
  return classifyScene(st, name, blob)
}

/* ============================================================
   SUBCATEGORIES — the shelf below the shelf
   ------------------------------------------------------------
   Matched on TITLE + VARIANT only, never the description, for the
   reason above: prose drags products into the wrong drawer, and that
   mistake already cost this catalogue 1,223 misfiled devices and a
   cigarillo at the top of the pouch shelf.

   First match wins and every list ends in a catch-all, so a product
   always lands somewhere nameable instead of a silent "other".
   ============================================================ */
const NONPRODUCT_TYPE = /^(fee|tax|shipping|insurance)$/i

const NONPRODUCT = /shipping protection|shipping insurance|route protect|\bgift ?cards?\b|\begift\b|free gift|\bautoship\b|subscription plan|expired mystery|mystery box|\bdonation\b|^\s*select \d+ for|\bexcise tax\b|rewards coupon|\d+-off\b/i

function cleanDesc(html) {
  if (!html) return ''
  let t = String(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;|&rsquo;/gi, "'")
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim()
  if (t.length > 420) {
    t = t.substring(0, 420)
    const cut = t.lastIndexOf('. ')
    t = (cut > 200 ? t.substring(0, cut + 1) : t.replace(/\s\S*$/, '')) + '…'
  }
  return t
}

function sizeImage(src, w = 500) {
  if (!src) return ''
  if (src.startsWith('//')) src = 'https:' + src
  if (!src.includes('cdn.shopify.com') && !src.includes('/cdn/shop/')) return src
  return src + (src.includes('?') ? '&' : '?') + 'width=' + w
}

/* FOUR networks, four link shapes. Getting this wrong fails SILENTLY —
   the link works, the customer buys, and the commission is zero.

     GoAffPro / direct   ?ref=<code> appended to the product URL
     AWIN feeds          the feed's aw_deep_link IS the tracked link,
                         so nothing is appended (ref stays empty)
     CJ Affiliate        the destination is WRAPPED, not appended:
                         anrdoezrs.net/click-<PID>-<AID>?url=<encoded>
     Impact.com          wrapped too, but the ids are in the PATH and
                         the destination rides in ?u=:
                         <vanity>.pxf.io/c/<partner>/<ad>/<campaign>?u=

   The wrapping networks are why this is a function rather than a string
   concat. With their ids missing we return the bare URL, and
   scrapeStore() flags the store as unattributed in the refresh report
   rather than pretending.

   ---- ONE AUTHORITY FOR THE LINK SHAPE ---------------------------
   The browser, not this file, builds the link a shopper actually
   clicks: row() drops `aff` and app.js rebuilds it from `url`. So a
   shape known only to this file is a shape that never reaches anybody
   — which is exactly how CJ was set up, and why Nicokick would have
   gone on emitting bare links even after its cjPid was filled in.

   affTemplate() closes that by returning the wrapper as a TEMPLATE
   with a `{url}` hole in it. publicStores() ships the template as
   `click`, app.js substitutes the destination into it, and neither
   side has to know what a pxf.io path looks like. Add a network here
   and the front end picks it up with no matching edit. */
const IMPACT_LINK = /^https:\/\/[a-z0-9.-]+\/c\/\d+\/\d+(?:\/\d+)?\/?$/i

function affTemplate(st) {
  if (st.network === 'impact') {
    /* Paste the WHOLE tracking link Impact issues — there is nothing to
       compose out of parts, and a mis-paste that still looks like a URL
       would send shoppers somewhere we did not choose AND pay nothing.
       So it is validated against the /c/ shape and refused otherwise.

       Any query the dashboard tacked on is dropped first: its deep-link
       generator hands back a link already carrying ?u=, and appending a
       second ?u= would leave the FIRST one winning — every product on
       the shelf silently redirecting to whatever page was in the
       clipboard. The ids are in the path; the query is ours to set. */
    const link = String(st.impact || '').trim()
      .split('#')[0].split('?')[0].replace(/\/+$/, '')
    if (!IMPACT_LINK.test(link)) return ''
    return `${link}?subId1=gamingdungeon&u={url}`
  }
  if (st.network === 'cj') {
    if (!st.cjPid || !st.cjAid) return ''
    return `https://www.anrdoezrs.net/click-${st.cjPid}-${st.cjAid}?sid=gamingdungeon&url={url}`
  }
  return ''
}

function buildAff(st, url) {
  const base = url || `https://${st.domain}/`
  const tpl = affTemplate(st)
  /* encodeURIComponent escapes `$`, so no `$&` can smuggle itself into
     the replacement and rewrite the template. */
  if (tpl) return tpl.replace('{url}', encodeURIComponent(base))
  if (!st.ref) return base
  return base + (base.includes('?') ? '&' : '?') + 'ref=' + st.ref
}

/* Does this store actually earn on a click? Used by the refresh report
   so an unattributed store can never quietly sit in production. */
function isAttributed(st, door) {
  if (st.network) return !!affTemplate(st)
  if (st.platform === 'feedcsv') return door === 'csv feed'
  return !!st.ref
}

/* WHY an Impact store is unattributed, which is the whole question at
   the moment somebody is pasting a link in. "Nothing pasted yet" and "I
   pasted something and it was rejected" are different problems with
   different fixes, and one message for both would send you looking in
   the wrong place — most likely back to the dashboard for a link that
   is already sitting in the registry. */
function impactFault(st) {
  if (st.network !== 'impact') return ''
  if (!String(st.impact || '').trim()) return 'unset'
  return affTemplate(st) ? '' : 'malformed'
}

/* Rows are built full and serialised slim. JSON.stringify omits
   undefined, so every falsy field simply disappears from the wire
   rather than shipping `"markets":""` on 8,000 rows.

   Dropped entirely and rebuilt in the browser:
     id   = key + '-' + (vid || url)
     aff  = url + '?ref=' + store.ref
   Both are pure functions of data already present, and together they
   were about a third of the payload. */

/* ============================================================
   isApparel() WAS HERE AND IT HAD TO GO. NOT because it was dead
   weight, but because it was ACTIVELY WRONG on this site.

   On Nicotia it dropped hoodies, t-shirts, snapbacks, keychains,
   stickers and decals, correctly: a pouch shop selling branded merch
   is a different business wearing the same storefront, and there is
   no honest per-pouch price for a hat.

   Here, THE WARDROBE IS A ROOM. Gaming Tees is a registered merchant
   whose entire catalogue is t-shirts; Kawaii Fashion Store, Cozy
   Kawaii, BestofKawaii and BerryKawaii are four more. And the Vault
   explicitly stocks keychains, enamel pins and stickers.

   Inheriting this rule would have emptied two of the nine rooms and
   deleted five merchants' entire catalogues, silently, with the rooms
   still rendering. That is the exact shape of failure this repo keeps
   writing up: a filter copied from a sister site whose subject was
   different, hiding real inventory while nothing errors.

   If a genuine merch problem appears later — a 3D-printer shop
   selling branded hoodies — the answer is a per-merchant `exclude`
   written from that merchant's capture, not a global regex.
   ============================================================ */

function row(st, o) {
  const blob = [o.title, o.variant, o.tags, o.desc].filter(Boolean).join(' ')
  const desc = cleanDesc(o.desc)
  const variant = o.variant === 'Default Title' ? '' : (o.variant || '')
  const brand = o.brand || st.name
  const cur = o.currency || 'USD'
  /* what the product calls ITSELF, with no marketing copy attached */
  const name = [o.title, variant].filter(Boolean).join(' ')
  /* ---- the reviewed summary decides first --------------------
     A human read this merchant's catalogue and wrote down which
     product_types belong and where. That beats both the strategy's
     guess and the classifier's. */
  const rv = st._review || {}
  const ptype = String(o.ptype || '').trim()
  const norm = ptype.toLowerCase()

  /* AN EMPTY `include` MEANS EVERYTHING, and that is a real choice
     rather than a missing one: plenty of merchants have no
     product_type taxonomy at all, and refusing their whole catalogue
     because a field is blank would read as "this shop returns
     nothing". The draft always proposes an include list, so a blank
     one on a merchant that HAS types is somebody deleting it on
     purpose. */
  if (Array.isArray(rv.include) && rv.include.length) {
    const ok = rv.include.some(t => String(t).trim().toLowerCase() === norm)
    if (!ok) return null
  }

  const mapped = rv.roomMap && ptype
    ? Object.keys(rv.roomMap).find(t => t.toLowerCase() === norm)
    : null

  /* The store's own category knows better than a regex does. When a
     strategy supplies a room it wins outright. */
  const room = (mapped && rv.roomMap[mapped]) || o.room || classify(st, blob, name)

  /* '' MEANS WE DO NOT CARRY THIS, AND IT IS HONOURED HERE.
     _scene.js has always returned '' for a washing machine, a gift
     card or a backlink package, and until now this line took the
     value and shipped the row anyway — so the refusal was computed
     and then thrown away. Every off-scene product a general
     dropshipper carries would have reached a shelf with a blank room,
     and a blank room renders: it just would not appear under any
     facet, which is the version of wrong nobody reports.

     Returning null drops it at the same gate as the non-products. */
  if (!room) return null

  return {
    k: st.key,
    room,
    brand: brand === st.name ? undefined : brand,   // default = store name
    title: o.title || '',
    variant: variant || undefined,
    price: o.price ? String(o.price) : undefined,
    compareAt: o.compareAt ? String(o.compareAt) : undefined,
    oos: o.available === false ? 1 : undefined,     // in stock is the norm
    /* Shopify's product_type, kept verbatim. NOT folded into `blob` — the
       recurring defect in this file is text rules reading a field that
       only looks like the right one, so this stays available for explicit
       decisions and out of the fuzzy matching. */
    ptype: o.ptype || undefined,
    image: sizeImage(o.image) || undefined,
    /* THE TRACKED LINK, BUILT HERE, SERVER-SIDE.
       This was the single most expensive bug in the port and it was
       invisible by construction. buildAff() came across from Nicotia
       and was never called: Nicotia deliberately DROPS attribution
       from the row and rebuilds it in the browser to shrink the
       payload, shipping `ref` and a `click` template to app.js. Both
       halves of that were removed here — `ref` is not in
       publicStores() because commission paperwork should not reach a
       browser, and grid.js links `it.url` directly.

       So every card would have linked to the bare product URL. The
       link works, the shopper buys, and all 23 live GoAffPro codes
       pay nothing. That is Kawaii Katz's sock-vendor failure exactly
       — 466 products earning nothing to this day — reproduced by
       inheriting half of a design.

       Building it here rather than in the browser also keeps `ref`
       server-side, which is why the payload shrink was not worth
       re-implementing. */
    url: buildAff(st, o.url || ''),
    cur: cur === 'USD' ? undefined : cur,           // USD is the norm
    desc: desc || undefined,
    vid: o.vid ? String(o.vid) : undefined,
    /* Woo variable products only: the parent to add against and the
       attribute pairs that identify which variation. Absent on simple
       products and on every Shopify row. */
    pid: o.pid ? String(o.pid) : undefined,
    attrs: o.attrs || undefined,
    markets: o.markets || undefined,
  }
}

/* ============================================================
   TIME BUDGET
   ------------------------------------------------------------
   A serverless function is killed at maxDuration with no warning and
   no partial result — unlike Apps Script, which was resumable across
   6-minute chunks and picked up where it stopped. So every loop that
   could run long checks the clock and returns what it already has.

   Partial data beats a 504. A store that yields 40 of its 200
   products still renders; a timed-out function renders nothing for
   ANY store, because they all share the one invocation.
   ============================================================ */
let DEADLINE = Infinity
const outOfTime = (margin = 0) => Date.now() > DEADLINE - margin

/* Small concurrency pool. Categories run in parallel, but not all at
   once — ten simultaneous requests to one shop is how you get rate
   limited by the very store you are trying to read. */
async function pool(items, limit, fn) {
  const out = []
  let i = 0
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      try { out.push(...(await fn(items[idx]))) } catch { /* one category failing is not fatal */ }
    }
  }))
  return out
}

/* ============================================================
   FETCH
   ============================================================ */
/* Never fetch a URL carrying an affiliate/tracking parameter. A feed's
   aw_deep_link IS a tracked link, and it now lands in every feedcsv
   row's `url` — so if any strategy ever followed one, the scraper would
   register phantom clicks in the merchant's dashboard on every refresh.
   That corrupts the attribution data we get paid on AND makes a real
   attribution outage impossible to diagnose. Enforced here rather than
   trusted to every call site. Borrowed from Legal-Leaf. */
const TRACKING_PARAM = /[?&](?:ref|rfsn|sca_ref|awinaffid|awinmid|irclickid|cjevent|sscid)=/i

/* A param is not the only tell. Impact and CJ carry their ids in the
   PATH — /c/<partner>/<ad>/<campaign> and /click-<pid>-<aid> — and the
   click registers on the redirect itself, before any param exists. A
   URL like that is unreachable from a scrape today, but the guard above
   is deliberately enforced here rather than trusted to call sites, and
   half a guard is worse than none: it reads as covered. */
const TRACKING_PATH = /\/(?:c\/\d+\/\d+(?:\/\d+)?|click-\d+-\d+)(?:[/?#]|$)/i

async function get(url, ms = 12000) {
  if (TRACKING_PARAM.test(String(url)) || TRACKING_PATH.test(String(url))) {
    throw new Error('refusing to fetch a tracking URL')
  }
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), ms)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/html;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

/* ============================================================
   STRATEGIES — tried in order, first one with rows wins
   ============================================================ */

/* Shopify's public products.json. Note it serves a SINGLE page of 250
   on most storefronts now; ?page= is widely ignored, which is why a
   4,000-product shop reports exactly 250 and looks complete. When we
   see a clean 250 boundary we walk collections instead. */
/* ---- brand, when the vendor field is useless ----
   Shopify's `vendor` is supposed to be the manufacturer. Plenty of
   stores set it to themselves instead: 1,218 of Europesnus's 1,250
   products carry vendor "Europesnus.com".

   That is not cosmetic. Rows without a variant group BY BRAND, so one
   worthless vendor value collapsed the entire store into a single card
   holding 1,218 products — the giant-card failure the old MAX_FLAV
   hack used to hide, which surfaced the moment that hack was removed.

   The brand is in the title: "Pablo Silver Edition Blue Raspberry",
   "Iceberg Watermelon 50mg". Taking the leading token yields 110 real
   brands for Europesnus — Iceberg 133, Velo 51, Fedrs 50, Pablo 43,
   Zyn 40 — instead of one. */
/* PRODUCT LINES, NOT JUST BRANDS.

   brandFrom() takes the title's leading token, so "Zyn Ultra Wintergreen
   Blast" and "Zyn Cool Mint" both became brand "Zyn" and collapsed onto
   ONE card — despite Ultra being a different format at a different
   strength. Same for Pablo's Exclusive/Gold/Silver lines, Cuba's
   Black/White lines, and the rest.

   This is an EXPLICIT list, deliberately. A generic "take two words"
   rule would read "Zyn Nicotine Pouches Menthol" as a line called "Zyn
   Nicotine" and "Iceberg Watermelon Mint" as one called "Iceberg
   Watermelon" — the second word is a descriptor or a flavour far more
   often than it is a line. Every entry below was read off the live
   catalogue.

   LONGEST FIRST: alternation is first-match, so "cuba blackline" has to
   precede "cuba black" or it would match "cuba black" and strand "line". */
/* MULTI-WORD BRAND NAMES, so `brandFrom()` does not truncate one at
   the first space. Nicotia's list was 25 nicotine brands and product
   lines; none of them mean anything here, and leaving them in would
   have been 25 regex alternatives matching nothing forever.

   THIS LIST IS DELIBERATELY SHORT AND SHOULD GROW FROM CAPTURES, not
   from guessing. Every entry below is a brand that actually appears
   in this registry's merchants or their obvious stock. Add one when a
   capture shows a two-word brand being cut in half, and not before:
   an invented entry silently reshapes a brand nobody sells.

   `pulsar gaming` is the live example — the registry carries Pulsar
   Gaming Gears, and without this `brandFrom` would file it as
   "Pulsar". */
const MULTIWORD = new RegExp('^(' + [
  "pulsar gaming", "fosi audio", "slick audio", "noam audio",
  "creative arcades", "mixbox arcade", "frontline gaming", "games burner",
  "krazed gaming", "awkward games", "waffle cone", "odin gaming",
  "custom gaming", "ficmax gaming", "anime keycaps", "anime mousepads",
  "cover alpha", "mazz comics", "distro manga", "maximus collectibles",
  "cozy kawaii", "kawaii fashion", "gaming tees", "cable pro",
  "portable monitor", "miami pc", "3d printernational",
].join('|') + ')', 'i')

const normName = s => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '')

/* Every shop name and domain in the registry, normalised. Built once. */
let STORE_WORDS = null
function storeWords() {
  if (STORE_WORDS) return STORE_WORDS
  STORE_WORDS = new Set()
  for (const s of STORES) {
    if (s.name) STORE_WORDS.add(normName(s.name))
    if (s.domain) {
      STORE_WORDS.add(normName(s.domain))
      STORE_WORDS.add(normName(String(s.domain).replace(/^www\./, '').split('.')[0]))
    }
  }
  return STORE_WORDS
}

/* A vendor is useless when it names a SHOP rather than a manufacturer.
   This originally caught only the store scraping ITSELF, which missed
   resellers. Europesnus stocks NikoPouches.dk items whose vendor field
   is literally "NikoPouches.dk"; because a row with no variant groups
   by brand, and app.js promotes brand to the card title, those cards
   rendered with the headline "NikoPouches.dk" over a store pill reading
   "Europesnus" — the title/store mismatch seen on the live shelf.

   So: reject a vendor matching ANY store in the registry, not just this
   one, and reject anything shaped like a bare domain.

   This is safe where a shop is also a genuine brand (Geekvape,
   Vaporesso, XIFEI): the fallback takes the title's leading token,
   which for "Geekvape Aegis Legend 3" is "Geekvape" again. The change
   only bites when the vendor names a shop that ISN'T in the title. */
const DOMAINISH = /^[a-z0-9-]+\.(com|co\.uk|net|org|shop|store|dk|se|no|fi|de|nl|fr|es|it|eu|uk|us)$/i

function looksLikeStore(vendor, st) {
  if (!vendor) return true
  const v = normName(vendor)
  if (!v) return true
  if (DOMAINISH.test(String(vendor).trim())) return true
  if (v === normName(st.name)) return true
  if (st.domain && (v === normName(st.domain) ||
      v === normName(String(st.domain).replace(/^www\./, '').split('.')[0]))) return true
  return storeWords().has(v)
}

function brandFrom(st, vendor, title) {
  if (!looksLikeStore(vendor, st)) return vendor
  const name = String(title || '').trim()
  const multi = name.match(MULTIWORD)
  if (multi) return multi[0]
  const m = name.match(/^([A-Za-z][\w'&!-]*)/)
  return m ? m[1] : ''
}

/* Shopify's products.json carries NO currency field, so every Shopify
   store was defaulting to USD — Snus O'Clock priced in GBP and
   Europesnus in EUR both rendered with a dollar sign, and the cart
   summed them as if they were the same money.

   /meta.json is public on every Shopify storefront and returns the
   shop's currency. One request per store, cached for the instance. */
const SHOP_CUR = new Map()
async function shopifyCurrency(st) {
  if (st.currency) return st.currency
  if (SHOP_CUR.has(st.key)) return SHOP_CUR.get(st.key)
  let cur = 'USD'
  try {
    const r = await get(`https://${st.domain}/meta.json`, 6000)
    if (r.ok) {
      const m = await r.json()
      if (m && typeof m.currency === 'string' && m.currency.length === 3) cur = m.currency
    }
  } catch { /* fall back to USD */ }
  SHOP_CUR.set(st.key, cur)
  return cur
}

/* Shopify links a variant to its own photo by `image_id`, pointing at
   one entry in the product's `images[]` array — that mapping is how a
   single product with ten flavour variants shows ten different can
   photos instead of one. Reading only `images[0]` for every variant
   ignores it, so every flavour got whichever photo happened to load
   first — for Black Buffalo (one product, one variant per flavour)
   that is a branded/hero shot, not a single flavour's can, and it
   rendered on the shelf looking like "their logo" on every card. */
function imageForVariant(pr, v) {
  const images = pr.images || []
  if (v && v.image_id) {
    const hit = images.find(img => img.id === v.image_id)
    if (hit) return hit.src
  }
  return images[0] ? images[0].src : ''
}

async function shopifyProducts(st) {
  const currency = await shopifyCurrency(st)
  const out = []
  for (let page = 1; page <= 10; page++) {
    if (outOfTime(4000)) break
    const res = await get(`https://${st.domain}/products.json?limit=250&page=${page}`)
    if (res.status === 403) throw new Error('403 blocked at edge')
    if (res.status === 404) throw new Error('404 endpoint off')
    if (!res.ok) throw new Error('HTTP ' + res.status)
    const text = await res.text()
    if (text.slice(0, 15).toLowerCase().includes('<!doctype')) throw new Error('got HTML not JSON')
    let data
    try { data = JSON.parse(text) } catch { throw new Error('unparseable JSON') }
    const prods = data.products || []
    if (!prods.length) break
    for (const pr of prods) {
      const url = `https://${st.domain}/products/${pr.handle}`
      const vts = pr.variants && pr.variants.length ? pr.variants : [{}]
      for (const v of vts) {
        const r = row(st, {
          brand: brandFrom(st, pr.vendor, pr.title), title: pr.title, variant: v.title,
          ptype: pr.product_type,
          tags: Array.isArray(pr.tags) ? pr.tags.join(' ') : pr.tags,
          price: v.price, compareAt: v.compare_at_price, currency,
          available: v.available !== false, image: imageForVariant(pr, v), url,
          desc: pr.body_html, vid: v.id,
        })
        if (r) out.push(r)
      }
    }
    if (prods.length < 250) break
  }
  return out
}

async function shopifyCollection(st) {
  const currency = await shopifyCurrency(st)
  const res = await get(`https://${st.domain}/collections/all/products.json?limit=250`)
  if (!res.ok) throw new Error('collections HTTP ' + res.status)
  const data = await res.json()
  const out = []
  for (const pr of data.products || []) {
    const url = `https://${st.domain}/products/${pr.handle}`
    for (const v of (pr.variants && pr.variants.length ? pr.variants : [{}])) {
      const r = row(st, {
        brand: brandFrom(st, pr.vendor, pr.title), title: pr.title, variant: v.title,
        ptype: pr.product_type,
        tags: Array.isArray(pr.tags) ? pr.tags.join(' ') : pr.tags,
        price: v.price, compareAt: v.compare_at_price, currency,
        available: v.available !== false, image: imageForVariant(pr, v), url,
        desc: pr.body_html, vid: v.id,
      })
      if (r) out.push(r)
    }
  }
  if (!out.length) throw new Error('collections returned nothing')
  return out
}

/* ---- WooCommerce Store API ----
   Public and unauthenticated on most Woo shops. Two sweeps, not one:

   `/products` returns PARENTS. For a variable product that parent is
   not purchasable — it carries has_options:true and the storefront
   shows "Select options", not "Add to cart". Listing it was producing
   a card whose checkout silently failed, because Woo cannot add a
   variable product by parent id: ?add-to-cart=8064 just bounces back
   to the product page.

   `/products?type=variation` returns the real, buyable rows — each
   with its own price, its own flavour image, its own stock, its own
   add-to-cart id, and a ready-made `variation` string ("Flavor: White
   Gummy"). Wave Vape: 40 parents hiding 132 variations. EightVape:
   1,074 parents hiding 4,925.

   So: keep simple products, DROP variable parents, add every variation. */
function wooPrice(prices, field = 'price') {
  if (!prices || prices[field] == null) return ''
  const div = Math.pow(10, Number(prices.currency_minor_unit ?? 2))
  return (Number(prices[field]) / div).toFixed(2)
}

/* Route a Woo product onto a shelf using the store's own category
   slugs. This is what roomMap was written for — it just used to be fed
   by the category walk. `categories[].slug` from the API does the same
   job without scraping a single page. */
function wooRoom(st, p) {
  if (!st.roomMap) return undefined
  for (const c of p.categories || []) {
    if (st.roomMap[c.slug]) return st.roomMap[c.slug]
  }
  return undefined
}

async function wooSweep(st, type) {
  const out = []
  const qs = type ? `&type=${type}` : ''
  for (let page = 1; page <= 60; page++) {
    if (outOfTime(5000)) break
    const res = await get(`https://${st.domain}/wp-json/wc/store/v1/products?per_page=100&page=${page}${qs}`)
    if (!res.ok) {
      if (page === 1) throw new Error(`woo ${type || 'products'} HTTP ${res.status}`)
      break
    }
    let data
    try { data = await res.json() } catch { if (page === 1) throw new Error('woo API unparseable'); break }
    if (!Array.isArray(data) || !data.length) break
    out.push(...data)
    if (data.length < 100) break
  }
  return out
}

async function wooStoreApi(st) {
  /* Variations FIRST, deliberately. All 18 stores share one wall clock,
     and EightVape's catalogue is ~11 pages of parents followed by ~50
     pages of variations — so the parents ate the budget and the
     variation sweep got nothing, leaving 41 simple products out of
     1,074 + 4,925.

     Variations are the buyable rows; parents only supply brand,
     department and a fallback image. If the clock cuts the parent
     sweep short, a variation degrades to the store's own brand and
     room rather than disappearing. Losing that is much cheaper than
     losing 4,925 products. */
  const variations = await wooSweep(st, 'variation').catch(() => [])
  const parents = await wooSweep(st, '').catch(() => [])
  if (!parents.length && !variations.length) throw new Error('woo API empty')

  /* parent id -> its own info, so a variation can inherit the bits it
     does not carry (department, brand, and a fallback image) */
  const byId = new Map(parents.map(p => [p.id, p]))
  const out = []

  /* Woo has no vendor field, so everything would land under the store
     name and group into one enormous card. The category IS the brand
     on these shops — Wave Vape files by Foger / Geek Bar, EightVape by
     the manufacturer — so use the shallowest category as the brand and
     the range groups correctly. */
  /* Woo exposes no vendor field, so the shortest category name is the
     best guess available — and when there are no categories this used to
     return the STORE NAME, which then travelled all the way to the brand
     facet as a pill reading "EightVape 64". A store is not a brand.

     brandFrom() already solves this on the Shopify side: it rejects any
     vendor that names a shop and falls back to the title's leading
     token. Running the guess through it means the store name can never
     survive as a brand again, whichever door the row came in by. */
  const brandOf = (p) => {
    const cats = (p?.categories || []).map(c => c.name).filter(Boolean)
    const guess = cats.length ? cats.reduce((a, b) => (b.length < a.length ? b : a)) : ''
    return brandFrom(st, guess, p?.name)
  }

  for (const p of parents) {
    if (p.type === 'variable' || p.has_options) continue   // not purchasable
    const r = row(st, {
      brand: brandOf(p), title: p.name, room: wooRoom(st, p),
      tags: (p.categories || []).map(c => c.name).join(' '),
      price: wooPrice(p.prices), compareAt: wooPrice(p.prices, 'regular_price'),
      available: p.is_in_stock !== false,
      image: p.images?.[0]?.src || '', url: p.permalink,
      currency: p.prices?.currency_code || 'USD',
      desc: p.short_description || p.description, vid: p.id,
    })
    if (r) out.push(r)
  }

  /* WooCommerce will NOT add a variable product from the variation id
     alone — ?add-to-cart=<variation_id> is rejected with "please choose
     product options" and the cart lands empty. It needs the PARENT id,
     plus variation_id, plus every attribute as its own param:

       ?add-to-cart=8064&variation_id=8121&attribute_flavor=White+Gummy

     The variation's own permalink already carries those attribute pairs
     ("…/?attribute_flavor=White+Gummy"), so lift them straight off it
     rather than trying to rebuild them from the attribute list. */
  const attrsFrom = (permalink) => {
    const qi = String(permalink || '').indexOf('?')
    if (qi < 0) return ''
    return String(permalink).slice(qi + 1).split('&')
      .filter(kv => kv.toLowerCase().startsWith('attribute_'))
      .join('&')
  }

  for (const v of variations) {
    const parent = byId.get(v.parent)
    /* "Flavor: White Gummy" -> "White Gummy". Multiple attributes come
       through comma-separated and are kept whole. */
    const label = String(v.variation || '')
      .split(',').map(s => s.split(':').slice(1).join(':').trim() || s.trim())
      .filter(Boolean).join(' · ')
    const r = row(st, {
      brand: brandOf(parent),
      title: v.name || parent?.name || '',
      variant: label,
      room: wooRoom(st, parent || v),
      tags: [(parent?.categories || []).map(c => c.name).join(' '), label].join(' '),
      price: wooPrice(v.prices), compareAt: wooPrice(v.prices, 'regular_price'),
      available: v.is_in_stock !== false,
      image: v.images?.[0]?.src || parent?.images?.[0]?.src || '',
      url: v.permalink || parent?.permalink,
      currency: v.prices?.currency_code || 'USD',
      /* no desc: a variation inherits its parent's, and carrying 4,925
         copies of the same paragraph is most of the payload */
      vid: v.id,
      pid: v.parent,                       // parent id — Woo adds against this
      attrs: attrsFrom(v.permalink),       // attribute_flavor=White+Gummy
    })
    if (r) out.push(r)
  }

  if (!out.length) throw new Error('woo API returned no purchasable rows')
  return out
}

/* ---- WooCommerce category walk ----
   EightVape runs WooCommerce with the Store API closed, so its category
   pages are the source. Their markup is generous: each card carries a
   product-title link, a wishlist button holding data-id, a clean
   data-product_image, a woocommerce-Price-amount, and an outofstock
   class when it applies.

   The id matters as much as the price — it is what makes
   /cart/?add-to-cart=<id> fill their basket at checkout. */
function lastMatch(text, re) {
  let m, last = ''
  while ((m = re.exec(text)) !== null) last = m[1]
  return last
}

function wooCards(st, html, room, seen) {
  const out = []
  const re = /<h3[^>]*class="[^"]*product-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = re.exec(html)) !== null) {
    const url = m[1]
    if (!url.includes('/product/')) continue
    if (seen.has(url)) continue
    seen.add(url)

    const title = m[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
      .replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
    if (!title) continue

    /* price sits just after the title; a variable product shows a range
       and the low end is the honest "from" figure */
    const after = html.substr(m.index, 2200)
    const pm = after.match(/woocommerce-Price-currencySymbol">[^<]*<\/span>([\d,]+\.?\d*)/i)
    const price = pm ? pm[1].replace(/,/g, '') : ''

    /* id, image and stock sit in the block BEFORE the title. Take the
       LAST match, not the first — a greedy backward search anchors on
       the earliest candidate and silently shifts every id by one card. */
    const back = html.substring(Math.max(0, m.index - 6000), m.index)
    let img = lastMatch(back, /data-product_image="([^"]+)"/gi)
    const pid = lastMatch(back, /data-id="(\d+)"/gi)
    if (img) img = img.replace(/-\d+x\d+(\.(?:jpg|jpeg|png|webp))/i, '$1')
    const oos = /class="[^"]*\boutofstock\b/i.test(back.slice(-2500))

    const r = row(st, {
      brand: st.name, title, tags: title, room,
      price, available: !oos, image: img, url, vid: pid,
    })
    if (r) out.push(r)
  }
  return out
}

const MAX_CAT_PAGES = 6   // 6 x ~12 cards is plenty per category

async function wooCategoryWalk(st) {
  const cats = st.cats && st.cats.length ? st.cats.slice() : []
  if (!cats.length) throw new Error('no cats configured for category walk')

  /* `seen` is shared across the pool. Sets are safe here because Node
     is single-threaded — nothing preempts between the has() and the
     add(), so two categories carrying the same product cannot both
     add it. */
  const seen = new Set()

  const out = await pool(cats, 3, async (cat) => {
    /* roomMap routes each category onto the right shelf. EightVape's
       categories span four of ours, so the store's own room is only a
       fallback for anything unmapped. */
    const room = (st.roomMap && st.roomMap[cat]) || st.room
    const rows = []
    for (let page = 1; page <= MAX_CAT_PAGES; page++) {
      if (outOfTime(4000)) break
      const url = `https://${st.domain}/product-category/${cat}/` + (page > 1 ? `page/${page}/` : '')
      let res
      try { res = await get(url, 8000) } catch { break }
      if (!res.ok) break
      const html = await res.text()
      const got = wooCards(st, html, room, seen)
      rows.push(...got)
      if (!got.length) break
      if (!html.includes(`/page/${page + 1}/`)) break
    }
    return rows
  })

  if (!out.length) throw new Error('category pages returned no cards')
  return out
}

/* ============================================================
   BIGCOMMERCE — Stencil product cards
   ------------------------------------------------------------
   BigCommerce publishes no products.json and, unlike most carts, its
   default Stencil category pages carry NO JSON-LD either — which is
   why Beard Cigars sat at FAILED with "no JSON-LD Product objects
   found" while its /shop-all/ page was serving cards the whole time.

   So parse the cards. The markup is stable and generous:
     <h4 class="card-title"><a href="URL">TITLE</a></h4>
     <span data-product-price-without-tax class="price ...">$X.XX</span>
     <img src="https://cdn11.bigcommerce.com/s-HASH/.../file.jpg">

   Note the rrp and non-sale spans are rendered but style="display:none"
   when empty, so a naive "first price on the card" grab returns blank.
   Anchor on the data- attributes instead of the class names.
   ============================================================ */
async function bigCommerceCards(st) {
  const paths = st.cats && st.cats.length ? st.cats : ['/shop-all/', '/cigars/', '/all/', '/']
  const out = []
  const seen = new Set()

  for (const path of paths) {
    for (let page = 1; page <= 8; page++) {
      if (outOfTime(4000)) break
      const url = `https://${st.domain}${path}` + (page > 1 ? `?page=${page}` : '')
      let res
      try { res = await get(url, 10000) } catch { break }
      if (!res.ok) break
      const html = await res.text()

      const cards = html.split(/<article[^>]*class="[^"]*\bcard\b[^"]*"/i).slice(1)
      if (!cards.length) break
      let added = 0

      for (const card of cards) {
        const t = card.match(/<h4[^>]*class="[^"]*card-title[^"]*"[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        if (!t) continue
        const link = t[1]
        const title = t[2].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&')
          .replace(/&#\d+;/g, '').replace(/\s+/g, ' ').trim()
        if (!title || seen.has(link)) continue
        seen.add(link)

        const price = (card.match(/data-product-price-without-tax[^>]*>[^$\d]*\$?\s*([\d,]+\.?\d*)/i) || [])[1] || ''
        const was = (card.match(/data-product-non-sale-price-without-tax[^>]*>[^$\d]*\$?\s*([\d,]+\.?\d*)/i) || [])[1] || ''
        /* strip the srcset size segment so we get a usable resolution
           rather than the 80w thumbnail the lazy-loader starts on */
        let img = (card.match(/<img[^>]+src="(https:\/\/cdn11\.bigcommerce\.com[^"]+)"/i) || [])[1] || ''
        if (img) img = img.replace(/\/stencil\/\d+w\//, '/stencil/500x659/')

        const r = row(st, {
          brand: st.name, title, tags: title,
          price: price.replace(/,/g, ''),
          compareAt: was && Number(was.replace(/,/g, '')) > Number(price.replace(/,/g, ''))
            ? was.replace(/,/g, '') : '',
          available: !/out[- ]of[- ]stock|sold[- ]out/i.test(card),
          image: img, url: link, currency: st.currency || 'USD',
        })
        if (r) out.push(r)
        added++
      }
      if (!added) break
      if (!/rel="next"|\?page=/.test(html)) break
    }
    if (out.length) break     // first productive path wins
  }
  if (!out.length) throw new Error('no BigCommerce cards parsed')
  return out
}

/* ============================================================
   MAGENTO 2 — public GraphQL
   ------------------------------------------------------------
   Magento 2 ships a GraphQL endpoint at /graphql that is public by
   design: the storefront itself runs on it. That makes it the cleanest
   door of any platform here — real pagination, real stock status,
   regular AND final price, and the category tree to route departments.

   Nicokick runs this, and it is how the site finally gets US pouches.
   ZYN, on!, VELO and Rogue are owned by Swedish Match, Altria, BAT and
   Turning Point, none of which run affiliate programmes — so the only
   way to reach that inventory is through a retailer who does.

   Note Magento's filter quirk: `price:{from:"0"}` matches NOTHING, so
   filtering by category_uid is the reliable way to walk a catalogue.
   ============================================================ */
/* Brand decides the card. Items with no variant group BY BRAND, so a
   miss here scatters a range into loose cards instead of one ZYN card
   with 54 flavours in the dropdown.

   Magento tags a product with every category it appears in, mixing
   merchandising buckets ("Offers", "Advent"), flavour shelves ("Mint",
   "Citrus") and the actual brand. Strip the first two and the most
   specific survivor is the brand; if nothing survives, the leading
   token of the title is — Nicokick titles all start with it.
   Measured across all 409 pouches: 17 brands, 100% assigned. */
/* Magento category names that are navigation, not brands. Nicotia's
   version led with "nicotine pouch|nicokick|metal nicotine"; those are
   gone. What is left is the genuinely generic half, which is the part
   that was doing the work. */
const MAGENTO_GENERIC = /offers?|learn more|explore |christmas|advent|limited|all products|bestsellers?|multipack|bundles?|specials|clearance|shop|^new$|^sale$|^featured$|^gifts?$/i
/* A bare attribute standing alone is not a brand. Nicotia's list was
   flavours; ours is the equivalent for this scene — a colour or a
   switch type as a whole category name means the taxonomy is faceted,
   not branded.

   NARROW ON PURPOSE. "Cherry" is a real keyboard-switch brand and
   "Ice" appears in real product lines, so both are absent: this only
   catches a word that is the ENTIRE category name, and over-matching
   here erases a brand rather than a flavour. */
const MAGENTO_NOT_BRAND = /^(black|white|red|blue|green|pink|purple|silver|gold|clear|rgb|wireless|wired|small|medium|large|new|used|refurbished)$/i

/* The only brands here that are genuinely two words. Everything else is
   one, so a blind "take two capitalised tokens" turns "FRE Wintergreen
   9mg" into its own brand and splits FRE's 58 products across cards. */
const MULTIWORD_BRAND = /^(pulsar gaming|fosi audio|creative arcades|frontline gaming)/i

function magentoBrand(p) {
  const cats = (p.categories || []).map(c => String(c.name || '').trim())
    .filter(n => n && !MAGENTO_GENERIC.test(n) && !MAGENTO_NOT_BRAND.test(n))
  if (cats.length) return cats.reduce((a, b) => (b.length < a.length ? b : a))
  const name = String(p.name || '').trim()
  const multi = name.match(MULTIWORD_BRAND)
  if (multi) return multi[0]
  const m = name.match(/^([A-Za-z][\w'!-]*)/)
  return m ? m[1] : ''
}

async function magentoGraphql(st) {
  const cats = st.cats && st.cats.length ? st.cats : []
  if (!cats.length) throw new Error('magento needs cats (category uids)')

  const suffix = st.urlSuffix === undefined ? '' : st.urlSuffix
  const out = []
  const seen = new Set()

  const query = (uid, page) => `{products(filter:{category_uid:{eq:"${uid}"}},pageSize:100,currentPage:${page}){
    total_count
    items{
      name sku url_key stock_status
      price_range{minimum_price{final_price{value currency} regular_price{value}}}
      image{url}
      categories{name url_key}
    }
  }}`

  for (const uid of cats) {
    const room = (st.roomMap && st.roomMap[uid]) || st.room
    for (let page = 1; page <= 12; page++) {
      if (outOfTime(4000)) break
      let res
      try {
        res = await fetch(`https://${st.domain}/graphql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
          body: JSON.stringify({ query: query(uid, page) }),
        })
      } catch { break }
      if (!res.ok) break
      let j
      try { j = await res.json() } catch { break }
      if (j.errors && j.errors.length && !j.data) {
        throw new Error('graphql: ' + j.errors[0].message)
      }
      const items = j.data?.products?.items || []
      if (!items.length) break

      for (const p of items) {
        if (!p.url_key || seen.has(p.sku || p.url_key)) continue
        seen.add(p.sku || p.url_key)
        const min = p.price_range?.minimum_price
        const price = min?.final_price?.value
        const reg = min?.regular_price?.value
        const r = row(st, {
          brand: magentoBrand(p),
          title: p.name,
          room,
          tags: (p.categories || []).map(c => c.name).join(' '),
          price: price != null ? String(price) : '',
          /* only a discount when regular actually exceeds final */
          compareAt: reg != null && price != null && reg > price ? String(reg) : '',
          available: p.stock_status !== 'OUT_OF_STOCK',
          image: p.image?.url || '',
          url: `https://${st.domain}/${p.url_key}${suffix}`,
          currency: min?.final_price?.currency || st.currency || 'USD',
          vid: p.sku,
        })
        if (r) out.push(r)
      }
      if (items.length < 100) break
    }
  }
  if (!out.length) throw new Error('magento graphql returned no products')
  return out
}

/* ============================================================
   CSV PRODUCT FEEDS (AWIN and anything else that serves a CSV)
   ------------------------------------------------------------
   A feed is strictly better than scraping: no WAF, no rate limit, no
   250-product ceiling, no parser that breaks when a theme updates. It
   is why these programmes were worth chasing.

   Two ways to point a store at one:
     feed:   'https://…'   an explicit URL (any CSV host)
     feedId: 123456        an AWIN feed id, combined with AWIN_API_KEY

   AWIN feed ids are NOT the advertiser ids already in the registry —
   you get them from the AWIN feed list. Keeping them separate so the
   two never get confused.

   The API key is a secret. It lives in an env var and must never be
   committed; without it, feedId stores throw a clear error and the
   ladder falls through rather than silently returning nothing.
   ============================================================ */
function feedUrlFor(st) {
  if (st.feed) return st.feed
  if (!st.feedId) return ''
  const key = process.env.AWIN_API_KEY
  if (!key) throw new Error('AWIN_API_KEY not set — cannot build feed URL')
  /* compression/none so we never have to gunzip in the function; the
     columns list is the union of everything mapCsvRow() looks for. */
  const cols = [
    'aw_deep_link','product_name','merchant_product_id','aw_product_id',
    'merchant_image_url','description','merchant_category','category_name',
    'search_price','store_price','rrp_price','currency','brand_name',
    'in_stock','stock_quantity','merchant_name',
  ].join(',')
  return `https://productdata.awin.com/datafeed/download/apikey/${key}` +
         `/language/en/fid/${st.feedId}/columns/${cols}` +
         `/format/csv/delimiter/%2C/compression/none/adultcontent/1/`
}

/* A real parser, not split(','). Feed descriptions routinely contain
   commas, quoted quotes and embedded newlines — splitting on commas
   shifts every column after the first offending row and silently
   corrupts the whole file. */
function parseCsv(text, delim, maxRows) {
  const rows = []
  let field = '', row = [], q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else q = false }
      else field += c
    } else if (c === '"') { q = true }
    else if (c === delim) { row.push(field); field = '' }
    else if (c === '\n') {
      row.push(field); field = ''
      rows.push(row); row = []
      if (maxRows && rows.length >= maxRows) return rows
    } else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

/* Column names differ per feed and per advertiser's own config, so
   take the first candidate that is actually present and non-empty. */
function pick(rec, ...names) {
  for (const n of names) {
    const v = rec[n]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

async function feedCsv(st) {
  const url = feedUrlFor(st)
  if (!url) throw new Error('no feed or feedId configured')

  const res = await get(url, 25000)
  if (!res.ok) throw new Error('feed HTTP ' + res.status)
  const text = await res.text()
  if (!text || text.length < 40) throw new Error('feed empty')
  if (/^\s*</.test(text)) throw new Error('feed returned HTML — check the API key')

  /* Delimiter sniff on the header line: AWIN can be configured for tab
     or pipe, and guessing comma on a tab feed yields one giant column. */
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || 400)
  const delim = [',', '\t', '|', ';']
    .map(d => [d, firstLine.split(d).length])
    .sort((a, b) => b[1] - a[1])[0][0]

  const cap = Number(st.max) || 6000
  const rows = parseCsv(text, delim, cap + 1)
  if (rows.length < 2) throw new Error('feed had no data rows')

  const head = rows[0].map(h => h.replace(/^﻿/, '').trim().toLowerCase())
  const out = []
  for (let i = 1; i < rows.length; i++) {
    if (outOfTime(3000)) break
    const rec = {}
    head.forEach((h, j) => { rec[h] = rows[i][j] })

    const title = pick(rec, 'product_name', 'name', 'title', 'product_short_description')
    /* aw_deep_link is ALREADY the tracked affiliate link — the whole
       point of the feed. Never append ?ref= on top of it; these stores
       carry ref:'' so buildAff() leaves it alone. */
    const link = pick(rec, 'aw_deep_link', 'merchant_deep_link', 'deep_link', 'product_url', 'url')
    if (!title || !link) continue

    const stock = pick(rec, 'in_stock', 'stock_status', 'availability', 'stock_quantity')
    const price = pick(rec, 'search_price', 'store_price', 'price', 'display_price')
    const was = pick(rec, 'rrp_price', 'was_price', 'product_price_old')

    const r = row(st, {
      brand: pick(rec, 'brand_name', 'brand', 'manufacturer') || st.name,
      title,
      tags: pick(rec, 'merchant_category', 'category_name', 'custom_1'),
      price,
      /* an rrp equal to or below the live price is not a discount */
      compareAt: was && Number(was) > Number(price) ? was : '',
      available: !/^(0|no|false|out of stock|outofstock)$/i.test(stock),
      image: pick(rec, 'merchant_image_url', 'aw_image_url', 'image_url', 'large_image'),
      url: link,
      currency: pick(rec, 'currency') || st.currency || 'USD',
      desc: pick(rec, 'description', 'product_short_description'),
      vid: pick(rec, 'merchant_product_id', 'aw_product_id', 'product_id'),
    })
    if (r) out.push(r)
  }
  if (!out.length) throw new Error('feed parsed but produced no usable rows')
  return out
}

/* Themes emit <script type="application/ld+json"> Product objects.
   That markup exists so machines can read it — a published interface,
   not a workaround. Last resort for BigCommerce and custom carts. */
function collectProducts(node, found = []) {
  if (!node || typeof node !== 'object') return found
  if (Array.isArray(node)) { node.forEach(n => collectProducts(n, found)); return found }
  const t = node['@type']
  if (t === 'Product' || (Array.isArray(t) && t.includes('Product'))) found.push(node)
  if (node['@graph']) collectProducts(node['@graph'], found)
  if (node.itemListElement) collectProducts(node.itemListElement, found)
  if (node.item) collectProducts(node.item, found)
  return found
}

async function jsonLd(st) {
  const paths = ['/collections/all', '/shop', '/products', '/']
  for (const p of paths) {
    let res
    try { res = await get(`https://${st.domain}${p}`) } catch { continue }
    if (!res.ok) continue
    const html = await res.text()
    const chunks = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)
    if (!chunks) continue
    const out = []
    for (const ch of chunks) {
      const body = ch.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim()
      let j
      try { j = JSON.parse(body) } catch { continue }
      for (const pr of collectProducts(j)) {
        const offer = [].concat(pr.offers || [])[0] || {}
        let img = [].concat(pr.image || [])[0] || ''
        if (img && typeof img === 'object') img = img.url || ''
        const r = row(st, {
          brand: pr.brand?.name, title: pr.name, price: offer.price,
          available: !/outofstock|soldout/i.test(String(offer.availability || '')),
          image: img, url: pr.url || `https://${st.domain}${p}`,
          currency: offer.priceCurrency, desc: pr.description,
        })
        if (r) out.push(r)
      }
    }
    if (out.length) return out
  }
  throw new Error('no JSON-LD Product objects found')
}

const LADDERS = {
  shopify: [['products.json', shopifyProducts], ['collections', shopifyCollection], ['json-ld', jsonLd]],
  woocommerce: [['woo store api', wooStoreApi], ['woo categories', wooCategoryWalk], ['json-ld', jsonLd]],
  bigcommerce: [['bc cards', bigCommerceCards], ['json-ld', jsonLd]],
  magento: [['magento graphql', magentoGraphql], ['json-ld', jsonLd]],
  /* A feed store still gets a scrape fallback: if the key is missing or
     AWIN has the feed offline, the storefront is better than nothing. */
  feedcsv: [['csv feed', feedCsv], ['products.json', shopifyProducts],
            ['woo store api', wooStoreApi], ['json-ld', jsonLd]],
  default: [['products.json', shopifyProducts], ['woo store api', wooStoreApi], ['json-ld', jsonLd]],
}

/* Dedupe. Every strategy runs through this, so a parser that
   double-counts can inflate a catalogue but never reach the client.
   Keyed on URL + variant + price, because two sizes of the same cigar
   are genuinely two rows. */
function dedupe(rows) {
  const seen = new Set()
  const out = []
  for (const r of rows) {
    const k = `${String(r.url).replace(/[?#].*$/, '')}|${r.vid || r.variant}|${r.price}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

async function scrapeStore(st) {
  const ladder = LADDERS[st.platform] || LADDERS.default
  const errors = []
  for (const [door, fn] of ladder) {
    try {
      const got = await fn(st)
      if (got && got.length) {
        const items = dedupe(got)
        const inStock = items.filter(i => !i.oos).length
        const priced = items.filter(i => i.price && Number(i.price) > 0).length
        /* A store with no ref AND no working feed earns nothing: the
           products render, shoppers click, and every sale is
           unattributed. That is worse than not carrying the store,
           and it is invisible from the front end — so say it loudly in
           the refresh report where it will actually be read. */
        let detail = `via ${door} (${inStock}/${items.length} in stock)`
        if (!isAttributed(st, door)) {
          detail += !st.network
            /* The common case here, and it was not covered: most of
               this registry is GoAffPro `?ref=`, and roughly half of
               it ships unattributed on purpose. On purpose is fine.
               Unnoticed is not, and this line is the only place it
               gets said. */
            ? '  [NO ATTRIBUTION — ' + st.key + ' has an empty `ref`; these clicks pay nothing. ' +
              'That may be deliberate (see _stores.js) but it is never silent]'
            : st.network === 'cj'
            ? '  [NO ATTRIBUTION — set cjPid and cjAid from the CJ dashboard or these clicks pay nothing]'
            : impactFault(st) === 'unset'
            ? '  [NO ATTRIBUTION — IMPACT.' + st.key + ' is empty; paste the whole tracking link or these clicks pay nothing]'
            : impactFault(st) === 'malformed'
            ? '  [NO ATTRIBUTION — IMPACT.' + st.key + ' is set but is NOT an Impact click URL; it must look like ' +
              'https://<vanity>.pxf.io/c/<partner>/<ad>/<campaign>. Re-copy it; these clicks pay nothing meanwhile]'
            : st.feedId === 0
            ? '  [NO ATTRIBUTION — feedId is still 0; set it and AWIN_API_KEY or these clicks pay nothing]'
            : '  [NO ATTRIBUTION — no ref and no feed; these clicks pay nothing]'
        }
        if (!priced) detail += '  [WARNING: no prices — likely a brand site, not a storefront]'
        else if (priced < items.length / 2) detail += `  [only ${priced}/${items.length} priced]`
        if (items.length && !inStock) detail += '  [WARNING: nothing in stock]'
        return { key: st.key, result: priced ? 'ok' : 'no prices', count: items.length, detail, items }
      }
      errors.push(`${door}: empty`)
    } catch (e) {
      errors.push(`${door}: ${e.message}`)
    }
  }
  return { key: st.key, result: 'FAILED', count: 0, detail: errors.join(' | '), items: [] }
}

/* ============================================================
   CACHE — in-memory per warm instance, CDN does the rest
   ============================================================ */
let CACHE = { at: 0, payload: null }
const TTL = 30 * 60 * 1000

/* Must stay below vercel.json's maxDuration with room to serialise the
   response. If you raise one, raise the other. */
const BUDGET_MS = 45000

/* ---- SHARED CACHE ----------------------------------------------------
   A full scrape of every active store does not fit comfortably inside
   maxDuration, and even when it does THE FIRST VISITOR PAID FOR IT. The
   in-memory CACHE only helps a warm instance and the CDN only helps once
   somebody has already waited. This survives both: the last good payload
   goes to Neon, and a cold instance serves that instead of scraping.

   Neon rather than a KV service, for the reasons in _db.js: the owner
   already runs Neon on Herbal Leaf, and a second datastore for one table
   is a second thing to pay for and forget the credentials of. With
   DATABASE_URL unset every call here no-ops and the behaviour is exactly
   what it was without a cache. */
const KV_KEY = 'gd:catalogue:v1'
/* Serve from the store rather than scrape while it is younger than this.
   Longer than TTL on purpose: stale prices beat a spinner, and a
   background refresh replaces them within the minute. */
const KV_MAX_AGE = 6 * 60 * 60 * 1000

async function cacheGet() {
  const raw = await kvGet(KV_KEY)
  if (!raw) return null
  try {
    const box = JSON.parse(raw)
    if (!box || !box.at || !box.payload) return null
    if (Date.now() - box.at > KV_MAX_AGE) return null
    return box
  } catch { return null }
}

async function cachePut(payload) {
  /* 24h expiry so a catalogue nobody has refreshed in a day disappears
     rather than being served forever. */
  await kvPut(KV_KEY, JSON.stringify({ at: Date.now(), payload }), 60 * 60 * 24)
}

export default async function handler(req, res) {
  const q = req.query || {}
  const fresh = 'refresh' in q

  /* Must go through respond(). Returning CACHE.payload directly meant a
     warm instance ignored ?summary, ?room and ?debug entirely and shipped
     the whole catalogue every time — which silently defeated the entire
     progressive-load design, because the manifest request WAS the full
     2,950-item payload. */
  if (!fresh && CACHE.payload && Date.now() - CACHE.at < TTL) {
    res.setHeader('X-Cache', 'HIT')
    return respond(res, CACHE.payload, q)
  }

  /* Cold instance. Ask the shared cache BEFORE scraping. This is the step
     that stops a first-time visitor waiting 42 seconds. */
  if (!fresh) {
    const box = await cacheGet()
    if (box) {
      CACHE = { at: box.at, payload: box.payload }
      res.setHeader('X-Cache', 'KV')
      res.setHeader('X-Cache-Age', String(Math.round((Date.now() - box.at) / 1000)))
      return respond(res, box.payload, q)
    }
  }

  DEADLINE = Date.now() + BUDGET_MS
  /* THE GATE. Not `!s.pending` — that is an editorial flag anybody
     can flip in a text editor at midnight, and flipping it is exactly
     how all three sister sites shipped a catalogue nobody had read.
     `publishable()` also demands a reviewed capture committed to
     data/captured/, which cannot be faked from this file. */
  const reviewed = reviewedKeys()
  const active = STORES.filter(s => publishable(s, reviewed).ok).map(s => ({
    ...s,
    /* THE REVIEW IS LOAD-BEARING, NOT PAPERWORK.
       `include` and `roomMap` are the two decisions a human makes
       when they read a capture, and until now NOTHING CONSUMED THEM.
       The draft generator produced them, data/captured/README.md
       promised "the two fields the ingest will read", and the ingest
       did not read them — so the entire review step was theatre that
       looked like a control.

       Attached per store here and applied in row(). */
    _review: readReviewed(s.key) || {},
  }))

  /* The whole point of leaving Apps Script: every store at once,
     instead of serial fetches on a 6-minute execution clock. */
  const results = await Promise.all(active.map(st =>
    scrapeStore(st).catch(e => ({ key: st.key, result: 'FAILED', count: 0, detail: e.message, items: [] }))
  ))

  /* Drop the checkout add-ons, gift cards and bundle placeholders here
     rather than in each strategy — one gate, and every door goes
     through it. See NONPRODUCT: 313 rows, 258 of them one shipping-
     protection line repeated, all of them carrying a price and so all
     of them eligible for the cheapest-per-unit badge. */
  const scraped = results.flatMap(r => r.items)
  const items = scraped.filter(i => !NONPRODUCT_TYPE.test(i.ptype || '')
    && !NONPRODUCT.test(
    [i.title, i.variant].filter(Boolean).join(' '))
    /* Shopify duplication artifacts: duplicating a product names it
       "<handle>-copy(-N)". RELX published one priced $99.99 flat across
       every variant next to the real $4.30 listing, so the phantom row
       both polluted per-pouch ranking and read as a 23x price spread on
       the same product. A live "-copy" handle is a store-side mistake by
       construction; drop it at the same gate as the other non-products. */
    && !/-copy(?:-\d+)?$/.test(String(i.url || '').split('?')[0]))
  const dropped = scraped.length - items.length

  const meta = results.map(({ key, result, count, detail }) => ({ key, result, count, detail }))

  const truncated = outOfTime()
  const payload = {
    ok: true,
    stores: publicStores(),
    meta,
    count: items.length,
    truncated,
    dropped,
    byRoom: items.reduce((a, i) => { a[i.room] = (a[i.room] || 0) + 1; return a }, {}),
    updated: new Date().toISOString(),
    items,
  }

  /* Don't sit on a short read for the full half hour. If the clock cut
     the scrape short, cache it briefly so the next visitor triggers a
     retry rather than inheriting the gap. */
  CACHE = { at: truncated ? Date.now() - (TTL - 3 * 60 * 1000) : Date.now(), payload }

  /* Publish for every future cold instance, so this 42-second scrape is
     the last one any visitor waits on. Only a complete read is worth
     sharing: caching a truncated catalogue would hand everyone else the
     gap this instance happened to hit. Awaited rather than fired and
     forgotten, because a serverless function is frozen the moment the
     response is sent and an unawaited write would simply never land. */
  if (!truncated && items.length) await cachePut(payload)

  res.setHeader('X-Cache', fresh ? 'BYPASS' : 'MISS')
  if (truncated) res.setHeader('X-Scrape', 'truncated')
  return respond(res, payload, q)
}

/* ============================================================
   RESPONSE MODES
   ------------------------------------------------------------
   The catalogue is scraped once and sliced on the way out, so a
   department request costs no extra fetching — only less JSON.

     ?summary        manifest only: stores, per-room counts, meta.
                     A few KB. The page renders its chrome from this
                     while the products are still in flight.
     ?room=pouch     one shelf
     (nothing)       everything
     ?debug          human-readable per-store report
   ============================================================ */
function manifest(p) {
  const { items, ...rest } = p
  return rest
}

function respond(res, payload, q) {
  if ('debug' in q) {
    /* Hand-built rather than spread, so anything added to the payload
       has to be added HERE too or it silently will not show. On
       Nicotia two fields were missing for exactly that reason, and
       their absence read as "that work never deployed" when it had. */
    return res.status(200).json({
      ok: true, updated: payload.updated, total: payload.count,
      truncated: payload.truncated,
      dropped: payload.dropped,
      byRoom: payload.byRoom,
      stores: payload.meta.map(m => `${m.key}: ${m.result} (${m.count}) — ${m.detail}`),
    })
  }
  if ('summary' in q) return res.status(200).json(manifest(payload))
  if (q.room && q.room !== 'all') {
    const want = String(q.room)
    return res.status(200).json({
      ...manifest(payload),
      room: want,
      items: payload.items.filter(i => i.room === want),
    })
  }
  return res.status(200).json(payload)
}
