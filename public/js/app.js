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

  /* ROOMS ARE REALMS. Band colour and epithet come from the twelve
     major realms in `src/shared/Realms.luau` of the Heavenpillar
     repo, verbatim. The mapping and the reasoning for it live in
     ROOMS_META in api/_scene.js -- this is the client's copy of the
     same nine rows, and the two must agree.

     Realms 10 to 12 are deliberately unspent: they are the top of
     the game's ladder and no room here earns them yet. */
  var ROOMS = [
    { key:'arcade',        path:'/arcade-floor',  name:'The Arcade Floor', realm:5, band:'#e8be50',
      epithet:'A sun the size of a seed.',
      blurb:'Cabinets, sticks, and everything that used to eat quarters.' },
    { key:'play',          path:'/play',          name:'Play',             realm:2, band:'#78aadc',
      epithet:'Breath by breath, the sea fills.',
      blurb:'Games, keys and the things you actually play.' },
    { key:'tabletop',      path:'/tabletop',      name:'The Table',        realm:3, band:'#60b496',
      epithet:'What is built on stone endures.',
      blurb:'Dice, decks, minis and the four hours you lost to them.' },
    { key:'battlestation', path:'/battlestation', name:'Battlestation',    realm:4, band:'#5896eb',
      epithet:'A whirlpool learns to hold its center.',
      blurb:'The desk. Boards, mice, screens, chairs.' },
    { key:'workshop',      path:'/workshop',      name:'The Workshop',     realm:1, band:'#9b948a',
      epithet:'Flesh is the first furnace.',
      blurb:'Parts, printers and the rig you keep almost finishing.' },
    { key:'audio',         path:'/audio',         name:'Audio',            realm:9, band:'#8cdcdc',
      epithet:'The way walks with you now.',
      blurb:'Amps, cans and speakers worth the shelf.' },
    { key:'power',         path:'/power',         name:'Power',            realm:8, band:'#6e6ea0',
      epithet:'Emptiness, polished until it shines.',
      blurb:'Chargers, cables, and the brick you keep losing.' },
    { key:'vault',         path:'/vault',         name:'The Vault',        realm:6, band:'#be82eb',
      epithet:'The self that steps outside the self.',
      blurb:'Figures, manga, plush and things kept in the box.' },
    { key:'wardrobe',      path:'/wardrobe',      name:'The Wardrobe',     realm:7, band:'#e278b4',
      epithet:'The river forgets it was rain.',
      blurb:'What you wear to the thing.' }
  ];


  var $ = function (s) { return document.querySelector(s); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  };

  var state = { items: [], stores: [], shopNames: {}, reached: false };

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
    var html = ROOMS.map(function (r, i) {
      var n = countIn(r.key);
      /* THE NARRATOR NEVER LIES ABOUT STOCK. Every label below still
         reads as its literal fact: no answer means the catalogue did
         not respond, bare means nothing is published, empty means
         this room in particular has nothing. Flavour wraps the truth
         and never replaces it, because the one thing a shop can do
         that is genuinely dishonest is make an empty shelf sound
         like a full one. */
      var label = !state.reached ? 'no answer'
                : published === 0 ? 'shelves bare'
                : n === 0 ? 'nothing here'
                : n + (n === 1 ? ' thing' : ' things');
      /* The band is set as a custom property rather than a class, so
         adding a room needs no CSS. --band is read by .door::before. */
      /* A ROOM IS A SLOT ON YOUR BAR. The game's hotbar is six dark
         rounded squares with a numeral in the corner, and the map is
         the same shape for the same reason: these are the things you
         can reach. The index is 1-based because the game's is.

         The glyph is the room's own ink drawing, from the sprite
         inlined at the top of index.html. It takes currentColor, so
         the card sets the colour and the drawing follows: one file,
         two contexts, nothing to keep in step. */
      /* --i is the entrance stagger, read by the riseIn animation in
         app.css. Set from the render index rather than by an
         :nth-child rule so the arcade door below, which is appended
         separately, keeps the same sequence. */
      return '<a class="door slot" href="' + r.path + '" style="--band:' + esc(r.band) +
        ';--i:' + i + '">' +
        '<span class="n">' + (i + 1) + '</span>' +
        '<svg class="door-ico" viewBox="0 0 64 64" aria-hidden="true">' +
          '<use href="#ico-' + esc(r.key) + '"></use>' +
        '</svg>' +
        '<h3>' + esc(r.name) + '</h3>' +
        '<p class="epithet">' + esc(r.epithet) + '</p>' +
        '<p>' + esc(r.blurb) + '</p>' +
        '<span class="count' + (n ? '' : ' shut') + '">' + esc(label) + '</span>' +
      '</a>';
    }).join('');

    /* The arcade is a door on the map like any other room, because
       it is one. It is also the only door that works today, which is
       worth something: a dungeon with one open room is still a place
       you can visit. */
    /* Immortal Ascension, the eleventh realm, is the one high band
       spent anywhere on this site -- on the room that sells nothing.
       "The last stair has no rail." */
    html += '<a class="door slot cabinet" href="/arcade" style="--band:#ffe2a0;--i:' +
      ROOMS.length + '">' +
      '<span class="n">' + (ROOMS.length + 1) + '</span>' +
      '<svg class="door-ico" viewBox="0 0 64 64" aria-hidden="true">' +
        '<use href="#ico-arcade-stick"></use>' +
      '</svg>' +
      '<h3>The Arcade</h3>' +
      '<p class="epithet">The last stair has no rail.</p>' +
      '<p>Cabinets in the corner. Free play, nothing for sale, no sign-up.</p>' +
      '<span class="count">open</span>' +
    '</a>';

    $('#doors').innerHTML = html;
  }

  /* ------------------------------------------------------------ room */
  /* ------------------------------------------------------------ room
     THE GRID IS grid.js AND THIS FILE DOES NOT DRAW CARDS. /collect's
     operator preview mounts the same renderer over captured products,
     which is the whole point: a preview has to look exactly like the
     shelf or it is not a preview of anything. A second card component
     would drift, and it would drift invisibly in the direction that
     matters -- the preview would go on looking fine while the real
     shelf broke. */
  function renderRoom(room) {
    $('#map').hidden = true;
    $('#roomView').hidden = false;
    $('#roomName').textContent = room.name;
    $('#roomBlurb').textContent = room.blurb;
    mountGrid(room.key);
  }

  function mountGrid(roomKey) {
    var mine = state.items.filter(function (it) {
      return !roomKey || it.room === roomKey;
    });
    var grid = $('#grid'), empty = $('#roomEmpty');

    if (!mine.length) {
      grid.innerHTML = '';
      empty.hidden = false;
      empty.innerHTML = emptyWords(roomKey);
      return;
    }
    empty.hidden = true;
    /* The WHOLE catalogue is handed over with the room preselected,
       rather than a pre-filtered slice. The facets have to be able to
       count what you would get by switching rooms, and they cannot do
       that from a slice that already excluded it. */
    window.GDGrid.mount(grid, state.items, {
      room: roomKey || '',
      shopNames: state.shopNames
    });
  }

  /* FOUR STATES, FOUR DIFFERENT SENTENCES. See the header.

     WRITTEN IN THE PLACE'S OWN VOICE, and still exactly true. The old
     versions leaked the workshop onto the visitor's screen: they
     named the repo directory captures land in, printed a build
     command, and justified our review policy by comparing it to
     another site we run. None of that is a visitor's business and
     all of it read as a developer talking to himself.

     The words this comment is careful NOT to spell out are checked
     for in test/products.test.mjs, against the raw file. A comment
     that quoted them would trip its own guard, which is a trap this
     repo has now sprung four separate times in one day.

     The developer hint is not gone, it is CONDITIONAL: it appears
     only on localhost, where it is the correct advice and the only
     person reading it is the one who needs it. */
  function onLocalhost() {
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '';
  }

  function emptyWords(roomKey) {
    var roomName = (window.GDGrid && window.GDGrid.ROOMS[roomKey]) || 'this room';
    if (!state.reached) {
      return '<strong>The road to the catalogue is out.</strong><br>' +
        'That is this site failing to answer, not the room standing empty. ' +
        'Give it a moment and come back.' +
        (onLocalhost()
          ? '<br><br><em>Running locally: <code>/api/*</code> needs ' +
            '<code>npm run dev</code>, not a plain static server.</em>'
          : '');
    }
    if (!state.stores.length) {
      /* NO HARD COUNT. This used to say "54 shops are registered",
         which was true the day it was written and is a number nobody
         will remember to change. A sentence that rots quietly is
         worse than a vaguer one that stays true. */
      return '<strong>The shelves are bare, and that is on purpose.</strong><br>' +
        'The makers are registered and none of them is on a shelf yet. Nothing ' +
        'goes up here until somebody has opened that shop and read what it ' +
        'actually sells, which is slower than trusting a feed and is the entire ' +
        'reason to do it that way.<br><br>' +
        'The <a href="/arcade">arcade</a> is open while you wait. It never sells ' +
        'you anything either.';
    }
    return '<strong>Nothing in ' + esc(roomName) + ' yet.</strong><br>' +
      'Shops are live, but nothing read so far belongs on these shelves. ' +
      'There are other doors on the <a href="/">map</a>.';
  }


  function boot() {
    var room = currentRoom();
    if (room) { renderRoom(room); return; }
    renderMap();
    /* THE FRONT PAGE IS A SHELF TOO, not just a table of contents.
       A browse-first shop whose front door is nine links to empty
       rooms gives a visitor nothing to look at. The map is how you
       navigate deliberately; the grid under it is how you wander,
       which is the thesis. It stays hidden until there is stock. */
    var shelf = $('#allShelf'), all = $('#allGrid');
    if (!shelf || !all) return;
    /* THE SECTION, NOT THE GRID INSIDE IT. Hiding only #allGrid left
       the EVERYTHING heading standing over an empty space -- a
       promise of content with nothing under it, which is the one
       thing worse than the empty map it sits below. The heading and
       the grid are one claim, so they appear and disappear together. */
    if (!state.items.length) { shelf.hidden = true; return; }
    shelf.hidden = false;
    all.hidden = false;
    window.GDGrid.mount(all, state.items, { shopNames: state.shopNames });
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
      state.shopNames = {};
      for (var s2 = 0; s2 < state.stores.length; s2++) {
        state.shopNames[state.stores[s2].key] = state.stores[s2].name;
      }
      /* A card wants a display name, not a slug. Denormalised once
         here rather than looked up per card on every redraw. */
      for (var n = 0; n < state.items.length; n++) {
        state.items[n].shopName = state.shopNames[state.items[n].k] || state.items[n].k;
      }
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
