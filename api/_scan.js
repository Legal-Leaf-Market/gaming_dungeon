/* ============================================================
   _scan.js — "Scan everything": the crawling half of the collector.
   ------------------------------------------------------------
   READ THIS BEFORE CHANGING ANY OF IT. This feature is a different
   ACT from the rest of the collector and the difference is not
   cosmetic.

   The bookmarklet's original claim was precise and worth keeping
   precise: it makes NO request to the merchant at all. It reads a
   page your browser already fetched because a human asked for it.
   That is research, and it is why the tool can point at any shop
   without a conversation.

   THIS MAKES REQUESTS THE HUMAN DID NOT INDIVIDUALLY ASK FOR. That
   is crawling. Calling it anything else would be lying to the next
   person who reads this file, and the whole reason the sister sites
   keep their scars written down is so nobody re-learns them by
   surprise.

   So it is built to be defensible rather than merely fast:

   1. IT READS robots.txt AND OBEYS IT. Not decoratively — a
      Disallow match means the URL is not fetched, the skip is
      counted, and the count is reported in the capture's coverage
      notes. Crawl-delay is honoured when it is longer than ours.
      This is the actual line that matters and it costs one request.

   2. IT PREFERS THE ENDPOINTS THE SHOP PUBLISHES FOR MACHINES.
      products.json, the WooCommerce Store API and sitemap.xml exist
      to be read by programs. Taking a whole catalogue in four
      requests to a documented JSON endpoint is both cheaper for us
      and gentler on them than walking two hundred HTML pages. HTML
      crawling is the FALLBACK, not the strategy.

   3. IT GOES ONE AT A TIME, WITH A DELAY. No concurrency. A human
      clicking quickly, not a fleet.

   4. IT IS CAPPED AND IT CAN BE STOPPED. A runaway crawl on
      somebody else's shop is the failure mode that gets an IP
      banned and deserves the affiliate account being closed.

   5. IT SAYS WHAT IT DID NOT SEE. Same rule as the rest of the
      tool, and the sitemap makes it sharper than before: a sitemap
      listing 1,180 product URLs against 214 captured is a fact
      about coverage that no amount of DOM reading would surface.

   ------------------------------------------------------------
   THE THING THIS UNLOCKS, AND IT IS THE REAL REASON TO BUILD IT
   ------------------------------------------------------------
   `fetch('/products.json')` FROM THE OPERATOR'S BROWSER IS
   SAME-ORIGIN. No CORS, no datacentre IP, no bot fingerprint.

   Kawaii Katz measured Tokyo Tiger at HTTP 403 from Vercel's IPs
   with a real browser User-Agent, and concluded correctly that it
   was host-level bot protection no header would get past. That
   merchant is in this repo's REJECTED list for exactly that reason.
   A shop that refuses a datacentre will usually serve the person
   already browsing it, so this path reaches catalogues the
   server-side scraper structurally cannot.

   ------------------------------------------------------------
   ONE EXTRACTOR, STILL
   ------------------------------------------------------------
   `scanSource` takes the extractor as an ARGUMENT rather than
   calling it by name. Both functions are serialised with
   Function.prototype.toString() into a bookmarklet, so neither can
   see the other's binding; passing it in is what keeps them one
   extractor instead of two that drift. Same reason `captureSource`
   now accepts a document: a page fetched into a DOMParser is read
   by exactly the same code as the live one.
   ============================================================ */

/**
 * The crawler. Serialised into the bookmarklet, so it may close over
 * NOTHING — no imports, no module constants, no sibling helpers.
 *
 * @param extract    captureSource, passed in. See the note above.
 * @param onProgress called with a status string; drives the panel.
 * @param opts       { maxUrls, delayMs, shouldStop }
 * @returns Promise of a capture-shaped object.
 */
export function scanSource(extract, onProgress, opts) {
  'use strict'
  opts = opts || {}
  var MAX_URLS = opts.maxUrls || 300
  var BASE_DELAY = opts.delayMs || 400
  var shouldStop = opts.shouldStop || function () { return false }

  var ORIGIN = location.origin
  var products = []
  var bySource = {}
  var notes = []
  var seen = {}
  var visited = {}
  var fetched = 0
  var robotsSkipped = 0
  var sitemapProductUrls = 0
  var platform = null
  var stopped = false
  /* WHY EACH DOOR DID NOT OPEN.
     Every request in here used to collapse into one null value: a 403, a
     404, a store that answers products.json with its own HTML, and a
     path robots.txt forbids were all the same value. So a scan that
     found nothing reported "the scan found nothing", and the four
     facts that would have told the operator WHICH it was had already
     been read and thrown away. The probe has said "NO FEED (got HTML,
     not JSON)" and "HTTP 402" for as long as it has existed; there
     was no reason for the scanner to say less. */
  var doors = []

  function note(s) { if (notes.indexOf(s) === -1) notes.push(s) }
  function say(s) { try { if (onProgress) onProgress(s) } catch (e) {} }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms) }) }

  function take(src, p) {
    if (!p || !p.title) return
    var k = String(p.url || p.title).split('?')[0].toLowerCase()
    if (seen[k]) return
    seen[k] = 1
    p.source = p.source || src
    products.push(p)
    bySource[src] = (bySource[src] || 0) + 1
  }

  /* ---------------------------------------------------------- robots
     A real parser, because a decorative one is worse than none: it
     would let somebody believe the crawl is polite while it walks
     straight through a Disallow. */
  var robots = { disallow: [], allow: [], delay: 0, present: false }

  function toRe(p) {
    var anchored = false
    if (p.charAt(p.length - 1) === '$') { anchored = true; p = p.slice(0, -1) }
    /* Escape everything regex-special EXCEPT "*", which robots.txt
       defines as its own wildcard and which becomes ".*". */
    var rx = p.replace(/[.+^${}()|[\]\\?]/g, '\\$&').replace(/\*/g, '.*')
    return new RegExp('^' + rx + (anchored ? '$' : ''))
  }

  function parseRobots(txt) {
    var lines = String(txt || '').split(/\r?\n/)
    var applies = false
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/#.*$/, '').trim()
      if (!line) continue
      var m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/)
      if (!m) continue
      var k = m[1].toLowerCase(), v = m[2].trim()
      if (k === 'user-agent') { applies = (v === '*'); continue }
      if (!applies) continue
      if (k === 'disallow' && v) robots.disallow.push({ p: v, re: toRe(v), len: v.length })
      if (k === 'allow' && v) robots.allow.push({ p: v, re: toRe(v), len: v.length })
      if (k === 'crawl-delay') {
        var d = parseFloat(v)
        if (isFinite(d) && d > 0) robots.delay = Math.min(d * 1000, 10000)
      }
    }
  }

  /* Longest match wins, Allow beats Disallow at equal length. That is
     the standard resolution and it matters: Shopify shops routinely
     Disallow a broad path and Allow a narrower one inside it. */
  function allowed(path) {
    var bestD = -1, bestA = -1, i
    for (i = 0; i < robots.disallow.length; i++) {
      if (robots.disallow[i].re.test(path) && robots.disallow[i].len > bestD) bestD = robots.disallow[i].len
    }
    if (bestD < 0) return true
    for (i = 0; i < robots.allow.length; i++) {
      if (robots.allow[i].re.test(path) && robots.allow[i].len > bestA) bestA = robots.allow[i].len
    }
    return bestA >= bestD
  }

  function delay() { return Math.max(BASE_DELAY, robots.delay) }

  /* ----------------------------------------------------------- get
     Every network request in this file goes through here, so the
     cap, the robots check, the throttle and the stop button are
     impossible to route around by accident. */
  function door(label, outcome) {
    if (label) doors.push({ door: label, outcome: outcome })
  }

  /* What an HTTP status MEANS to an operator deciding whether to try
     again, walk the shop by hand, or drop the merchant. A bare number
     makes them go and look it up; several of these are not what the
     number suggests. */
  function meaning(status) {
    if (status === 401 || status === 403) return 'HTTP ' + status + ' (refused, not missing: the shop is blocking this)'
    if (status === 402) return 'HTTP 402 (the Shopify store is frozen or unpaid)'
    if (status === 404) return 'HTTP 404 (no such endpoint here)'
    if (status === 429) return 'HTTP 429 (rate limited: slow the scan down or come back later)'
    if (status >= 500) return 'HTTP ' + status + ' (the shop errored, this may be worth one retry)'
    return 'HTTP ' + status
  }

  function get(url, asText, label) {
    if (stopped || shouldStop()) { stopped = true; door(label, 'stopped by the operator'); return Promise.resolve(null) }
    if (fetched >= MAX_URLS) { door(label, 'not tried: the request cap was already spent'); return Promise.resolve(null) }

    var u
    try { u = new URL(url, location.href) } catch (e) { door(label, 'not a usable URL'); return Promise.resolve(null) }
    if (u.origin !== ORIGIN) { door(label, 'off-site, so not fetched'); return Promise.resolve(null) }
    if (visited[u.href]) return Promise.resolve(null)
    visited[u.href] = 1

    if (robots.present && !allowed(u.pathname + u.search)) {
      robotsSkipped++
      door(label, 'robots.txt disallows ' + u.pathname)
      return Promise.resolve(null)
    }

    fetched++
    return wait(delay()).then(function () {
      return fetch(u.href, { headers: { accept: asText ? 'text/html,application/xml' : 'application/json' } })
    }).then(function (r) {
      if (!r) { door(label, 'no response'); return null }
      if (!r.ok) { door(label, meaning(r.status)); return null }
      var type = (r.headers && r.headers.get && r.headers.get('content-type')) || ''
      if (asText) return r.text()
      /* THE ONE THAT LOOKS LIKE SUCCESS. A shop with its feed switched
         off answers /products.json with 200 and its own storefront
         HTML, so the status is fine, the parse throws, and without
         this the operator is told nothing at all. */
      return r.text().then(function (body) {
        try {
          var parsed = JSON.parse(body)
          door(label, 'ok')
          return parsed
        } catch (e) {
          door(label, /^\s*</.test(body)
            ? 'answered with HTML, not JSON: the feed is off or behind a wall'
            : 'answered with something that is not JSON (' + (type || 'no content-type') + ')')
          return null
        }
      })
    }).catch(function () { door(label, 'the request failed outright (network, DNS or CORS)'); return null })
  }

  /* ------------------------------------------------- 1. products.json
     Shopify's own paged JSON. 250 rows a page, and it truncates
     SILENTLY rather than erroring, so the loop runs until a short
     page comes back. Nicotia's scraper found a 289-product vendor
     that way and the same guard is here. */
  function shopifyJson(page) {
    page = page || 1
    say('reading /products.json page ' + page + '…')
    return get('/products.json?limit=250&page=' + page, false, page === 1 ? '/products.json' : null).then(function (j) {
      if (!j || !j.products || !j.products.length) {
        /* An endpoint that ANSWERS and holds nothing is a different
           fact from one that is not there, and only one of the two is
           worth a second look. */
        if (j && j.products && !j.products.length && page === 1) {
          door('/products.json', 'answered, and the shop is empty (0 products)')
        }
        return products.length ? true : null
      }
      platform = 'shopify'
      var list = j.products
      for (var i = 0; i < list.length; i++) {
        var pr = list[i]
        var v = (pr.variants && pr.variants[0]) || {}
        var img = (pr.images && pr.images[0]) || {}
        take('products.json', {
          title: pr.title,
          url: ORIGIN + '/products/' + pr.handle,
          price: v.price != null ? parseFloat(v.price) : null,
          available: v.available == null ? null : !!v.available,
          sku: v.sku || null,
          vendor: pr.vendor || null,
          brand: pr.vendor || null,
          productType: pr.product_type || null,
          image: img.src || null,
          raw: pr,
        })
      }
      say(products.length + ' products so far…')
      /* A full page means there is probably another. */
      if (list.length >= 250 && page < 20) return shopifyJson(page + 1)
      return true
      /* Note the "products.length ? true : null" above: a shop whose
         last page is EXACTLY full runs one more page, gets an empty
         one, and used to return null all the way back up, so the
         WooCommerce probe then ran against a Shopify store that had
         just handed over its whole catalogue. */
    })
  }

  /* ------------------------------------------- 2. Woo Store API */
  function wooJson(page) {
    page = page || 1
    say('reading the WooCommerce Store API, page ' + page + '…')
    return get('/wp-json/wc/store/products?per_page=100&page=' + page, false,
      page === 1 ? '/wp-json/wc/store/products' : null).then(function (j) {
      if (!j || !j.length) return products.length ? true : null
      platform = 'woocommerce'
      for (var i = 0; i < j.length; i++) {
        var pr = j[i]
        var prices = pr.prices || {}
        var minor = Math.pow(10, prices.currency_minor_unit == null ? 2 : prices.currency_minor_unit)
        take('woo-store-api', {
          title: pr.name,
          url: pr.permalink,
          price: prices.price != null ? Number(prices.price) / minor : null,
          currency: prices.currency_code || null,
          sku: pr.sku || null,
          productType: (pr.categories && pr.categories[0] && pr.categories[0].name) || null,
          image: (pr.images && pr.images[0] && pr.images[0].src) || null,
          available: pr.is_in_stock == null ? null : !!pr.is_in_stock,
          raw: pr,
        })
      }
      say(products.length + ' products so far…')
      if (j.length >= 100 && page < 20) return wooJson(page + 1)
      return true
    })
  }

  /* ----------------------------------------------------- 3. sitemap
     Read even when the JSON endpoints already worked, because it is
     the only source of GROUND TRUTH ON CATALOGUE SIZE. "The sitemap
     lists 1,180 product URLs and we hold 214" is a fact about
     coverage that no amount of DOM reading produces, and it is the
     number that stops a sample being mistaken for a catalogue. */
  function readSitemap() {
    say('reading sitemap.xml…')
    return get('/sitemap.xml', true, '/sitemap.xml').then(function (xml) {
      if (!xml) return []
      var maps = locs(xml, 'sitemap')
      var urls = locs(xml, 'url')
      if (!maps.length) return urls
      /* An index. Only the product sitemaps are worth opening. */
      var wanted = []
      for (var i = 0; i < maps.length; i++) {
        if (/product/i.test(maps[i])) wanted.push(maps[i])
      }
      if (!wanted.length) wanted = maps.slice(0, 3)
      return wanted.slice(0, 6).reduce(function (chain, m) {
        return chain.then(function (acc) {
          return get(m, true).then(function (sub) {
            return acc.concat(sub ? locs(sub, 'url') : [])
          })
        })
      }, Promise.resolve(urls))
    }).then(function (urls) {
      var prod = []
      for (var i = 0; i < urls.length; i++) {
        if (/\/(products?|item|shop|p)\//i.test(urls[i])) prod.push(urls[i])
      }
      sitemapProductUrls = prod.length
      if (prod.length) note('The sitemap lists ' + prod.length + ' product URLs.')
      return prod
    })
  }

  function locs(xml, wrapper) {
    var out = []
    var re = new RegExp('<' + wrapper + '\\b[\\s\\S]*?<loc>\\s*([^<\\s]+)\\s*</loc>', 'gi')
    var m
    while ((m = re.exec(xml)) !== null) out.push(m[1])
    return out
  }

  /* ------------------------------------------------ 4. HTML fallback
     Only reached when the JSON doors gave nothing. Walks listing
     pages and reads them with the SAME extractor that reads the live
     page, via DOMParser. */
  function crawlHtml(urls) {
    if (!urls.length) return Promise.resolve()
    var i = 0
    function step() {
      if (i >= urls.length || stopped || shouldStop() || fetched >= MAX_URLS) return Promise.resolve()
      var u = urls[i++]
      say('reading ' + u.replace(ORIGIN, '') + ' (' + i + '/' + urls.length + ')…')
      return get(u, true).then(function (html) {
        if (html) {
          try {
            var doc = new DOMParser().parseFromString(html, 'text/html')
            var got = extract(doc, u)
            for (var n = 0; n < got.products.length; n++) take('crawl', got.products[n])
          } catch (e) { /* one unparseable page is not a failed scan */ }
        }
        say(products.length + ' products so far…')
        return step()
      })
    }
    return step()
  }

  /** Listing pages worth walking, discovered from the live page. */
  function listingUrls() {
    var out = []
    var a = document.querySelectorAll('a[href]')
    for (var i = 0; i < a.length && out.length < 60; i++) {
      var h = a[i].getAttribute('href') || ''
      if (!/\/(collections|collection|shop|category|product-category|catalog)\//i.test(h)) continue
      if (/\/products?\//i.test(h)) continue
      var abs
      try { abs = new URL(h, location.href).href.split('#')[0] } catch (e) { continue }
      if (abs.indexOf(ORIGIN) !== 0) continue
      if (out.indexOf(abs) === -1) out.push(abs)
    }
    return out
  }

  /* ------------------------------------------------------ bot wall
     A SHOP CAN TELL YOU IT DOES NOT WANT THIS, AND IT IS WORTH
     LISTENING BEFORE WALKING IT, NOT AFTER.

     Read off the page the operator already has open: cookies these
     products set, and the script paths they load. NEVER by probing,
     which would be the very thing being avoided. The distinction is
     the one this whole tool rests on: reading the page in front of
     you is unaffected, because a person loaded it in their own
     browser having passed whatever was asked. Walking pages 2..N from
     inside that session is a different act, it is exactly what these
     products exist to catch, and the session and address they flag
     belong to the OPERATOR rather than to us. */
  function botWall() {
    var found = []
    var cookie = ''
    try { cookie = document.cookie || '' } catch (e) {}
    if (/(^|;\s*)(ak_bmsc|bm_sv|bm_sz|_abck)=/.test(cookie)) found.push('Akamai Bot Manager')
    if (/(^|;\s*)(__cf_bm|cf_clearance)=/.test(cookie)) found.push('Cloudflare bot management')
    if (/(^|;\s*)datadome=/.test(cookie)) found.push('DataDome')
    if (/(^|;\s*)(incap_ses|visid_incap)/.test(cookie)) found.push('Imperva')
    if (/(^|;\s*)_px(hd|vid|cts)?=/.test(cookie)) found.push('PerimeterX')
    try {
      var scripts = document.querySelectorAll('script[src]')
      for (var i = 0; i < scripts.length; i++) {
        var src = scripts[i].getAttribute('src') || ''
        if (/akam|_bm\/|bm-verify/i.test(src) && found.indexOf('Akamai Bot Manager') === -1) {
          found.push('Akamai Bot Manager')
        }
        if (/datadome/i.test(src) && found.indexOf('DataDome') === -1) found.push('DataDome')
        if (/perimeterx|px-cloud/i.test(src) && found.indexOf('PerimeterX') === -1) found.push('PerimeterX')
      }
    } catch (e) {}
    return found
  }

  var wall = botWall()
  if (wall.length) {
    note('THIS SHOP RUNS ' + wall.join(' and ') + '. Reading the page you are on is unaffected. ' +
      'Walking the rest of the shop from inside your own session is what that product is built to ' +
      'catch, and it is YOUR session and address it flags. Stop unless there is an arrangement ' +
      'with this merchant.')
  }

  /* --------------------------------------------------------- run */
  say('reading robots.txt…')
  return fetch('/robots.txt').then(function (r) {
    return r && r.ok ? r.text() : ''
  }).catch(function () { return '' }).then(function (txt) {
    if (txt && /user-agent/i.test(txt)) {
      robots.present = true
      parseRobots(txt)
      note('robots.txt was read and is being obeyed' +
        (robots.delay ? ' (crawl-delay ' + (robots.delay / 1000) + 's)' : '') + '.')
    } else {
      note('No robots.txt found. Crawling at one request every ' + (BASE_DELAY / 1000) + 's regardless.')
    }
    return shopifyJson()
  }).then(function (ok) {
    if (ok) return null
    return wooJson()
  }).then(function () {
    return readSitemap()
  }).then(function (sitemapProducts) {
    if (products.length) return null
    /* No JSON door opened. Walk HTML: listing pages first, and only
       fall back to individual product URLs from the sitemap if there
       are no listings, since that is one request per product. */
    var pages = listingUrls()
    if (pages.length) {
      note('No JSON endpoint answered, so ' + pages.length + ' listing pages were walked instead.')
      return crawlHtml(pages)
    }
    if (sitemapProducts.length) {
      var slice = sitemapProducts.slice(0, Math.min(MAX_URLS - fetched, 120))
      note('No JSON endpoint and no listing pages. Read ' + slice.length +
           ' product pages individually from the sitemap.')
      return crawlHtml(slice)
    }
    return null
  }).then(function () {
    if (stopped || shouldStop()) note('STOPPED EARLY by the operator. This is a partial capture.')
    if (fetched >= MAX_URLS) {
      note('HIT THE ' + MAX_URLS + '-REQUEST CAP. This is a partial capture; raise the cap or ' +
           'capture the rest by hand.')
    }
    if (robotsSkipped) {
      note(robotsSkipped + ' URLs were skipped because robots.txt disallows them.')
    }
    if (sitemapProductUrls && products.length < sitemapProductUrls) {
      note('The sitemap lists ' + sitemapProductUrls + ' products and this scan holds ' +
           products.length + '. That is a SAMPLE, not a catalogue.')
    }
    /* SAY WHICH DOORS WERE TRIED AND WHAT EACH ONE ANSWERED. This is
       the difference between "the scan found nothing" and "the feed
       is switched off, the sitemap is forbidden, and there are no
       collection links on this page", which are the same run and only
       one of them tells the operator what to do next. */
    var shut = []
    for (var d = 0; d < doors.length; d++) {
      if (doors[d].outcome !== 'ok') shut.push(doors[d].door + ' -> ' + doors[d].outcome)
    }
    if (shut.length) note('Doors tried: ' + shut.join('; ') + '.')

    if (!products.length) {
      note('The scan found nothing. Try the plain capture on a collection page instead: some ' +
           'shops serve their grid only to a real navigation.')
    }

    return {
      pageUrl: location.href,
      host: location.hostname,
      title: document.title,
      at: new Date().toISOString(),
      platform: platform,
      products: products,
      bySource: bySource,
      scan: {
        requests: fetched,
        robotsSkipped: robotsSkipped,
        robotsPresent: robots.present,
        /* Structured as well as prose, so the capture store keeps the
           reason a merchant produced nothing rather than just the
           zero. A row saying "0 products" is indistinguishable from a
           shop that has none. */
        doors: doors,
        botWall: wall,
      },
      coverage: {
        /* The sitemap's count is a far better claimedTotal than a
           number scraped off a results header, so it wins when we
           have one. */
        claimedTotal: sitemapProductUrls || null,
        pagination: [],
        lazyLoaded: false,
        notes: notes,
      },
    }
  })
}
