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

  var ROOMS = {
    arcade: 'The Arcade Floor', play: 'Play', tabletop: 'The Table',
    battlestation: 'Battlestation', workshop: 'The Workshop', audio: 'Audio',
    power: 'Power', vault: 'The Vault', wardrobe: 'The Wardrobe'
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
    return '<' + tag + ' class="g-card"' + href +
      ' style="--rar:var(--' + rar + ')" data-rarity="' + rar + '">' +
      '<span class="g-shot">' + img +
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

  /* ----------------------------------------------------------- facets
     Counted against the pool with the OTHER facet applied but not this
     one. See the header: this is the whole reason a facet count is
     ever right. */
  function pool(items, state, ignore) {
    return items.filter(function (it) {
      if (ignore !== 'room' && state.room && it.room !== state.room) return false;
      if (ignore !== 'shop' && state.shop && it.k !== state.shop) return false;
      return true;
    });
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

  /* ------------------------------------------------------------ mount */
  function mount(root, items, opts) {
    opts = opts || {};
    var state = { room: opts.room || '', shop: '', sort: 'shuffle' };
    items = items || [];

    root.innerHTML =
      '<div class="g-bar">' +
        '<div class="g-facets" id="gFacets"></div>' +
        '<label class="g-sort">Sort' +
          '<select id="gSort">' +
            '<option value="shuffle">a wander</option>' +
            '<option value="price-asc">price, low first</option>' +
            '<option value="price-desc">price, high first</option>' +
            '<option value="title">name</option>' +
          '</select>' +
        '</label>' +
      '</div>' +
      '<p class="g-count" id="gCount"></p>' +
      '<div class="g-grid" id="gGrid"></div>';

    var elFacets = root.querySelector('#gFacets');
    var elGrid = root.querySelector('#gGrid');
    var elCount = root.querySelector('#gCount');

    root.querySelector('#gSort').onchange = function (e) {
      state.sort = e.target.value; draw();
    };

    elFacets.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('[data-facet]') : null;
      if (!b) return;
      var f = b.getAttribute('data-facet'), v = b.getAttribute('data-value');
      state[f] = (state[f] === v) ? '' : v;
      draw();
    });

    function chipRow(field, label, nameOf) {
      var c = counts(pool(items, state, field), field);
      var keys = Object.keys(c).sort(function (a, b) { return c[b] - c[a] });
      if (keys.length < 2) return '';   /* one option is not a choice */
      return '<div class="g-row"><span class="g-rowlab">' + label + '</span>' +
        keys.map(function (k) {
          return '<button type="button" class="g-chip' + (state[field] === k ? ' on' : '') +
            '" data-facet="' + field + '" data-value="' + esc(k) + '">' +
            esc(nameOf(k)) + '<span class="g-n">' + c[k] + '</span></button>';
        }).join('') + '</div>';
    }

    function draw() {
      var shown = pool(items, state, null);
      var cmp = SORTS[state.sort];
      shown = cmp ? shown.slice().sort(cmp) : spread(shown, 7);

      elFacets.innerHTML =
        chipRow('room', 'Room', function (k) { return ROOMS[k] || k }) +
        chipRow('shop', 'Shop', function (k) { return shopName(k) });

      elCount.textContent = shown.length
        ? shown.length + (shown.length === 1 ? ' thing' : ' things') +
          (state.room || state.shop ? ' · ' : '') +
          (state.room ? (ROOMS[state.room] || state.room) : '') +
          (state.room && state.shop ? ' · ' : '') +
          (state.shop ? shopName(state.shop) : '')
        : '';

      /* Cap what is put in the DOM at once. 1,200 cards is a second of
         layout on a phone and nobody scrolls past two hundred. */
      var CAP = 240;
      elGrid.innerHTML = shown.slice(0, CAP).map(function (it) {
        return card(it, opts);
      }).join('') || '<p class="g-empty">Nothing on these shelves answers to all of that.</p>';

      if (shown.length > CAP) {
        elGrid.insertAdjacentHTML('beforeend',
          '<p class="g-more">Showing ' + CAP + ' of ' + shown.length +
          '. Narrow it down with the filters above.</p>');
      }
    }

    var shopNames = opts.shopNames || {};
    function shopName(k) { return shopNames[k] || k }

    draw();
    return { draw: draw, state: state };
  }

  global.GDGrid = { mount: mount, card: card, money: money, esc: esc, ROOMS: ROOMS, rarityOf: rarityOf, RARITY: RARITY };
})(window);
