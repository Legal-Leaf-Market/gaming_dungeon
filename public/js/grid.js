/* ============================================================
   grid.js — the shelf. Cards, facets, sort, and nothing else.
   ------------------------------------------------------------
   ONE RENDERER, TWO CALLERS, AND THAT IS THE POINT.

     /         the storefront, fed by /api/products (published only)
     /collect  the operator preview, fed by captures (unpublished)

   Those two show the same products at different stages of their
   life, and the whole value of the preview is that it looks exactly
   like the shelf. A second card component built "just for preview"
   would drift, and the drift would be invisible in the direction
   that matters: the preview would keep looking fine while the real
   shelf broke.

   It knows nothing about where its data came from. `GDGrid.mount()`
   takes an array of items and a root element. That is the whole API.

   ------------------------------------------------------------
   FACETS ARE SINGLE-SELECT AND BIDIRECTIONALLY COUPLED
   ------------------------------------------------------------
   Lifted from Herbal Leaf, which had to learn it: room and shop each
   constrain the other, and a facet's counts are computed against the
   pool with the OTHER facet applied but NOT ITSELF. Without that, the
   counts next to the options you are choosing between are wrong the
   moment you pick one.

   ZERO-COUNT OPTIONS ARE REMOVED, NOT GREYED. A visible choice that
   lands on an empty grid is a dead end the interface offered you.

   ------------------------------------------------------------
   THE CARD SAYS WHAT IT KNOWS AND NOTHING MORE
   ------------------------------------------------------------
   No price is printed as "—", never as "$0.00". No fake ratings, no
   invented "was" prices. A struck-through price the merchant's own
   checkout refuses to honour is the worst thing this kind of site can
   ship, and the sister sites' guides all say so in the same words.
   ============================================================ */
(function (global) {
  'use strict';

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function money(n, cur) {
    var v = Number(n);
    if (!isFinite(v) || v <= 0) return '';
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency', currency: cur || 'USD',
        minimumFractionDigits: v % 1 ? 2 : 0
      }).format(v);
    } catch (e) { return '$' + v.toFixed(2); }
  }

  /* THE FIFTH REGISTRATION A NEW ROOM NEEDS, and the one that gets
     missed. A room is added to _scene.js (its classifier and its
     ROOMS_META door), to _stores.js (ROOM_ORDER), to app.js (its pin
     on the map) and to vercel.json (its route) -- and then to this
     map, which is the only one that turns a key into words a visitor
     reads. Nothing throws when it is absent. `ROOMS[k] || k` and the
     empty-state's `|| 'this room'` both fall back politely, so The
     Walls shipped with fifteen registered makers and told every one
     of its visitors "15 makers signed for this room", which reads as
     a page that does not know where it is.

     A test now asserts this map covers every key in ROOMS_META. */
  var ROOMS = {
    arcade: 'The Arcade Floor', play: 'Play', tabletop: 'The Table',
    battlestation: 'Battlestation', workshop: 'The Workshop', audio: 'Audio',
    power: 'Power', vault: 'The Vault', wardrobe: 'The Wardrobe',
    walls: 'The Walls'
  };

  /* THE RARITY LADDER. Items.luau in the Heavenpillar repo grades
     every item common | fine | rare | precious, and a price-sorted
     shelf is a rarity ladder whether or not anybody says so out loud.
     So the shelf says so.

     The thresholds are ours, not the game's -- it grades by what a
     thing IS and we only know what it costs -- and they are set
     against this catalogue's real spread rather than guessed. They
     are duplicated from rarityOf() in api/_scene.js because this file
     ships to a browser and that one does not; the two must agree, and
     a test asserts they do. Unpriced is `common`, never blank: a card
     with no grade at all reads as a bug. */
  var RARITY = [
    { key:'precious', from:500 },
    { key:'rare',     from:100 },
    { key:'fine',     from:25 },
    { key:'common',   from:0 }
  ];

  function rarityOf(price) {
    var n = Number(price);
    if (!isFinite(n) || n <= 0) return 'common';
    for (var i = 0; i < RARITY.length; i++) if (n >= RARITY[i].from) return RARITY[i].key;
    return 'common';
  }

  /* ------------------------------------------------------------ card */
  function card(it, opts) {
    var price = money(it.price, it.cur);
    var rar = rarityOf(it.price);
    var img = it.image
      ? '<img loading="lazy" decoding="async" alt="" src="' + esc(it.image) + '"/>'
      : '<span class="g-noimg" aria-hidden="true">' + esc((it.title || '?').charAt(0)) + '</span>';

    /* rel="nofollow sponsored" on every outbound card, always. These
       are paid links whether or not this particular merchant has a
       code filled in yet, and disclosing that is not optional. */
    var tag = opts && opts.preview ? 'div' : 'a';
    var href = (!opts || !opts.preview) && it.url
      ? ' href="' + esc(it.url) + '" target="_blank" rel="nofollow sponsored noopener"' : '';

    /* The rarity is the card's LEFT EDGE, set as a custom property so
       a new grade needs no new class. It is the one place a grade can
       be read at a glance down a column without becoming decoration,
       and the word underneath is not coloured for the same reason:
       saying it twice in colour turns a shelf into a paint chart. */
    /* THE SAVE AND THE EXPAND, and both are buttons inside a link.

       The card is an <a> to the maker's shop, so anything else on it
       has to stop its own click reaching the anchor or a save opens
       the shop as well. That is handled once in the delegated
       listener rather than with an onclick per card, because the
       grid re-renders on every keystroke and inline handlers on
       1,200 cards is markup nobody needs to ship.

       Neither appears in preview: /collect is an operator reading a
       capture, and a satchel there would save products that are not
       published yet. */
    var tools = '';
    if (!opts || !opts.preview) {
      var on = isSaved(it);
      tools =
        '<button type="button" class="g-save' + (on ? ' on' : '') + '"' +
        ' data-save="1" aria-pressed="' + (on ? 'true' : 'false') + '"' +
        ' title="' + (on ? 'In your satchel' : 'Keep this') + '"' +
        ' aria-label="' + (on ? 'Remove from satchel' : 'Keep this') + '">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>' +
        '</button>';
      if (it.image) {
        tools += '<button type="button" class="g-zoom" data-zoom="1"' +
          ' title="See it bigger" aria-label="See the photo full screen">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"' +
          ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/></svg></button>';
      }
    }

    return '<' + tag + ' class="g-card"' + href +
      ' style="--rar:var(--' + rar + ')" data-rarity="' + rar + '">' +
      '<span class="g-shot">' + img + tools +
        (it.oos ? '<span class="g-oos">out of stock</span>' : '') +
      '</span>' +
      '<span class="g-body">' +
        '<span class="g-title">' + esc(it.title) + '</span>' +
        '<span class="g-foot">' +
          '<span class="g-shop">' + esc(it.shopName || it.k || '') + '</span>' +
          (price ? '<span class="g-price">' + esc(price) + '</span>' : '') +
        '</span>' +
        '<span class="g-rar">' + rar + '</span>' +
      '</span>' +
    '</' + tag + '>';
  }

  /* --------------------------------------------------------- searching
     TOKENISED AND, not a substring test. "hot swap" has to find
     "Keyboard, Hot-Swap 75%", which a plain indexOf on the raw query
     never does because of the hyphen. Every word must appear
     somewhere in the haystack; the order does not matter.

     The haystack is title, shop and brand. Deliberately not the room:
     the room is a facet, and folding it in here would make typing
     "play" return a thousand things instead of narrowing anything.

     Cached on the item as _h, because this runs over the whole
     catalogue on every keystroke and building the same lowercase
     string 1,200 times per character is the difference between
     instant and laggy on a phone. */
  function hay(it) {
    if (it._h === undefined) {
      it._h = ((it.title || '') + ' ' + (it.shopName || it.k || '') + ' ' +
        (it.brand || '')).toLowerCase();
    }
    return it._h;
  }

  function terms(q) {
    return String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  }

  function hits(it, ts) {
    var h = hay(it);
    for (var i = 0; i < ts.length; i++) if (h.indexOf(ts[i]) === -1) return false;
    return true;
  }

  /* ----------------------------------------------------------- facets
     Counted against the pool with the OTHER facet applied but not this
     one. See the header: this is the whole reason a facet count is
     ever right.

     SEARCH AND THE SATCHEL ARE NEVER IGNORED, and that is the point
     of them living in here rather than in draw(). They are not
     facets, they are the pool: if a shop chip counted against the
     unsearched catalogue it would promise 214 things and hand over
     three. Herbal Leaf learned this one the same way -- every count
     next to a filter has to be counted against what the visitor can
     actually already see. */
  /* A FACET'S NAME IS NOT THE PROPERTY IT READS, and assuming it was
     is a bug this shelf shipped with.

     The filter tested `it.k` for the shop while the counter counted
     `it.shop`, which no product row has ever carried: rows come out
     of api/products.js with `k` for the store key. So `counts()`
     returned {} for the shop, chipRow saw fewer than two options and
     returned '' by its own "one option is not a choice" rule, and the
     entire SHOP FILTER SILENTLY DID NOT EXIST. Nothing errored, the
     row was simply never there, and the filter that never appeared
     was the one that matters most on a shelf drawn from fifty shops.

     One map, read by the filter and by the counter, so the two can
     never disagree again. */
  var FIELD = { room: 'room', shop: 'k' };

  function pool(items, state, ignore) {
    var ts = terms(state.q);
    return items.filter(function (it) {
      if (ignore !== 'room' && state.room && it.room !== state.room) return false;
      if (ignore !== 'shop' && state.shop && it.k !== state.shop) return false;
      if (state.saved && !isSaved(it)) return false;
      if (ts.length && !hits(it, ts)) return false;
      return true;
    });
  }

  /* ---------------------------------------------------------- the satchel
     A saved set, in localStorage, on this device only. Every sister
     site grew one (Herbal's Garden, Nicotia's list) because a
     catalogue this size is unusable without somewhere to put the
     three things you are actually deciding between.

     IDENTITY IS THE SHOP KEY PLUS THE URL, not a hash of them. A
     32-bit hash over a few hundred saves is a small collision risk
     and the failure it produces is the worst kind: a card the visitor
     never saved showing up saved, or worse, their save landing on
     somebody else's product. Rows carry no id of their own, and the
     url is already unique per product, so the honest key is the pair.

     Capped, and the cap drops the OLDEST. An uncapped list in
     localStorage eventually throws QuotaExceeded on the write, which
     in a naive implementation loses the whole set rather than the one
     item that overflowed. */
  var SAVE_KEY = 'verda_satchel';
  var SAVE_CAP = 300;
  var SAVED = null;

  function loadSaved() {
    if (SAVED) return SAVED;
    SAVED = [];
    try {
      var raw = localStorage.getItem(SAVE_KEY);
      if (raw) SAVED = JSON.parse(raw) || [];
    } catch (e) { SAVED = []; }
    if (!Array.isArray(SAVED)) SAVED = [];
    return SAVED;
  }

  function saveKeyOf(it) { return (it.k || '') + '|' + (it.url || it.title || ''); }
  function isSaved(it) { return loadSaved().indexOf(saveKeyOf(it)) !== -1; }

  function toggleSaved(it) {
    var list = loadSaved(), key = saveKeyOf(it), i = list.indexOf(key);
    if (i === -1) { list.push(key); if (list.length > SAVE_CAP) list.shift(); }
    else list.splice(i, 1);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(list)); } catch (e) {}
    /* Anything showing a count (the header) hears about it here
       rather than being poked by every caller. */
    try {
      global.dispatchEvent(new CustomEvent('verda:satchel', { detail: list.length }));
    } catch (e) {}
    return i === -1;
  }

  function counts(items, field) {
    var m = {};
    for (var i = 0; i < items.length; i++) {
      var v = items[i][field];
      if (!v) continue;
      m[v] = (m[v] || 0) + 1;
    }
    return m;
  }

  var SORTS = {
    /* Default is a stable shuffle rather than price or alphabet.
       This is a browse-first shop: sorting by price puts the cheapest
       merchant's whole catalogue at the top and makes the shelf read
       as one shop, and alphabetical does the same thing by accident.
       Seeded so a reload is not a different room. */
    shuffle: null,
    'price-asc': function (a, b) { return num(a.price) - num(b.price) },
    'price-desc': function (a, b) { return num(b.price) - num(a.price) },
    'title': function (a, b) { return String(a.title).localeCompare(String(b.title)) }
  };

  function num(v) { var n = Number(v); return isFinite(n) && n > 0 ? n : Infinity }

  /* A deterministic shuffle that also SPREADS THE SHOPS. A plain
     random order still clumps, and a clump of twelve cards from one
     merchant reads as a sorted list to anybody scrolling. Round-robin
     across shops, shuffled within each. */
  function spread(items, seed) {
    var byShop = {}, order = [];
    for (var i = 0; i < items.length; i++) {
      var k = items[i].k || '?';
      if (!byShop[k]) { byShop[k] = []; order.push(k) }
      byShop[k].push(items[i]);
    }
    var s = seed || 1;
    function rnd() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
    for (var o = 0; o < order.length; o++) {
      var arr = byShop[order[o]];
      for (var j = arr.length - 1; j > 0; j--) {
        var r = Math.floor(rnd() * (j + 1));
        var t = arr[j]; arr[j] = arr[r]; arr[r] = t;
      }
    }
    var out = [], drained = 0;
    while (drained < items.length) {
      for (var q = 0; q < order.length; q++) {
        var list = byShop[order[q]];
        if (list.length) { out.push(list.shift()); drained++ }
      }
    }
    return out;
  }

  /* The options for one facet, counted against the pool with the
     OTHER facet applied but not this one, biggest first. Pulled out
     of mount() so it can be exercised without a DOM: the shop filter
     was broken for the entire life of this shelf and nothing caught
     it, because everything about facets lived inside a function that
     needed a browser to run. */
  function facetOptions(items, state, field) {
    var prop = FIELD[field] || field;
    var c = counts(pool(items, state || {}, field), prop);
    return Object.keys(c)
      .sort(function (a, b) { return c[b] - c[a] || a.localeCompare(b) })
      .map(function (k) { return { value: k, count: c[k] }; });
  }

  /* ------------------------------------------------------------ mount */
  function mount(root, items, opts) {
    opts = opts || {};
    var preview = !!opts.preview;
    var state = { room: opts.room || '', shop: '', sort: 'shuffle', q: '', saved: false };
    items = items || [];

    /* ---------------------------------------------------------- the URL
       A FILTERED SHELF IS A PLACE, so it gets an address. Before
       this, a visitor who searched, narrowed to one shop and sent
       the link sent the front page; and the browser's Back button
       walked out of the site instead of undoing the filter, which is
       the single most common thing anybody does with it.

       replaceState, never pushState. Search runs on every keystroke
       and pushing there buries the previous page under forty
       entries, so Back stops working in a different and worse way.
       The room stays in the PATH (vercel.json rewrites those), so
       only the shelf's own state is in the query.

       Off in preview: /collect has its own URL meaning and the
       operator's filters are not a place worth linking to. */
    function readURL() {
      if (preview) return;
      try {
        var p = new URLSearchParams(location.search);
        state.q = p.get('q') || '';
        state.shop = p.get('shop') || '';
        state.saved = p.get('saved') === '1';
        if (SORTS.hasOwnProperty(p.get('sort'))) state.sort = p.get('sort');
      } catch (e) {}
    }
    function writeURL() {
      if (preview || !global.history || !history.replaceState) return;
      try {
        var p = new URLSearchParams();
        if (state.q) p.set('q', state.q);
        if (state.shop) p.set('shop', state.shop);
        if (state.saved) p.set('saved', '1');
        if (state.sort !== 'shuffle') p.set('sort', state.sort);
        var qs = p.toString();
        history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
      } catch (e) {}
    }
    readURL();

    root.innerHTML =
      '<div class="g-bar">' +
        '<div class="g-find">' +
          '<svg class="g-findico" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
          ' stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
          '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/></svg>' +
          '<input id="gQ" type="search" autocomplete="off" spellcheck="false"' +
          ' placeholder="Search the shelves" aria-label="Search the shelves"' +
          ' value="' + esc(state.q) + '"/>' +
          '<button type="button" id="gQX" class="g-findx" aria-label="Clear the search"' +
          (state.q ? '' : ' hidden') + '>&times;</button>' +
        '</div>' +
        (preview ? '' :
          '<button type="button" id="gSaved" class="g-chip g-satchel' +
          (state.saved ? ' on' : '') + '" aria-pressed="' + (state.saved ? 'true' : 'false') + '">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>' +
          'Satchel<span class="g-n" id="gSavedN"></span></button>') +
        '<label class="g-sort">Sort' +
          '<select id="gSort">' +
            '<option value="shuffle">a wander</option>' +
            '<option value="price-asc">price, low first</option>' +
            '<option value="price-desc">price, high first</option>' +
            '<option value="title">name</option>' +
          '</select>' +
        '</label>' +
      '</div>' +
      '<div class="g-facets" id="gFacets"></div>' +
      '<p class="g-count" id="gCount"></p>' +
      '<div class="g-grid" id="gGrid"></div>';

    var elFacets = root.querySelector('#gFacets');
    var elGrid = root.querySelector('#gGrid');
    var elCount = root.querySelector('#gCount');
    var elQ = root.querySelector('#gQ');
    var elQX = root.querySelector('#gQX');
    var elSort = root.querySelector('#gSort');
    var elSaved = root.querySelector('#gSaved');

    elSort.value = state.sort;

    /* ------------------------------------------------------- searching
       DEBOUNCED, and 120ms is chosen rather than inherited. The work
       per keystroke is a filter plus a sort plus building up to 240
       cards of markup over the whole catalogue; under about 100ms a
       fast typist queues renders they will never see, and over about
       200ms the shelf visibly lags the caret. */
    var qt = null;
    elQ.addEventListener('input', function () {
      elQX.hidden = !elQ.value;
      clearTimeout(qt);
      qt = setTimeout(function () {
        state.q = elQ.value.trim();
        shown_ = 0;                  /* a new search starts at the top */
        draw();
      }, 120);
    });
    /* Enter must not submit anything: there is no form and no server
       round trip, the shelf is already showing the answer. It flushes
       the debounce so a fast typist who hits Enter is not waiting. */
    elQ.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qt); state.q = elQ.value.trim(); shown_ = 0; draw(); }
      if (e.key === 'Escape' && elQ.value) { e.stopPropagation(); clearQ(); }
    });
    elQX.addEventListener('click', clearQ);
    function clearQ() {
      elQ.value = ''; elQX.hidden = true; state.q = ''; shown_ = 0; draw(); elQ.focus();
    }

    /* "/" focuses the search from anywhere on the page, the shortcut
       every catalogue on the web has trained people to expect. Guarded
       so it does not steal the key from someone typing in a field. */
    function slashKey(e) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      var t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      e.preventDefault(); elQ.focus(); elQ.select();
    }
    document.addEventListener('keydown', slashKey);

    elSort.onchange = function (e) { state.sort = e.target.value; shown_ = 0; draw(); };

    if (elSaved) {
      elSaved.addEventListener('click', function () {
        state.saved = !state.saved; shown_ = 0; draw();
      });
    }

    elFacets.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-facet]') : null;
      if (!b) return;
      var f = b.getAttribute('data-facet'), v = b.getAttribute('data-value');
      state[f] = (state[f] === v) ? '' : v;
      shown_ = 0;
      draw();
    });

    /* --------------------------------------------------- card controls
       ONE DELEGATED LISTENER for every card's buttons, and it is on
       capture so it beats the anchor. The card is a link to the
       maker's shop; without preventDefault a save would also open
       the shop in a new tab, which is the sort of thing that reads
       as the site being broken rather than as a missed click. */
    elGrid.addEventListener('click', function (ev) {
      var t = ev.target.closest ? ev.target : null;
      if (!t) return;
      var save = t.closest('[data-save]'), zoom = t.closest('[data-zoom]');
      if (!save && !zoom) return;
      ev.preventDefault();
      ev.stopPropagation();
      var cardEl = (save || zoom).closest('.g-card');
      var idx = Number(cardEl && cardEl.getAttribute('data-i'));
      var it = last_[idx];
      if (!it) return;
      if (save) {
        var now = toggleSaved(it);
        save.classList.toggle('on', now);
        save.setAttribute('aria-pressed', now ? 'true' : 'false');
        save.setAttribute('aria-label', now ? 'Remove from satchel' : 'Keep this');
        if (global.VerdaToast) global.VerdaToast(now ? 'Kept in your satchel' : 'Taken back out');
        paintSavedCount();
        /* Only redraw when the satchel is the view being shown, or
           the card the visitor just un-kept would vanish underneath
           the pointer everywhere else. */
        if (state.saved) draw();
        return;
      }
      if (global.VerdaPhoto) global.VerdaPhoto(it.image, it.title);
    }, true);

    function chipRow(field, label, nameOf) {
      var opts = facetOptions(items, state, field);
      if (opts.length < 2) return '';   /* one option is not a choice */
      return '<div class="g-row"><span class="g-rowlab">' + label + '</span>' +
        opts.map(function (o) {
          return '<button type="button" class="g-chip' + (state[field] === o.value ? ' on' : '') +
            '" data-facet="' + field + '" data-value="' + esc(o.value) + '">' +
            esc(nameOf(o.value)) + '<span class="g-n">' + o.count + '</span></button>';
        }).join('') + '</div>';
    }

    function paintSavedCount() {
      var n = root.querySelector('#gSavedN');
      if (!n) return;
      var c = loadSaved().length;
      n.textContent = c ? String(c) : '';
    }

    /* PAGE SIZE, NOT A CAP. The old number was a hard 240 with a note
       telling the visitor to use the filters, which is the interface
       asking the person to do its job. Same 240 first paint, and now
       a button that adds another 240. */
    var PAGE = 240;
    var shown_ = 0;
    var last_ = [];

    function draw() {
      var list = pool(items, state, null);
      var cmp = SORTS[state.sort];
      list = cmp ? list.slice().sort(cmp) : spread(list, 7);
      last_ = list;
      if (!shown_) shown_ = PAGE;

      elFacets.innerHTML =
        chipRow('room', 'Room', function (k) { return ROOMS[k] || k }) +
        chipRow('shop', 'Shop', function (k) { return shopName(k) });

      var bits = [];
      if (state.q) bits.push('\u201c' + state.q + '\u201d');
      if (state.saved) bits.push('your satchel');
      if (state.room) bits.push(ROOMS[state.room] || state.room);
      if (state.shop) bits.push(shopName(state.shop));
      elCount.textContent = list.length
        ? list.length + (list.length === 1 ? ' thing' : ' things') +
          (bits.length ? ' \u00b7 ' + bits.join(' \u00b7 ') : '')
        : '';

      var page = list.slice(0, shown_);
      elGrid.innerHTML = page.map(function (it, i) {
        /* The index is on the card so the delegated listener can find
           the item again without re-deriving identity from the DOM. */
        return card(it, opts).replace('<span class="g-shot">',
          '<span class="g-shot" data-shot="' + i + '">')
          .replace('class="g-card"', 'class="g-card" data-i="' + i + '"');
      }).join('') || emptyShelf();

      if (list.length > shown_) {
        elGrid.insertAdjacentHTML('beforeend',
          '<div class="g-more"><button type="button" id="gMore">' +
          'Show ' + Math.min(PAGE, list.length - shown_) + ' more</button>' +
          '<span>' + shown_ + ' of ' + list.length + '</span></div>');
        var more = root.querySelector('#gMore');
        if (more) more.onclick = function () { shown_ += PAGE; draw(); };
      }

      paintSavedCount();
      writeURL();
    }

    /* THE EMPTY SHELF SAYS WHY, and offers the way out. "Nothing
       answers to all of that" was true and useless: it did not say
       which of the four things was too narrow, and it left the
       visitor to find the filters again themselves. */
    function emptyShelf() {
      if (state.saved && !loadSaved().length) {
        return '<p class="g-empty"><strong>Your satchel is empty.</strong><br>' +
          'Press the ribbon on anything worth coming back to and it waits here. ' +
          'It stays on this device and we never see it.</p>';
      }
      var out = '<p class="g-empty"><strong>Nothing here answers to all of that.</strong><br>';
      if (state.q) out += 'No match for \u201c' + esc(state.q) + '\u201d';
      if (state.q && (state.room || state.shop || state.saved)) out += ' with the rest of it applied';
      out += '.<br><button type="button" class="g-reset" id="gReset">Clear it and start again</button></p>';
      return out;
    }
    elGrid.addEventListener('click', function (ev) {
      if (!ev.target.closest || !ev.target.closest('#gReset')) return;
      state.q = ''; state.shop = ''; state.saved = false; shown_ = 0;
      elQ.value = ''; elQX.hidden = true;
      if (elSaved) { elSaved.classList.remove('on'); elSaved.setAttribute('aria-pressed', 'false'); }
      draw();
    });

    var shopNames = opts.shopNames || {};
    function shopName(k) { return shopNames[k] || k }

    draw();
    return {
      draw: draw,
      state: state,
      /* Handed back so a caller can tear the keyboard shortcut down
         if it ever unmounts a grid. Nothing does today; leaving a
         document listener behind on a remount is how a page ends up
         with six of them. */
      destroy: function () { document.removeEventListener('keydown', slashKey); }
    };
  }

  global.GDGrid = {
    mount: mount, card: card, money: money, esc: esc,
    ROOMS: ROOMS, rarityOf: rarityOf, RARITY: RARITY,
    facetOptions: facetOptions, pool: pool,
    /* The header shows a satchel count and is not part of a grid, so
       it needs to be able to ask. */
    savedCount: function () { return loadSaved().length; },
    isSaved: isSaved, toggleSaved: toggleSaved
  };
})(window);
