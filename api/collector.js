/* ============================================================
   /api/collector — the program that runs on the merchant's page.
   ------------------------------------------------------------
   PORTED FROM legal-leafmarket.com/coldwater-collect, which has been
   in operator use long enough to have paid for every awkward thing
   in here. THE AWKWARD THINGS ARE THE POINT. A first attempt at this
   is a bookmarklet that reads the DOM and POSTs it, and that version
   fails on precisely the shops worth capturing, silently, in four
   different ways. Each one below is a lesson somebody already bought.

   WHAT IT IS. A person browses a merchant's site in their own
   browser, as a visitor, and clicks a bookmark. It reads the products
   out of the page already rendered in front of them. NO REQUEST IS
   MADE TO THE MERCHANT AT ALL and nothing is crawled: the page was
   fetched because a human asked for it. That is a different act from
   a scraper, which is a program that visits pages on its own, at
   machine speed, without a person.

   WHAT IT IS FOR. Knowing what is there before building anything.
   Deciding whether to chase a merchant, build a room, or model a
   product has to rest on what they actually stock, at what prices,
   under which product types. Guessing that from a homepage is how a
   week goes into a room with forty products in it.

   AND WHERE THE LINE IS, because the tool does not enforce it.
   Reading a page you are on is research. Republishing that catalogue
   as public listings is redistribution, governed by the merchant's
   own terms, and nothing about how the bytes were obtained changes
   that answer. A capture lands in the capture store, which is a
   different place from the catalogue, so publishing cannot happen by
   accident while doing research.

   ------------------------------------------------------------
   THE FOUR LESSONS
   ------------------------------------------------------------
   1. A BOOKMARKLET IS EXEMPT FROM CSP. WHAT IT LOADS IS NOT.
      The obvious build injects `<script src=...>`, which a shop with
      a strict `script-src` refuses — and the refusal is SILENT,
      because a blocked script fires no error event in most browsers.
      It does not fail, it simply never runs, and it reads to the
      operator as "the bookmark is broken". So there are two
      bookmarklets: a loader, and a SELF-CONTAINED one carrying this
      whole program in its URL, which has nothing left to refuse.
      Under both there is console paste, which nothing can block.

   2. A SELF-CONTAINED BOOKMARKLET IS A SNAPSHOT, AND A STALE ONE
      LIES. Once dragged it never updates. On the sister site a shop
      was reported broken at five products months after the fix, from
      a bookmark that predated it. A stale reader does not throw: it
      returns a SMALLER catalogue that looks entirely plausible. So
      this carries a BUILD stamp, the panel prints it, /collect prints
      the current one, and the two differing is the whole diagnostic.
      It is a hash of the source, never a hand-typed version: a number
      somebody has to remember to bump stops moving on the day it
      matters.

   3. connect-src CAN BLOCK THE SEND AFTER A SUCCESSFUL READ. All the
      work done, nothing delivered. That is the page's decision and
      this does not argue with it; it uses a route CSP does not
      govern instead. Opening a tab is a NAVIGATION, not a
      connection, so the collector opens /collect?receive=1 and hands
      the capture over with postMessage. From there the POST is
      same-origin and there is nothing cross-origin left to forbid.
      Both ends pin the origin. Beneath even that is the clipboard,
      which no policy can stop.

   4. WHAT IS IN THE DOM IS ALL IT CAN SEE. A lazy grid has to be
      scrolled to the bottom first, and a menu in a cross-origin
      iframe cannot be read at all — that is the same-origin policy
      working correctly rather than a bug to route around; open the
      frame in its own tab instead. The panel says both in words
      rather than leaving them to be discovered.

   ------------------------------------------------------------
   ONE EXTRACTOR, SERIALISED
   ------------------------------------------------------------
   `captureSource` is read with Function.prototype.toString() and
   pasted into the bookmarklet, so IT MAY CLOSE OVER NOTHING: no
   imports, no module constants, no helper functions beside it.
   test/collector.test.mjs enforces that, parses the assembled
   program with `new Function` so a syntax error cannot reach a
   stranger's website, and checks the URL still fits a bookmarks bar.

   The sister site's collector is a committed 210KB JS file sitting
   beside the source it duplicates. Ours is generated per request from
   this one, so the loader, the inline build and the console paste are
   the same program by construction and cannot drift.

   EVERYTHING BELOW IS ES5. No arrow functions, no template literals,
   no const. It is inlined into a `javascript:` URL and pasted into
   consoles on sites of unknown vintage, and a stray backtick inside
   a template literal inside a template literal is a debugging
   afternoon nobody needs.
   ============================================================ */

import { createHash } from 'node:crypto'
import { scanSource } from './_scan.js'

const INGEST_PATH = '/api/capture'
const INSTALL_PATH = '/collect'

/* ============================================================
   THE EXTRACTOR. Five readers, most reliable first, all of them
   run and their results merged rather than the first one winning.
   A page carrying rich JSON-LD and a thin DOM should not be read
   by the DOM reader, and a page with neither should still return
   something. `bySource` reports which found what, so a thin result
   is explicable rather than mysterious.
   ============================================================ */
function captureSource(doc, baseHref) {
  'use strict'

  /* READS ANY DOCUMENT, NOT JUST THE LIVE ONE.
     "Scan everything" fetches listing pages and parses them with
     DOMParser, and those pages have to be read by exactly this code
     or there are two extractors that drift apart silently. Defaults
     to the live page, so the plain capture path is unchanged. */
  doc = doc || document
  baseHref = baseHref || location.href
  var LIVE = (doc === document)

  var products = []
  var notes = []
  var bySource = {}

  function note(s) { if (notes.indexOf(s) === -1) notes.push(s) }
  function add(src, p) {
    if (!p || !p.title) return
    products.push(p)
    bySource[src] = (bySource[src] || 0) + 1
  }

  function text(v) {
    if (typeof v === 'string') { var t = v.trim(); return t ? t : null }
    if (typeof v === 'number') return String(v)
    return null
  }

  /* PRICE PARSING IS WHERE A CAPTURE QUIETLY GOES WRONG.
     "1,299" and "1.299" are both one thousand two hundred and
     ninety-nine in some locale, and "12.99" is not. The rule: a
     separator with exactly two digits after it is a decimal point;
     anything else is a thousands separator and gets deleted. Getting
     this backwards turns a EUR 1.299 monitor into EUR 1.30, which
     looks like a bargain rather than like a bug. */
  function price(v) {
    var raw = typeof v === 'number' ? String(v) : (typeof v === 'string' ? v : '')
    var m = raw.replace(/\s/g, '').match(/-?\d[\d.,]*/)
    if (!m) return null
    var d = m[0]
    var lastComma = d.lastIndexOf(',')
    var lastDot = d.lastIndexOf('.')
    var last = Math.max(lastComma, lastDot)
    if (last > -1) {
      var tail = d.slice(last + 1)
      if (tail.length === 2) d = d.slice(0, last).replace(/[.,]/g, '') + '.' + tail
      else d = d.replace(/[.,]/g, '')
    }
    var n = parseFloat(d)
    return isFinite(n) ? n : null
  }

  function absolute(href) {
    var v = text(href)
    if (!v) return null
    try { return new URL(v, baseHref).href } catch (e) { return null }
  }

  /* ---------------------------------------------------- 1. JSON-LD */
  function walkLd(node, depth) {
    if (!node || depth > 8) return
    if (Object.prototype.toString.call(node) === '[object Array]') {
      for (var i = 0; i < node.length; i++) walkLd(node[i], depth + 1)
      return
    }
    if (typeof node !== 'object') return

    var type = node['@type']
    var types = Object.prototype.toString.call(type) === '[object Array]'
      ? type.map(String) : [String(type == null ? '' : type)]

    if (types.join(' ').toLowerCase().indexOf('product') > -1) {
      var offers = node.offers
      if (Object.prototype.toString.call(offers) === '[object Array]') offers = offers[0]
      offers = offers || {}
      var brand = node.brand
      if (brand && typeof brand === 'object') brand = brand.name
      var image = Object.prototype.toString.call(node.image) === '[object Array]' ? node.image[0] : node.image
      add('json-ld', {
        title: text(node.name),
        url: absolute(node.url || (offers && offers.url)),
        price: price(offers && offers.price),
        currency: text(offers && offers.priceCurrency),
        available: offers && offers.availability ? /instock|limited/i.test(String(offers.availability)) : null,
        sku: text(node.sku || node.mpn),
        brand: text(brand),
        vendor: text(brand),
        productType: text(node.category),
        image: absolute(image),
        source: 'json-ld',
        raw: node,
      })
    }
    /* Keep walking regardless: a Product is often a property of a
       page-level node rather than the top of the graph. */
    for (var k in node) if (Object.prototype.hasOwnProperty.call(node, k)) {
      if (k.charAt(0) !== '@' || k === '@graph') walkLd(node[k], depth + 1)
    }
  }

  var ld = doc.querySelectorAll('script[type="application/ld+json"]')
  for (var i = 0; i < ld.length; i++) {
    try { walkLd(JSON.parse(ld[i].textContent || 'null'), 0) }
    catch (e) { note('One JSON-LD block on this page is malformed and was skipped.') }
  }

  /* -------------------------------------------------- 2. Microdata */
  var micro = doc.querySelectorAll('[itemtype*="schema.org/Product" i]')
  for (var m = 0; m < micro.length; m++) {
    (function (scope) {
      function prop(n) {
        var el = scope.querySelector('[itemprop="' + n + '"]')
        if (!el) return null
        return text(el.getAttribute('content') || el.getAttribute('href') || el.textContent)
      }
      var raw = {}
      var all = scope.querySelectorAll('[itemprop]')
      for (var j = 0; j < all.length; j++) {
        var nm = all[j].getAttribute('itemprop')
        if (nm && !(nm in raw)) raw[nm] = text(all[j].getAttribute('content') || all[j].textContent)
      }
      add('microdata', {
        title: prop('name'),
        url: absolute(prop('url')),
        price: price(prop('price')),
        currency: prop('priceCurrency'),
        sku: prop('sku'),
        brand: prop('brand'),
        vendor: prop('brand'),
        image: absolute(prop('image')),
        source: 'microdata',
        raw: raw,
      })
    })(micro[m])
  }

  /* -------------------------------------------------- 3. OpenGraph
     Only ever describes ONE product — the page you are on — so it is
     worth nothing on a collection page and everything on a product
     page a merchant built without structured data. */
  function meta(n) {
    var el = doc.querySelector('meta[property="' + n + '"]') ||
             doc.querySelector('meta[name="' + n + '"]')
    return el ? text(el.getAttribute('content')) : null
  }
  if (meta('og:type') && /product/i.test(meta('og:type'))) {
    var ogRaw = {}
    var metas = doc.querySelectorAll('meta[property^="og:"],meta[property^="product:"]')
    for (var q = 0; q < metas.length; q++) {
      var pk = metas[q].getAttribute('property') || metas[q].getAttribute('name')
      if (pk) ogRaw[pk] = text(metas[q].getAttribute('content'))
    }
    add('opengraph', {
      title: meta('og:title'),
      url: absolute(meta('og:url') || baseHref),
      price: price(meta('product:price:amount') || meta('og:price:amount')),
      currency: meta('product:price:currency') || meta('og:price:currency'),
      image: absolute(meta('og:image')),
      source: 'opengraph',
      raw: ogRaw,
    })
  }

  /* -------------------------------- 4. Platform globals
     The richest source when it exists, because it is the shop's own
     data rather than a rendering of it: real variant ids, real
     inventory, real product_type. */
  var platform = null
  try {
    /* WINDOW GLOBALS ONLY EXIST FOR THE LIVE PAGE. A document parsed
       out of fetched HTML has no ShopifyAnalytics: the globals belong
       to the window that ran the scripts, not to the markup. Reading
       them for a fetched page would attribute THIS page's product to
       every page in the crawl. */
    if (!LIVE) throw 0
    var w = window
    if (w.ShopifyAnalytics && w.ShopifyAnalytics.meta) {
      platform = 'shopify'
      var pm = w.ShopifyAnalytics.meta.product
      if (pm) {
        var vs = pm.variants || []
        for (var v = 0; v < vs.length; v++) {
          add('shopify-meta', {
            title: (pm.type ? pm.type + ' — ' : '') + (vs[v].name || pm.type || 'product'),
            url: absolute(location.pathname + '?variant=' + vs[v].id),
            /* Shopify's analytics meta is already in cents. */
            price: typeof vs[v].price === 'number' ? vs[v].price / 100 : price(vs[v].price),
            sku: text(vs[v].sku),
            vendor: text(pm.vendor),
            productType: text(pm.type),
            variantId: vs[v].id,
            source: 'shopify-meta',
            raw: vs[v],
          })
        }
      }
    }
    if (!platform && w.__NEXT_DATA__) platform = 'next'
    if (!platform && w.BCData) platform = 'bigcommerce'
    if (!platform && w.wc_add_to_cart_params) platform = 'woocommerce'
    if (!platform && w.Sqzl) platform = 'squarespace'
  } catch (e) { /* a global that throws on read is not worth a failure */ }

  /* ------------------------------------------------------- 5. DOM
     THE LAST RESORT, AND THE ONE THAT ACTUALLY CARRIES MOST GRIDS.
     Anchors that look like product links and contain something
     price-shaped. Deliberately loose: over-collecting is cheap here
     because everything is filtered downstream, and under-collecting
     is what produces a plausible-looking half catalogue. */
  var seen = {}
  for (var s = 0; s < products.length; s++) if (products[s].url) seen[products[s].url] = 1

  var PRICE_RE = /(?:[$£€¥]|USD|GBP|EUR|CAD|AUD)\s?\d[\d.,]*/
  var anchors = doc.querySelectorAll('a[href]')
  for (var a = 0; a < anchors.length; a++) {
    var el = anchors[a]
    var href = el.getAttribute('href') || ''
    if (!/\/(products?|item|shop|p|dp|goods|collections\/[^/]+\/products)\//i.test(href)) continue
    var url = absolute(href)
    if (!url || seen[url]) continue

    /* Walk up to the card so the price and image come from the same
       tile rather than from whatever happened to be adjacent. */
    var card = el
    for (var up = 0; up < 4 && card.parentElement; up++) {
      if (PRICE_RE.test(card.textContent || '')) break
      card = card.parentElement
    }
    var blob = (card.textContent || '').replace(/\s+/g, ' ').trim()
    var pm2 = blob.match(PRICE_RE)

    var title = text(el.getAttribute('title')) ||
                text(el.getAttribute('aria-label')) ||
                text((el.textContent || '').replace(/\s+/g, ' '))
    if (!title) {
      var img = card.querySelector('img[alt]')
      title = img ? text(img.getAttribute('alt')) : null
    }
    if (!title || title.length < 2) continue

    var imgEl = card.querySelector('img')
    seen[url] = 1
    add('dom', {
      title: title,
      url: url,
      price: pm2 ? price(pm2[0]) : null,
      image: imgEl ? absolute(imgEl.getAttribute('src') || imgEl.getAttribute('data-src')) : null,
      source: 'dom',
      /* PER-CARD HTML IS KEPT ON PURPOSE. It is the only way to
         re-derive a field the extractor did not know to look for,
         without re-browsing forty pages. Capture everything. */
      raw: { html: (card.outerHTML || '').slice(0, 4000), text: blob.slice(0, 600) },
    })
  }

  /* -------------------------------------------------- coverage
     SAY WHAT THE CAPTURE DID NOT SEE. A capture holding 24 of 1,180
     products looks exactly like a small catalogue, and a known gap is
     worth far more than a clean-looking number. */
  var claimedTotal = null
  var bodyText = (doc.body ? (doc.body.innerText || doc.body.textContent || '') : '').slice(0, 20000)
  var cm = bodyText.match(/([\d,]{2,})\s+(?:results?|products?|items?)\b/i)
  if (cm) { var n = parseInt(cm[1].replace(/,/g, ''), 10); if (isFinite(n)) claimedTotal = n }

  var pager = []
  var pagerLinks = doc.querySelectorAll('a[href*="page="],a[rel="next"],.pagination a,[class*="pagination"] a')
  for (var pg = 0; pg < pagerLinks.length && pager.length < 30; pg++) {
    var ph = absolute(pagerLinks[pg].getAttribute('href'))
    if (ph && pager.indexOf(ph) === -1) pager.push(ph)
  }
  if (pager.length) note('This page has pagination. Capture each page; they merge into one record.')
  if (claimedTotal && products.length < claimedTotal) {
    note('This page claims ' + claimedTotal + ' results and ' + products.length +
         ' were read. That is a SAMPLE, not a catalogue.')
  }

  /* Lazy grids: the honest signal is a page much taller than the
     viewport with few products read. */
  var lazy = false
  try {
    /* A measurement of the viewport, so it means nothing off-screen. */
    if (!LIVE) throw 0
    lazy = doc.body.scrollHeight > innerHeight * 2.5 && products.length < 12
    if (lazy) note('This grid may lazy-load. Scroll to the bottom, then run this again.')
  } catch (e) {}

  var frames = doc.querySelectorAll('iframe')
  if (frames.length) {
    note('There are ' + frames.length + ' iframes on this page. A cross-origin one cannot be ' +
         'read from here — that is the same-origin policy, not a bug. Open it in its own tab.')
  }
  if (!products.length) {
    note('Nothing was found. If the page is still loading, wait and run it again. An empty ' +
         'capture is refused rather than stored, so this cannot overwrite earlier work.')
  }

  return {
    pageUrl: baseHref,
    host: (function () { try { return new URL(baseHref).hostname } catch (e) { return '' } })(),
    title: doc.title,
    at: new Date().toISOString(),
    platform: platform,
    products: products,
    bySource: bySource,
    coverage: {
      claimedTotal: claimedTotal,
      pagination: pager,
      lazyLoaded: lazy,
      notes: notes,
    },
  }
}

/* ============================================================
   The operator's half: the panel, the confirm step, and the three
   ways of getting a result home. ES5, for the reason in the header.
   ============================================================ */
const OPERATOR_SOURCE = `
(function(){
  "use strict";
  if (window.__GD_COLLECTOR__) { try { document.getElementById("gd-collector").remove(); } catch(e){} }
  window.__GD_COLLECTOR__ = true;

  var BUILD = "%%BUILD%%";

  /* WHERE THIS CAME FROM, AND IT IS NOT OPTIONAL. The collector reads
     its API origin off its own script tag, and an INLINED program has
     no currentScript — so without the fallback a self-contained
     bookmarklet built on a preview deploy would silently send its
     captures to production. /collect and the copy button both prepend
     __GD_COLLECTOR_SRC__ for exactly this reason, so all three
     install methods agree about where a capture lands. */
  var SRC = window.__GD_COLLECTOR_SRC__ ||
    (document.currentScript && document.currentScript.src) || "";
  var ORIGIN = "";
  try { ORIGIN = new URL(SRC).origin; } catch (e) { ORIGIN = "%%ORIGIN%%"; }

  /* BOTH HALVES ARE INLINED, AND THE SCANNER TAKES THE EXTRACTOR AS
     AN ARGUMENT. Neither can see the other's binding once serialised,
     so passing it in is what keeps them ONE extractor rather than two
     that drift. */
  var EXTRACT = (%%CAPTURE%%);
  var SCAN = (%%SCAN%%);

  var capture = EXTRACT();
  capture.build = BUILD;
  var scanning = false, stopFlag = false;

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"]/g, function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  var panel = document.createElement("div");
  panel.id = "gd-collector";
  panel.setAttribute("style",
    "position:fixed;top:16px;right:16px;z-index:2147483647;width:346px;max-height:88vh;" +
    "overflow:auto;background:#12091b;color:#efe6f7;border:1px solid #8b5cf6;border-radius:12px;" +
    "font:13px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif;padding:14px 16px;" +
    "box-shadow:0 14px 50px rgba(0,0,0,.6)");

  var per = Object.keys(capture.bySource).map(function(k){
    return k + ": " + capture.bySource[k]; }).join(", ");

  var notes = capture.coverage.notes.map(function(n){
    return '<li style="margin:5px 0">' + esc(n) + "</li>"; }).join("");

  panel.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">' +
      '<strong id="gd-count" style="font-size:15px;color:#c4b5fd">' + capture.products.length + ' products</strong>' +
      '<button id="gd-x" style="background:none;border:0;color:#a390c4;font-size:18px;cursor:pointer;line-height:1">&times;</button>' +
    '</div>' +
    '<div id="gd-per" style="opacity:.8;margin-top:2px">' + esc(per || "nothing found") + '</div>' +
    (capture.platform ? '<div style="opacity:.6;margin-top:2px">platform: ' + esc(capture.platform) + '</div>' : "") +
    '<ul id="gd-notes" style="margin:9px 0 0;padding-left:18px;opacity:.92;color:#f5d0a9">' + notes + '</ul>' +
    '<label style="display:block;margin-top:12px;opacity:.85">Merchant key' +
      '<input id="gd-key" value="' + esc(guessKey()) + '" ' +
      'style="width:100%;margin-top:3px;padding:7px 8px;border-radius:7px;border:1px solid #43306b;' +
      'background:#0a0413;color:#efe6f7;font:13px ui-monospace,monospace"></label>' +
    '<label style="display:block;margin-top:8px;opacity:.85">Admin token' +
      '<input id="gd-token" type="password" placeholder="ADMIN_PASSCODE" ' +
      'style="width:100%;margin-top:3px;padding:7px 8px;border-radius:7px;border:1px solid #43306b;' +
      'background:#0a0413;color:#efe6f7"></label>' +
    '<button id="gd-scan" style="width:100%;margin-top:12px;background:none;color:#c4b5fd;' +
      'border:1px solid #8b5cf6;border-radius:999px;padding:9px 14px;cursor:pointer;font:inherit;' +
      'font-weight:700">Scan everything</button>' +
    '<div id="gd-scanmsg" style="margin-top:6px;opacity:.7;font-size:12px"></div>' +
    '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">' +
      '<button id="gd-send" style="flex:1;background:#8b5cf6;color:#0a0413;border:0;' +
      'border-radius:999px;padding:9px 14px;cursor:pointer;font:inherit;font-weight:700">Send</button>' +
      '<button id="gd-copy" style="background:none;color:#c4b5fd;border:1px solid #43306b;' +
      'border-radius:999px;padding:9px 14px;cursor:pointer;font:inherit">Copy</button>' +
    '</div>' +
    '<div id="gd-msg" style="margin-top:9px;opacity:.85"></div>' +
    '<div style="margin-top:10px;opacity:.45;font-size:11px">build ' + BUILD + '</div>';

  document.body.appendChild(panel);

  function $(id){ return document.getElementById(id); }
  function say(t){ $("gd-msg").innerHTML = esc(t); }
  $("gd-x").onclick = function(){ panel.remove(); };

  /* A GUESS, SHOWN IN AN EDITABLE FIELD RATHER THAN APPLIED SILENTLY.
     Filing a capture under the wrong merchant is the failure that
     gets found by a shopper rather than by us, so it is confirmed
     every single time. */
  function guessKey(){
    return location.hostname.replace(/^www\\./, "")
      .replace(/\\.myshopify\\.com$/, "")
      .replace(/\\.(com|co|co\\.uk|net|org|io|shop|store|site|gg)$/, "")
      .replace(/[^a-z0-9]+/gi, "");
  }

  function body(){
    return {
      merchantKey: ($("gd-key").value || "").trim(),
      build: BUILD,
      capture: capture
    };
  }

  /* ----------------------------------------------------------- scan
     A DIFFERENT ACT FROM THE REST OF THIS TOOL, and the button says
     so before it does anything. Everything else here reads a page the
     browser already fetched; this fetches pages nobody individually
     asked for. It obeys robots.txt, goes one request at a time with a
     delay, caps itself, and can be stopped. See api/_scan.js. */
  $("gd-scan").onclick = function(){
    if (scanning) { stopFlag = true; say("stopping after the current request..."); return; }
    scanning = true; stopFlag = false;
    $("gd-scan").textContent = "Stop scanning";
    var out = $("gd-scanmsg");

    SCAN(EXTRACT,
      function(msg){ out.textContent = msg; },
      { shouldStop: function(){ return stopFlag; } }
    ).then(function(res){
      scanning = false;
      $("gd-scan").textContent = "Scan everything";
      if (!res || !res.products.length) {
        out.textContent = "Scan found nothing. The plain capture above still holds " +
          capture.products.length + ".";
        return;
      }
      /* THE SCAN REPLACES THE CAPTURE RATHER THAN ADDING TO IT. It is
         a superset by construction: the live page's own products come
         back through products.json or the crawl. Merging the two
         would double-count anything the DOM reader and the JSON
         endpoint both saw under slightly different URLs. */
      res.build = BUILD;
      capture = res;
      out.textContent = "Scan done: " + res.products.length + " products in " +
        res.scan.requests + " requests" +
        (res.scan.robotsSkipped ? ", " + res.scan.robotsSkipped + " skipped by robots.txt" : "") + ".";
      redrawCounts();
    }).catch(function(e){
      scanning = false;
      $("gd-scan").textContent = "Scan everything";
      out.textContent = "Scan failed: " + (e && e.message ? e.message : "unknown");
    });
  };

  /* The header and the notes are the two things a scan changes. */
  function redrawCounts(){
    var per = Object.keys(capture.bySource).map(function(k){
      return k + ": " + capture.bySource[k]; }).join(", ");
    $("gd-count").textContent = capture.products.length + " products";
    $("gd-per").textContent = per || "nothing found";
    $("gd-notes").innerHTML = capture.coverage.notes.map(function(n){
      return '<li style="margin:5px 0">' + esc(n) + "</li>"; }).join("");
  }

  $("gd-copy").onclick = function(){
    var payload = JSON.stringify(body(), null, 2);
    window.__GD_CAPTURE__ = body();
    try {
      navigator.clipboard.writeText(payload);
      say("Copied " + Math.round(payload.length / 1024) + " KB. Paste it into " + ORIGIN + "%%INSTALL%%.");
    } catch (e) {
      say("Could not copy. Open the console and read window.__GD_CAPTURE__ instead.");
    }
  };

  $("gd-send").onclick = function(){
    var token = ($("gd-token").value || "").trim();
    if (!token) { say("Paste the admin passcode first."); return; }
    if (!($("gd-key").value || "").trim()) { say("Name the merchant first."); return; }
    $("gd-send").disabled = true;
    say("Sending " + capture.products.length + " products...");

    fetch(ORIGIN + "%%INGEST%%", {
      method: "POST",
      headers: { "content-type": "application/json", "x-gd-admin-token": token },
      body: JSON.stringify(body())
    })
      .then(function(r){ return r.json().then(function(j){ return { ok: r.ok, j: j }; }); })
      .then(function(o){
        $("gd-send").disabled = false;
        say(o.ok
          ? "Stored. " + o.j.added + " new, " + o.j.total + " on file for " + o.j.merchantKey + "."
          : "Refused: " + (o.j.error || "unknown"));
      })
      .catch(function(){
        /* A THROWN fetch HERE IS ALMOST ALWAYS CSP, NOT AN OUTAGE.
           connect-src refusals surface as a bare TypeError with no
           detail, so there is nothing to read and no point reporting
           it as a network error. The relay is tried automatically
           rather than offered, because an operator who has already
           captured the page should not have to know what connect-src
           is. */
        say("This shop blocks sending directly. Opening a relay tab...");
        relay(token);
      });
  };

  function relay(token){
    var win = window.open(ORIGIN + "%%INSTALL%%?receive=1", "gdRelay");
    if (!win) { say("Allow pop-ups for this site, then press Send again. Or press Copy."); return; }
    var sent = false;
    window.addEventListener("message", function(ev){
      if (ev.origin !== ORIGIN || !ev.data) return;
      if (ev.data.type === "gd-relay-ready" && !sent) {
        sent = true;
        win.postMessage({ type: "gd-capture", token: token, payload: body() }, ORIGIN);
      }
      if (ev.data.type === "gd-relay-result") {
        say(ev.data.ok
          ? "Stored " + ev.data.result.added + " new via the relay tab."
          : "Relay refused: " + (ev.data.error || "unknown"));
      }
    });
    /* Backstop for a tab that loaded before the listener attached. */
    setTimeout(function(){
      if (!sent) { sent = true; try { win.postMessage({ type: "gd-capture", token: token, payload: body() }, ORIGIN); } catch (e) {} }
    }, 2500);
  }
})();
`

/**
 * The collector's source, with the extractor inlined and stamped.
 *
 * The stamp is a hash of the FINISHED program, so a change to either
 * half moves it. That is the whole of lesson 2: a version number
 * somebody has to remember to bump stops moving on the day it
 * matters, and a stale bookmarklet does not throw, it under-reports.
 */
export function collectorSource(origin) {
  /* FUNCTION REPLACERS, NOT STRINGS, AND THIS IS NOT STYLE.
     String.prototype.replace gives `$&`, `$'` and `` $` `` special
     meaning IN THE REPLACEMENT. The robots.txt parser in _scan.js
     contains the literal `'\\$&'` (escaping a regex special), so
     passing the source as a replacement string silently rewrote it
     into the matched text and emitted a program that would not
     parse. A function replacer is taken verbatim.

     It failed loudly here because the test parses the output. Had
     the corrupted fragment happened to stay syntactically valid it
     would have shipped a subtly wrong crawler to a stranger's
     website instead, which is the whole reason that test exists. */
  const withExtractor = OPERATOR_SOURCE
    .replace('%%CAPTURE%%', function () { return captureSource.toString() })
    .replace('%%SCAN%%', function () { return scanSource.toString() })
    .replace('%%INGEST%%', function () { return INGEST_PATH })
    .split('%%INSTALL%%').join(INSTALL_PATH)
    .replace('%%ORIGIN%%', function () { return origin })

  const build = createHash('sha256').update(withExtractor).digest('hex').slice(0, 8)
  return { source: withExtractor.split('%%BUILD%%').join(build), build }
}

export default function handler(req, res) {
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0]
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost'
  const { source, build } = collectorSource(proto + '://' + host)

  res.setHeader('Content-Type', 'application/javascript; charset=utf-8')
  res.setHeader('X-Collector-Build', build)
  /* Never cached. A cached collector is a stale collector, which is
     lesson 2 arriving by a different door. */
  res.setHeader('Cache-Control', 'no-store')
  /* It has to be loadable from a merchant's page. It carries no
     credential: the passcode is typed into the panel at capture time
     and used for one request. */
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.status(200).send(source)
}
