/* ============================================================
   /js/events.js — first-party analytics, in the browser.
   ------------------------------------------------------------
   PORTED FROM Kawaii Katz's lib/site-events.ts, rewritten as a
   plain script because this repo has no build step (CLAUDE.md
   section 2: do not add Next.js, Vite or any build pipeline).

   ------------------------------------------------------------
   IT WIRES ITSELF, AND THAT IS THE WHOLE POINT
   ------------------------------------------------------------
   Nothing in grid.js, app.js or hub.js was edited to add
   tracking. Every event below comes from a delegated listener on
   `document`, matching markup those files already emit:

     outbound_click   a[rel~="sponsored"]  the product card IS the
                      link to the maker's shop, so the anchor that
                      already carries the disclosure is the same
                      anchor that means "left for a shop".
     save_add/remove  [data-save]          aria-pressed says which.
     card_zoom        [data-zoom]
     search           #gQ                  debounced, see below.

   Delegation rather than per-card handlers is also what grid.js
   already does for save and zoom, and for the reason it gives:
   the grid re-renders on every keystroke, so handlers attached
   to cards would be re-attached 1,200 times a page.

   The consequence to remember: THE SELECTORS ABOVE ARE THE
   CONTRACT. Rename `data-save` in grid.js and saves stop being
   recorded, silently, with nothing failing. That trade is
   deliberate (analytics must never break the shelf) but it means
   the check after touching card markup is /admin, not the page.

   ------------------------------------------------------------
   THE PRIVACY CEILING
   ------------------------------------------------------------
   `sid` is a random value in sessionStorage. It dies with the
   tab, is never sent anywhere but this origin, and cannot follow
   a person between visits or across devices. No IP, no cookie,
   no account, no fingerprint. It exists so a funnel can tell one
   visit's steps from another's and for nothing else.
   ============================================================ */

(function () {
  'use strict';

  var ENDPOINT = '/api/events';
  var SID_KEY = 'gd_sid';
  var FLUSH_MS = 2500;
  var MAX_QUEUE = 20;

  /* Per-tab id. Random, disposable, never leaves this origin. */
  function sid() {
    try {
      var v = sessionStorage.getItem(SID_KEY);
      if (!v) {
        v = (self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2))
          .replace(/-/g, '').slice(0, 24);
        sessionStorage.setItem(SID_KEY, v);
      }
      return v;
    } catch (e) {
      /* Private mode or blocked storage. A per-call id still records
         the event; it just cannot be joined into a funnel, which is
         the right way for this to degrade. */
      return 'nostore';
    }
  }

  /* ----------------------------------------------------------
     Events are batched.

     A visitor typing in the search box fires an event per settled
     query, and a page can produce a dozen before anything is
     clicked. One request each would be dozens of round trips for
     data nobody reads in real time. They queue and flush on a
     short timer, when the queue is long enough to be worth
     sending, and on page hide.
     ---------------------------------------------------------- */
  var queue = [];
  var timer = null;

  function flush() {
    if (!queue.length) return;
    var batch = queue;
    queue = [];
    if (timer) { clearTimeout(timer); timer = null; }
    var body = JSON.stringify({ events: batch });
    try {
      /* sendBeacon survives the page being closed, which is exactly
         when outbound_click fires. A fetch() there is routinely
         cancelled mid-flight, and the most important event on the
         site would be the one most often lost. */
      if (navigator.sendBeacon &&
          navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) return;
    } catch (e) { /* fall through */ }
    try {
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      })['catch'](function () {});
    } catch (e) { /* analytics must never break the page */ }
  }

  /** Record one event. Never throws, never blocks, never awaited. */
  function track(name, props) {
    try {
      props = props || {};
      queue.push({
        name: name,
        sid: sid(),
        path: props.path || location.pathname,
        productId: props.productId,
        vendor: props.vendor,
        cat: props.cat,
        meta: props.meta
      });
      if (queue.length >= MAX_QUEUE) return flush();
      if (!timer) timer = setTimeout(flush, FLUSH_MS);
    } catch (e) { /* analytics must never break the page */ }
  }

  /* Exposed so app.js or a future page can add an event without
     needing a second file. Everything below is what wires itself. */
  window.gdTrack = track;

  /* ---------------------------------------------------------- read a card */

  /* What the shelf knows about a product, read off the card that is
     already on the page. grid.js sets no identifying attributes, and
     none were added to it: the markup it emits is enough.

       productId  the product URL WITH THE QUERY STRIPPED.
       vendor     .g-shop, which grid.js fills with shopName || k.
       cat        the room, which is this site's category.

     STRIPPING THE QUERY IS THE LOAD-BEARING PART. `it.url` arrives
     from row() already carrying `?ref=<code>` (CLAUDE.md section 5),
     and that code is commission paperwork. It is deliberately kept
     out of publicStores() for the same reason it is kept out of here:
     a second copy in a second store is a second place to leak it
     from, and the analytics table has no use for it.

     Stripping also makes the id STABLE. Change a ref code and every
     product would otherwise become a new row, silently resetting its
     history on the dashboard.

     The bare URL is not an arbitrary choice of key either: it is what
     _capture.js's identity() already uses, so a product's id here
     matches its id in the capture store.

     Read defensively throughout. If a selector stops matching, the
     event still lands without the product joined to it, and a
     dashboard row reading "(unknown)" is better than a TypeError
     thrown inside a click handler on a link the visitor is following. */
  function cardInfo(a) {
    var out = {};
    if (!a) return out;
    try {
      var href = a.getAttribute('href') || '';
      if (href) out.productId = href.split('?')[0].split('#')[0].slice(0, 200);
      var shop = a.querySelector ? a.querySelector('.g-shop') : null;
      if (shop) out.vendor = String(shop.textContent || '').trim().slice(0, 80);
      var r = room();
      if (r) out.cat = r;
    } catch (e) { /* leave the event unjoined rather than throw */ }
    return out;
  }

  /* ---------------------------------------------------------- the wiring */

  function room() {
    /* Every room rewrites to "/" (vercel.json), so the room is in
       the visible URL rather than in the served path. Read the first
       path segment, and call the map itself "(map)". */
    var seg = String(location.pathname || '/').split('/').filter(Boolean)[0];
    return seg || '';
  }

  var lastRoom = null;
  function pageOrRoom() {
    var r = room();
    if (r && r !== lastRoom) {
      lastRoom = r;
      track(r === 'shop' ? 'shop_view' : 'room_view', { meta: r === 'shop' ? shopKey() : r });
    } else if (!r && lastRoom !== '') {
      lastRoom = '';
      track('room_view', { meta: '(map)' });
    }
  }

  function shopKey() {
    var parts = String(location.pathname || '').split('/').filter(Boolean);
    return parts[1] || 'shop';
  }

  function boot() {
    track('page_view');
    pageOrRoom();
    if (/^\/arcade/.test(location.pathname)) track('arcade_open');

    /* The rooms are client-side navigation, so a room change is not
       a page load and popstate is the only signal there is. */
    window.addEventListener('popstate', pageOrRoom);
    window.addEventListener('hashchange', pageOrRoom);

    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;

      /* Order matters: save and zoom are buttons INSIDE the anchor
         (see the note in grid.js card()), so they must be tested
         before the anchor or every save also counts as an outbound
         click. */
      var save = t.closest('[data-save]');
      if (save) {
        /* aria-pressed still holds the value from before the click,
           so "true" here means the visitor is removing it. */
        var on = save.getAttribute('aria-pressed') === 'true';
        track(on ? 'save_remove' : 'save_add', cardInfo(t.closest('a[rel~="sponsored"]')));
        return;
      }
      if (t.closest('[data-zoom]')) {
        track('card_zoom', cardInfo(t.closest('a[rel~="sponsored"]')));
        return;
      }

      var a = t.closest('a[rel~="sponsored"]');
      if (a && a.getAttribute('href')) {
        /* THE MONEY EVENT. Everything else on this page is context
           for this one line. */
        track('outbound_click', cardInfo(a));
        flush();
        return;
      }

      if (t.closest('[data-arcade-play], .arcade-play')) track('arcade_play');
    }, true);

    /* Search, debounced. grid.js re-filters on every keystroke, and
       an event per keystroke would record "n", "ni", "nin", "nint"
       and bury the term somebody actually meant. Wait for the typing
       to settle, then record the settled query once. */
    var q = document.querySelector('#gQ');
    if (q) {
      var t0 = null;
      q.addEventListener('input', function () {
        if (t0) clearTimeout(t0);
        t0 = setTimeout(function () {
          var term = String(q.value || '').trim().slice(0, 80);
          if (term.length < 2) return;
          track('search', { meta: term });
          /* A zero-result search is the most actionable row on the
             dashboard: somebody expected to find a thing here and
             did not. Read the count off the grid the same way a
             visitor does rather than reaching into grid.js state. */
          var shown = document.querySelectorAll('.g-card, .grid-card, [data-card]').length;
          if (!shown) track('search_zero', { meta: term });
        }, 700);
      });
    }

    /* Flush on tab hide. visibilitychange rather than unload, which
       does not fire reliably on mobile Safari. */
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
