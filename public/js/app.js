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
  /* mx/my ARE WHERE THE ROOM STANDS ON THE MAP, as percentages of
     the plan; nx/ny are where it stands on the narrow one, which is
     a trail read top to bottom instead of a valley read across.

     Two coordinate sets rather than one plus arithmetic, because a
     map is a composition: on a wide board these places sit where the
     valley puts them, and on a phone they have to be a legible
     single-file walk. No formula turns one into the other, and
     pretending otherwise produces a map where half the markers
     overlap at 390px.

     nx/ny FOLLOW THE WALK ORDER rather than the declaration order,
     so the narrow trail zig-zags cleanly down the board instead of
     crossing itself four times. Reorder WALK and these move with it.

     They live only here and not in ROOMS_META (api/_scene.js). That
     file is the server's claim about what a room MEANS; where its
     pin sits is presentation, and the server has no opinion on it. */
  var ROOMS = [
    { mx:26, my:54, nx:70, ny:16, key:'arcade',        path:'/arcade-floor',  name:'The Arcade Floor', realm:5, band:'#e8be50',
      epithet:'A sun the size of a seed.',
      blurb:'Cabinets, sticks, and everything that used to eat quarters.' },
    { mx:12, my:77, nx:27, ny:7, key:'play',          path:'/play',          name:'Play',             realm:2, band:'#78aadc',
      epithet:'Breath by breath, the sea fills.',
      blurb:'Games, keys and the things you actually play.' },
    { mx:17, my:27, nx:28, ny:25, key:'tabletop',      path:'/tabletop',      name:'The Table',        realm:3, band:'#60b496',
      epithet:'What is built on stone endures.',
      blurb:'Dice, decks, minis and the four hours you lost to them.' },
    { mx:42, my:69, nx:28, ny:43, key:'battlestation', path:'/battlestation', name:'Battlestation',    realm:4, band:'#5896eb',
      epithet:'A whirlpool learns to hold its center.',
      blurb:'The desk. Boards, mice, screens, chairs.' },
    { mx:39, my:22, nx:70, ny:32, key:'workshop',      path:'/workshop',      name:'The Workshop',     realm:1, band:'#9b948a',
      epithet:'Flesh is the first furnace.',
      blurb:'Parts, printers and the rig you keep almost finishing.' },
    { mx:57, my:45, nx:70, ny:48, key:'audio',         path:'/audio',         name:'Audio',            realm:9, band:'#8cdcdc',
      epithet:'The way walks with you now.',
      blurb:'Amps, cans and speakers worth the shelf.' },
    { mx:73, my:75, nx:28, ny:79, key:'power',         path:'/power',         name:'Power',            realm:8, band:'#6e6ea0',
      epithet:'Emptiness, polished until it shines.',
      blurb:'Chargers, cables, and the brick you keep losing.' },
    { mx:69, my:20, nx:28, ny:61, key:'vault',         path:'/vault',         name:'The Vault',        realm:6, band:'#be82eb',
      epithet:'The self that steps outside the self.',
      blurb:'Figures, manga, plush and things kept in the box.' },
    { mx:88, my:50, nx:70, ny:64, key:'wardrobe',      path:'/wardrobe',      name:'The Wardrobe',     realm:7, band:'#e278b4',
      epithet:'The river forgets it was rain.',
      blurb:'What you wear to the thing.' },
    /* THE WALLS sits in the gap between the two mountain ranges,
       north of the river and clear of both. The narrow column below
       it was re-spaced rather than extended: the right-hand ladder
       ran 16/34/52/70 with the free arcade at 90, so a tenth stop at
       88 would have landed on top of it. 16/32/48/64/80 fits five
       with the same gap at the bottom. */
    { mx:55, my:16, nx:70, ny:80, key:'walls',         path:'/walls',         name:'The Walls',        realm:10, band:'#f0f0fa',
      epithet:'The heavens themselves object.',
      blurb:'Canvas, wallpaper and the things that make it a room.' }
  ];


  var $ = function (s) { return document.querySelector(s); };
  var esc = function (v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  };

  /* `loading` and `tries` are the two the redesign added, and they
     exist so the interface can tell "coming" from "empty" and say so.
     `nextIn` is only set while a retry is pending. */
  var state = { items: [], stores: [], waiting: {}, shopNames: {}, reached: false,
                loading: true, tries: 0, nextIn: 0 };

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

  /* ------------------------------------------------------------- map
     AN ACTUAL MAP, NOT NINE RECTANGLES.

     What was here was a responsive grid of cards, which is a table of
     contents with a stripe on it. The site's whole thesis is that you
     WANDER rather than search, and a grid is the one layout that
     says the opposite: it has a reading order, it has a first cell
     and a last, and it looks like every other shop.

     So the rooms are places now. They stand on a plan of the valley
     (assets/quarter.svg, generated) at coordinates that are theirs,
     joined by a trail drawn through them in the order somebody would
     actually walk it.

     THE TRAIL IS COMPUTED FROM THE MARKERS' OWN COORDINATES, not
     drawn into the plate. A path baked into the artwork is a second
     copy of those numbers and it goes wrong the first time anybody
     moves a room; this way the line cannot come away from the places
     it connects.

     Still ten links with text in them, in document order, so a
     screen reader gets a list of destinations and a keyboard gets a
     tab sequence. The map is how it looks, not what it is. */
  /* ---------------------------------------------------------
     THE HEADER OVER THE GOLDEN HERO

     The approved hero art has the brand and the top link PAINTED
     INTO IT. The live header carries the real routes, so both exist,
     and two sets of the same words a few pixels apart is the most
     obvious mistake this page could ship. They cannot be made to
     coincide: the painting's typeface is not the site's, so matching
     the size and the tracking lines up the ends of the words and
     leaves every letter between them doubled. Measured, tried,
     discarded.

     So over the hero the live header is a transparent hit layer and
     the painting is what you read. Below the hero there is no
     painting, and a header nobody can see is not a header, so it
     comes back. One class, toggled on scroll.

     Not a reveal animation: the existing navigation staying legible
     on the part of the page that has no picture under it.
     --------------------------------------------------------- */
  function goldenHeader() {
    var hero = document.querySelector('.hero-golden');
    if (!hero) return;
    var pending = false;
    function check() {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        /* Switches where the header stops being over the painting:
           the hero's bottom, less the header's own height. */
        var past = (window.scrollY || 0) > (hero.offsetHeight - 90);
        document.body.classList.toggle('past-golden', past);
      });
    }
    addEventListener('scroll', check, { passive: true });
    addEventListener('resize', check, { passive: true });
    check();
  }
  goldenHeader();

  function renderMap() {
    var published = state.stores.length;
    var narrow = window.matchMedia && window.matchMedia('(max-width: 720px)').matches;

    var pins = ROOMS.map(function (r) {
      var n = countIn(r.key);
      /* THE NARRATOR NEVER LIES ABOUT STOCK. Every label below still
         reads as its literal fact: counting means the catalogue has
         not answered yet, no answer means it did not, bare means
         nothing is published, empty means this room in particular
         has nothing. Flavour wraps the truth and never replaces it,
         because the one thing a shop can do that is genuinely
         dishonest is make an empty shelf sound like a full one. */
      /* THE PIN NEEDED THE SAME FIX THE ROOM PAGE GOT, and having
         only half of it was worse than having neither. The room page
         says "15 makers signed for The Walls, none stocked yet"; the
         map pin over the same door said NOTHING HERE. The pin is what
         a visitor reads first, and on the front page of the site it
         was the more visible of the two by a distance.

         `signed` is as literal as the labels around it. It does not
         claim stock, it counts registrations, and a room with neither
         stock nor a signing still falls through to "nothing here",
         which is then true of it. */
      var w = (state.waiting && state.waiting[r.key]) || 0;
      var label = state.loading ? 'counting\u2026'
                : !state.reached ? 'no answer'
                : published === 0 ? 'shelves bare'
                : n === 0 && w ? w + ' signed'
                : n === 0 ? 'nothing here'
                : n + (n === 1 ? ' thing' : ' things');
      return {
        r: r, label: label, has: n > 0,
        x: narrow ? r.nx : r.mx,
        y: narrow ? r.ny : r.my
      };
    });

    /* The arcade is a destination on the map like any other, because
       it is one. It is also the only one that works today. Immortal
       Ascension, the eleventh realm, is the one high band spent
       anywhere on this site, on the room that sells nothing:
       "the last stair has no rail." */
    pins.push({
      r: { key:'arcade-stick', path:'/arcade', name:'The Arcade', band:'#ffe2a0',
           epithet:'The last stair has no rail.',
           blurb:'Cabinets in the corner. Free play, nothing for sale, no sign-up.' },
      label: 'open', has: true, cabinet: true,
      x: narrow ? 68 : 90, y: narrow ? 90 : 76
    });

    /* THE TRAIL IS A WALK, NOT THE ARRAY ORDER. The pins are in the
       order rooms are declared, which is the order a reader tabs
       through them and is right for that; joining them in the same
       order draws a line that crosses itself four times. WALK is the
       order somebody would actually take on foot. Keys, so moving a
       room's pin moves the trail with it and neither can go stale. */
    var WALK = ['play', 'arcade', 'tabletop', 'workshop', 'battlestation',
                'audio', 'vault', 'wardrobe', 'power', 'arcade-stick'];
    var byKey = {};
    pins.forEach(function (p) { byKey[p.r.key] = p });
    var trail = WALK.map(function (k) {
      var p = byKey[k];
      return p ? p.x + ',' + p.y : '';
    }).filter(Boolean).join(' ');

    /* THE REGIONS GET A PICTURE.
       ------------------------------------------------------------
       The five region names are the strongest lore the map has, and
       until now each was a word floating over empty plate: somebody
       asked what the Northern Wall WAS without being prompted, which
       is the reaction to build for and not one an empty label earns.

       COORDINATES ARE THE LABELS' OWN, lifted from the label() calls
       in tools/city.mjs and divided by that file's 2000x1250 viewBox.
       The plate is aspect-ratio 16/10 and so is the viewBox, so
       `cover` crops nothing and a percentage here lands exactly where
       the word does. If the map is ever regenerated at another size,
       these move and this comment is where to look.

       OFFSET BELOW THE WORD, not centred on it. The labels live in
       the background SVG, so anything added here paints on top of
       them, and a cartouche centred on its own name would smother the
       name. Dropping it clear puts the picture in the region and
       leaves the word legible.

       WIDE MAP ONLY. The narrow layout re-places every pin on its own
       nx/ny grid and does not use the plate's coordinate space at
       all, so these would land nowhere near their regions. */
    /* `d` IS WHICH SIDE OF ITS OWN LABEL THE PICTURE SITS ON, and
       it is per-region rather than a constant because two of the
       five labels are near the bottom of the plate. Dropping those
       below their word pushed them straight through the plate's
       edge, where `overflow:hidden` ate them: The Still Water and
       The Lantern Quarter rendered as nothing at all. Those two
       rise instead. */
    var regions = narrow ? '' : [
      { k:'northern-wall',   x:20,   y:10.6, d: 1 },
      { k:'greensleep',      x:7.5,  y:44.8, d: 1 },
      { k:'eastern-reach',   x:78,   y:34.4, d: 1 },
      { k:'still-water',     x:75,   y:92.4, d:-1 },
      { k:'lantern-quarter', x:13.9, y:90.9, d:-1 }
    ].map(function (r) {
      return '<span class="region" aria-hidden="true" style="--x:' + r.x + ';--y:' + r.y +
        ';--d:' + r.d + ';background-image:url(/art/region-' + r.k + '.webp)"></span>';
    }).join('');

    var html =
      '<svg class="map-trail" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">' +
        '<polyline points="' + trail + '"/>' +
      '</svg>' +
      /* One corner drawn, mirrored into four. Decoration, so
         aria-hidden and untouchable like everything else here. */
      ['tl','tr','bl','br'].map(function (c) {
        return '<span class="plan-corner ' + c + '" aria-hidden="true"></span>';
      }).join('') +
      regions +
      pins.map(function (p, i) {
        return '<a class="pin' + (p.cabinet ? ' cabinet' : '') +
          (p.has ? '' : ' quiet') + '" href="' + p.r.path + '"' +
          ' style="--band:' + esc(p.r.band) + ';--x:' + p.x + ';--y:' + p.y + ';--i:' + i + '">' +
          '<span class="pin-dot" aria-hidden="true">' +
            '<svg class="pin-ico" viewBox="0 0 64 64"><use href="#ico-' + esc(p.r.key) + '"></use></svg>' +
          '</span>' +
          /* NAME AND COUNT ARE ALWAYS ON THE MAP. A map you have to
             hover to read is not a map, it is a guessing game with
             pictures: the whole advantage of places over a list is
             that you can see all of them at once. The epithet and
             the blurb wait for approach, because those are what you
             read when you have already picked somewhere. */
          '<span class="pin-label">' +
            '<span class="pin-name">' + esc(p.r.name) + '</span>' +
            '<span class="pin-count">' + esc(p.label) + '</span>' +
          '</span>' +
          '<span class="pin-card">' +
            '<span class="pin-epithet">' + esc(p.r.epithet) + '</span>' +
            '<span class="pin-blurb">' + esc(p.r.blurb) + '</span>' +
          '</span>' +
        '</a>';
      }).join('');

    $('#doors').className = 'plan' + (narrow ? ' plan-narrow' : '');
    $('#doors').innerHTML = html;
  }

  /* The map is a composition, and the composition differs above and
     below 720px, so a resize across that line has to rebuild it.
     Debounced: a drag-resize fires this continuously otherwise. */
  var mapT = null;
  addEventListener('resize', function () {
    if (!$('#doors') || $('#roomView') && !$('#roomView').hidden) return;
    clearTimeout(mapT);
    mapT = setTimeout(renderMap, 180);
  });

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
    $('#roomNameText').textContent = room.name;
    $('#roomBlurb').textContent = room.blurb;

    /* THE ART IS ADDRESSED BY DATA, NOT BY BRANCHING. The plate is
       a CSS rule keyed on `data-room` and the sigil is a background
       built from the realm number, so adding a room needs no code
       here and a room whose art nobody has drawn simply has none.
       Both fail to nothing rather than to a broken-image box, which
       is why neither is an <img>. */
    var head = document.querySelector('.room-head');
    if (head) head.setAttribute('data-room', room.key);

    var sig = $('#roomSigil');
    if (sig) {
      sig.style.backgroundImage = 'url(/art/sigil-' + room.realm + '.webp)';
      sig.hidden = false;
    }

    mountGrid(room.key);
  }

  /* ------------------------------------------------------- waiting
     A SHELF THAT IS COMING SHOULD LOOK LIKE A SHELF, not like an
     empty one. Nicotia grew this and the reason is measurable: the
     catalogue is a multi-store scrape behind a cache, so a cold
     request is seconds rather than milliseconds, and for those
     seconds the old page showed the words for "there is nothing
     here". A visitor cannot tell slow from empty, and empty is the
     one that makes them leave.

     Grey plates in the real card's shape, not a spinner. A spinner
     says "wait"; a skeleton says "this is a shelf, and it is nearly
     drawn", and it holds the layout so nothing jumps when the
     products land. */
  function skeleton(n) {
    var h = '';
    for (var i = 0; i < (n || 12); i++) {
      h += '<div class="sk" style="--i:' + i + '"></div>';
    }
    return '<div class="skel" aria-hidden="true">' + h + '</div>' +
      '<p class="sr-only" role="status">Loading the shelves.</p>';
  }

  /* THE FAILURE SAYS WHAT FAILED AND WHAT IS BEING DONE ABOUT IT.
     `waiting` is the retry showing its working: an unexplained delay
     is indistinguishable from a hang, and somebody watching "attempt
     2, retrying in 4s" will wait through it where they would not
     wait through nothing. Lifted straight from Nicotia. */
  function waiting(tries, secs) {
    return '<div class="state">' +
      '<b>Still fetching the catalogue</b>' +
      '<span>Nobody has opened the quarter in a while, so the shelves are being ' +
      'read fresh from every shop. It is slow the first time and instant for ' +
      'everybody after you.</span>' +
      '<small>Attempt ' + (tries + 1) + ', retrying in ' + secs + 's</small>' +
      '</div>';
  }

  function mountGrid(roomKey) {
    var mine = state.items.filter(function (it) {
      return !roomKey || it.room === roomKey;
    });
    var grid = $('#grid'), empty = $('#roomEmpty');

    /* Loading beats empty. Without this the room view shows its
       "nothing here yet" copy for the whole first second of every
       cold visit, which is the site calling itself empty. */
    if (state.loading && !mine.length) {
      empty.hidden = true;
      grid.innerHTML = state.tries ? waiting(state.tries, state.nextIn || 0) : skeleton(12);
      return;
    }

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
      shopNames: state.shopNames,
      /* A room chip on a room page is a door. See the handler in
         grid.js: filtering in place left the heading, the blurb, the
         sigil, the plate and the URL all describing a different room
         from the shelf underneath them. ROOMS is the only place that
         knows a key's path, and they are not derivable -- `arcade`
         lives at /arcade-floor -- so the lookup happens here. */
      onRoom: function (key) {
        for (var i = 0; i < ROOMS.length; i++) {
          if (ROOMS[i].key === key) { location.href = ROOMS[i].path; return; }
        }
      }
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
    /* SIGNED BUT NOT YET READ IS ITS OWN STATE, and until this branch
       existed it was told as the wrong one. A room with makers waiting
       on a capture fell through to "nothing read so far belongs on
       these shelves", which says we opened those shops and turned
       them down. We have not opened them. Audio went from two makers
       to twenty-five in an afternoon and said the same sentence
       throughout, which is the site being modest about the one thing
       actually happening to it. */
    var waiting = (state.waiting && state.waiting[roomKey]) || 0;
    if (waiting) {
      return '<strong>' + waiting + ' maker' + (waiting === 1 ? '' : 's') +
        ' signed for ' + esc(roomName) + ', none stocked yet.</strong><br>' +
        'Nothing goes on a shelf here until somebody has opened that shop and read ' +
        'what it actually sells, which is slower than trusting a feed and is the ' +
        'entire reason to do it that way.<br><br>' +
        'There are other doors on the <a href="/">map</a>, and the ' +
        '<a href="/arcade">arcade</a> is open while you wait.';
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
    /* WHILE IT IS COMING, THE SHELF IS SHOWN AND IS DRAWING ITSELF.
       Hiding it until the fetch lands meant the front page was a
       hero and ten doors reading "no answer", and then a whole
       section appeared under the fold that nobody scrolled back up
       to find. A skeleton holds the place. */
    if (state.loading && !state.items.length) {
      shelf.hidden = false; all.hidden = false;
      all.innerHTML = state.tries ? waiting(state.tries, state.nextIn || 0) : skeleton(12);
      return;
    }
    if (!state.items.length) { shelf.hidden = true; return; }
    shelf.hidden = false;
    all.hidden = false;
    window.GDGrid.mount(all, state.items, { shopNames: state.shopNames });
  }

  /* ============================================================
     LOADING, WITH THE RETRY SHOWING ITS WORKING

     One fetch and a silent catch was the whole of this before. Two
     things were wrong with it and both are visible to a visitor:

       A COLD CACHE IS SLOW, NOT BROKEN. The catalogue behind
       /api/products is a multi-store read; when nobody has warmed it
       the first request takes seconds. A single attempt that times
       out left the site saying "no answer" forever, on a shop that
       was working perfectly.

       A NETWORK BLIP IS NOT A VERDICT. A phone changing cell towers
       drops one request. Retrying twice costs a few seconds in the
       rare bad case and saves the entire visit.

     Three attempts, 2s then 6s, and the wait is SHOWN rather than
     hidden: "attempt 2, retrying in 4s" is something a person will
     sit through, and an unexplained pause is not. Nicotia's shape,
     and its reasoning, ported.
     ============================================================ */
  var BACKOFF = [2, 6];        /* seconds before attempt 2 and 3 */

  function load() {
    fetch('/api/products', { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) {
        if (!j) throw new Error('empty response');
        state.reached = true;
        state.loading = false;
        state.items = (j.items || []).map(function (it) {
          /* `dept` is what the ported engine still calls it in
             places. Read both rather than depending on which half of
             the port produced this row; when the nicotine-shaped
             leftovers come out of products.js this can drop to
             `room`. */
          it.room = it.room || it.dept || '';
          return it;
        });
        state.stores = j.stores || [];
        state.waiting = j.waiting || {};
        state.shopNames = {};
        for (var s2 = 0; s2 < state.stores.length; s2++) {
          state.shopNames[state.stores[s2].key] = state.stores[s2].name;
        }
        /* A card wants a display name, not a slug. Denormalised once
           here rather than looked up per card on every redraw. */
        for (var n = 0; n < state.items.length; n++) {
          state.items[n].shopName = state.shopNames[state.items[n].k] || state.items[n].k;
        }
        boot();
      })
      .catch(function () {
        var wait = BACKOFF[state.tries];
        if (wait === undefined) {
          /* Out of attempts. `reached` stays false and emptyWords()
             says the road is out, which is the true thing. */
          state.loading = false;
          boot();
          return;
        }
        state.tries++;
        state.nextIn = wait;
        boot();                       /* repaint with the countdown */
        var left = wait;
        var tick = setInterval(function () {
          left--;
          state.nextIn = left > 0 ? left : 0;
          /* Only the number changes, so only the number is rewritten.
             Re-running boot() every second would rebuild the map and
             throw away a search the visitor had already typed. */
          var small = document.querySelector('.state small');
          if (small) small.textContent = 'Attempt ' + (state.tries + 1) +
            ', retrying in ' + state.nextIn + 's';
          if (left <= 0) { clearInterval(tick); load(); }
        }, 1000);
      });
  }
  load();

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
