/* ============================================================
   app.js — the dungeon's engine.
   ------------------------------------------------------------
   Plain JS, no build step, no bundler, same as all three sister
   sites. Nicotia's guide is emphatic about why and it is worth
   restating: Legal-Leaf's index.html carries a ~250KB base64 blob
   that decodes at runtime into its render engine, its own guide
   calls that "the single most fragile thing in the repo", and one
   stray character renders the page blank. We do not do that. This
   is a file you can read, diff and review in a pull request.

   ------------------------------------------------------------
   THE EMPTY STATE IS THE MOST IMPORTANT SCREEN THIS SITE HAS
   ------------------------------------------------------------
   Today every room is empty, and that is correct rather than
   broken: 54 merchants are registered, none has a reviewed capture
   on file, and the publish gate refuses to serve a merchant nobody
   has read. So the empty state does not say "no products found",
   which reads as a bug and sends somebody looking in the wrong
   place. It says what is actually true, names the number, and
   points at the thing that would change it.

   That distinction is the whole lesson from Kawaii Katz's
   `?debug`: a failed fetch and an empty catalogue look identical
   from the outside unless something takes the trouble to tell them
   apart. Four states are distinguished here and each has different
   words: API unreachable, API fine but nothing published, room has
   nothing in it, and room has products.
   ============================================================ */
(function () {
  'use strict';

  var ROOMS = [
    { key:'arcade',        path:'/arcade-floor',  name:'The Arcade Floor', blurb:'Cabinets, sticks, and everything that used to eat quarters.' },
    { key:'play',          path:'/play',          name:'Play',             blurb:'Games, keys and the things you actually play.' },
    { key:'tabletop',      path:'/tabletop',      name:'The Table',        blurb:'Dice, decks, minis and the four hours you lost to them.' },
    { key:'battlestation', path:'/battlestation', name:'Battlestation',    blurb:'The desk. Boards, mice, screens, chairs.' },
    { key:'workshop',      path:'/workshop',      name:'The Workshop',     blurb:'Parts, printers and the rig you keep almost finishing.' },
    { key:'audio',         path:'/audio',         name:'Audio',            blurb:'Amps, cans and speakers worth the shelf.' },
    { key:'power',         path:'/power',         name:'Power',            blurb:'Chargers, cables, and the brick you keep losing.' },
    { key:'vault',         path:'/vault',         name:'The Vault',        blurb:'Figures, manga, plush and things kept in the box.' },
    { key:'wardrobe',      path:'/wardrobe',      name:'The Wardrobe',     blurb:'What you wear to the thing.' }
  ];

  var $ = function (s) { return document.querySelector(s); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  };

  var state = { items: [], stores: [], reached: false };

  /* ---------------------------------------------------------- routing
     The path decides the room. One document, one source of truth for
     routes (vercel.json), no hardcoded map here to drift from it. */
  function currentRoom() {
    var p = location.pathname.replace(/\/$/, '');
    for (var i = 0; i < ROOMS.length; i++) if (ROOMS[i].path === p) return ROOMS[i];
    return null;
  }

  function countIn(key) {
    var n = 0;
    for (var i = 0; i < state.items.length; i++) if (state.items[i].room === key) n++;
    return n;
  }

  /* ------------------------------------------------------------- map */
  function renderMap() {
    var published = state.stores.length;
    var html = ROOMS.map(function (r) {
      var n = countIn(r.key);
      var label = !state.reached ? 'shut'
                : published === 0 ? 'not stocked yet'
                : n === 0 ? 'nothing in here yet'
                : n + (n === 1 ? ' thing' : ' things');
      return '<a class="door" href="' + r.path + '">' +
        '<h3>' + esc(r.name) + '</h3>' +
        '<p>' + esc(r.blurb) + '</p>' +
        '<span class="count' + (n ? '' : ' shut') + '">' + esc(label) + '</span>' +
      '</a>';
    }).join('');

    /* The arcade is a door on the map like any other room, because
       it is one. It is also the only door that works today, which is
       worth something: a dungeon with one open room is still a place
       you can visit. */
    html += '<a class="door cabinet" href="/arcade">' +
      '<h3>The Arcade</h3>' +
      '<p>Cabinets in the corner. Free play, nothing for sale, no sign-up.</p>' +
      '<span class="count">open</span>' +
    '</a>';

    $('#doors').innerHTML = html;
  }

  /* ------------------------------------------------------------ room */
  function renderRoom(room) {
    $('#map').hidden = true;
    $('#roomView').hidden = false;
    $('#roomName').textContent = room.name;
    $('#roomBlurb').textContent = room.blurb;

    var mine = state.items.filter(function (it) { return it.room === room.key; });
    var grid = $('#grid'), empty = $('#roomEmpty');

    if (mine.length) {
      empty.hidden = true;
      grid.innerHTML = mine.map(card).join('');
      return;
    }

    grid.innerHTML = '';
    empty.hidden = false;
    empty.innerHTML = emptyWords(room);
  }

  /* FOUR STATES, FOUR DIFFERENT SENTENCES. See the header. */
  function emptyWords(room) {
    if (!state.reached) {
      return '<strong>The catalogue did not answer.</strong><br>' +
        'That is this site being unreachable, not the room being empty. ' +
        'If you are running locally, <code>/api/*</code> needs <code>npm run dev</code> ' +
        'rather than a plain static server.';
    }
    if (!state.stores.length) {
      return '<strong>Nothing is stocked yet, and that is on purpose.</strong><br>' +
        '54 shops are registered. None of them has been published, because ' +
        'no merchant here goes on a shelf until somebody has opened it in a ' +
        'browser and read what it actually sells. That is the reverse of how ' +
        'the sister sites were built, and it is the reverse deliberately: one ' +
        'of them has a vendor that has returned zero products since the day it ' +
        'was added.<br><br>' +
        'The room fills when a capture lands in <code>data/captured/</code>. ' +
        'Until then the <a href="/arcade">arcade</a> is open.';
    }
    return '<strong>Nothing in this room yet.</strong><br>' +
      'Shops are live on the site, but none of the ones read so far stock ' +
      'anything that belongs in ' + esc(room.name) + '. Try the ' +
      '<a href="/">map</a>.';
  }

  function card(it) {
    return '<a class="card" href="' + esc(it.url) + '" rel="nofollow sponsored noopener" target="_blank">' +
      '<span class="shot">' + (it.image ? '<img loading="lazy" alt="" src="' + esc(it.image) + '"/>' : '') + '</span>' +
      '<span class="body">' +
        '<h4>' + esc(it.name || it.title) + '</h4>' +
        '<span class="shop">' + esc(it.storeName || it.store || '') + '</span>' +
        (it.price ? '<span class="price">' + esc(money(it.price, it.currency)) + '</span>' : '') +
      '</span>' +
    '</a>';
  }

  function money(n, cur) {
    var v = Number(n);
    if (!isFinite(v)) return '';
    try { return new Intl.NumberFormat(undefined, { style:'currency', currency: cur || 'USD' }).format(v); }
    catch (e) { return '$' + v.toFixed(2); }
  }

  /* ------------------------------------------------------------ boot */
  function boot() {
    var room = currentRoom();
    if (room) renderRoom(room); else renderMap();
  }

  fetch('/api/products')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (!j) return;
      state.reached = true;
      state.items = (j.items || []).map(function (it) {
        /* `dept` is what the ported engine still calls it in places.
           Read both rather than depending on which half of the port
           produced this row; when the nicotine-shaped leftovers come
           out of products.js this can drop to `room`. */
        it.room = it.room || it.dept || '';
        return it;
      });
      state.stores = j.stores || [];
    })
    .catch(function () { /* state.reached stays false; the words differ */ })
    .then(boot);

  /* Progressive enhancement: the map renders before the fetch lands so
     the page is never blank, then re-renders with real counts. */
  boot();

  var d = $('#disclosureLink');
  if (d) d.onclick = function (e) {
    e.preventDefault();
    var box = $('#disclosure');
    box.hidden = !box.hidden;
  };
})();
