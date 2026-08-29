/* ============================================================
   city.js — the three things the scene cannot do in CSS

     1. the drift loop distance, which is one rendered tile and has
        to be measured
     2. the scroll offset the bands parallax against
     3. the petals, which need a different size, speed, drift, spin
        and start time each or the eye reads them as copies

   OPTIONAL BY CONSTRUCTION. city.css is a complete picture without
   any of it: this file failing to load, or declining to run because
   the visitor asked for less motion, leaves a still painting rather
   than a blank. Nothing in the scene is built here that is not
   purely motion.
   ============================================================ */
(function () {
  var scene = document.querySelector('.city')
  if (!scene) return

  /* ASKED AND ANSWERED, ONCE. The stylesheet also honours
     prefers-reduced-motion, but it can only stop animations on
     elements this file would otherwise still be creating, and it
     cannot stop a scroll handler that should never have been
     bound. Cheapest correct thing: build none of it. */
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (still) return

  /* ---------------------------------------------------------
     0. THE PAINTED SCENE, IF IT EXISTS

     Drawn geometry has a ceiling. It can do silhouette, and this
     scene leans on that as hard as it can, but it cannot do painted
     light, texture, or scattered air: two attempts at exactly that
     (a lighting filter, then a grain pass) were built, looked at
     against the flat version and reverted. A painting can. It is the
     one asset this repo cannot generate for itself.

     So the scene is an UPGRADE PATH. Five painted plates, by name,
     matching the five the generator makes:

       /assets/paint/crag.webp    distant peaks, transparent below
       /assets/paint/far.webp     the upper city, transparent above
       /assets/paint/mid.webp     the quarter and its bridge
       /assets/paint/near.webp    foreground eaves and lanterns
       /assets/paint/bough.webp   the cherry branch, corner piece

     Each layer is probed independently and swapped in on its own, so
     dropping in only the crag plate upgrades the mountains while the
     vector city keeps working in front of them. Nothing is
     configured anywhere: committing a file with the right name IS
     the switch. The spec the painter works from is
     docs/SCENE_ART_BRIEF.md, and test/ holds these five names, the
     stylesheet and that document to the same list.

     Probed with Image() rather than fetch so that a successful probe
     IS the warm cache, and remembered in sessionStorage so the
     misses cost five 404s once per session rather than per page.
     --------------------------------------------------------- */
  var PAINT = ['crag', 'far', 'mid', 'near', 'bough']
  function paintProbe() {
    var cached = null
    try { cached = sessionStorage.getItem('verda_paint') } catch (e) {}
    if (cached !== null) {
      var have = cached ? cached.split(',') : []
      for (var i = 0; i < have.length; i++) {
        if (have[i]) scene.classList.add('painted-' + have[i])
      }
      return
    }
    var found = []
    var left = PAINT.length
    PAINT.forEach(function (name) {
      var img = new Image()
      img.onload = function () { found.push(name); scene.classList.add('painted-' + name); done() }
      img.onerror = done
      img.src = '/assets/paint/' + name + '.webp'
      function done() {
        if (--left) return
        try { sessionStorage.setItem('verda_paint', found.join(',')) } catch (e) {}
      }
    })
  }
  paintProbe()

  /* ---------------------------------------------------------
     1. THE DRIFT LOOP

     Each band tiles a plate whose height is set in CSS and whose
     width follows from its aspect. Panning by exactly one tile
     width loops invisibly; panning by anything else jumps once per
     cycle, which is the kind of bug that is obvious in a two minute
     stare and invisible in a ten second one.

     The ratios below are the plates' own viewBoxes. They are
     duplicated here because the browser will not tell us the
     rendered size of a background image, and test/scene keeps this
     table honest against the committed SVGs.
     --------------------------------------------------------- */
  var ASPECT = { crag: 2400 / 760, far: 2400 / 620, mid: 2400 / 560, near: 2400 / 420 }

  function measure() {
    var ok = false
    for (var key in ASPECT) {
      var el = scene.querySelector('.' + key)
      if (!el) continue
      var h = el.clientHeight
      if (!h) continue
      /* A fractional tile width leaves a hairline of sky at the
         seam on some device pixel ratios, so round it. One pixel of
         drift over four hundred seconds is not a thing anyone can
         see; a flickering seam is. */
      el.style.setProperty('--loop', '-' + Math.round(h * ASPECT[key]) + 'px')
      ok = true
    }
    if (ok) scene.classList.add('drifting')
  }
  measure()
  addEventListener('resize', debounce(measure, 220))

  /* ---------------------------------------------------------
     2. PARALLAX

     One custom property on the container, read by every band's
     transform. Writing --sy once rather than a transform per layer
     means the whole scene moves in a single style recalculation,
     and the factors stay in the stylesheet where they belong next
     to the heights they were tuned against.
     --------------------------------------------------------- */
  var pending = false
  function onScroll() {
    if (pending) return
    pending = true
    requestAnimationFrame(function () {
      pending = false
      /* Capped. Past a couple of screens the bands have done all
         the separating they are going to do, and letting the
         number run pushes the near band off the bottom of a long
         page for no benefit. */
      var y = Math.min(window.scrollY || 0, 1400)
      scene.style.setProperty('--sy', y + 'px')
    })
  }
  addEventListener('scroll', onScroll, { passive: true })
  onScroll()

  /* ---------------------------------------------------------
     3. PETALS

     Fourteen on a wide screen, six on a phone. The count is small
     on purpose: this is a shop, and the moment the reader notices
     the weather instead of the shelf the weather has failed.

     Every petal gets its own everything. Sharing any one of size,
     duration, delay, drift or spin makes pairs of them visibly
     move together, which is the tell.
     --------------------------------------------------------- */
  var wide = innerWidth > 760
  var count = wide ? 14 : 6
  var frag = document.createDocumentFragment()
  for (var i = 0; i < count; i++) {
    var p = document.createElement('i')
    p.className = 'petal'
    var s = p.style
    s.setProperty('--x', rnd(-4, 104).toFixed(1) + 'vw')
    s.setProperty('--w', rnd(6, 13).toFixed(1) + 'px')
    s.setProperty('--dur', rnd(15, 34).toFixed(1) + 's')
    /* NEGATIVE delays, so the first petal is already halfway down
       when the page paints. A positive delay means the visitor
       watches an empty sky for twenty seconds and concludes there
       is no weather. */
    s.setProperty('--delay', (-rnd(0, 34)).toFixed(1) + 's')
    s.setProperty('--drift', rnd(-140, 190).toFixed(0) + 'px')
    s.setProperty('--spin', rnd(240, 900).toFixed(0) + 'deg')
    s.setProperty('--o', rnd(0.22, 0.56).toFixed(2))
    frag.appendChild(p)
  }
  scene.appendChild(frag)

  /* ---------------------------------------------------------
     THE GUST

     A door being opened throws a handful of petals across the
     screen. It is the one place the scenery answers the interface,
     and it is worth the twenty lines because it makes a link press
     feel like it happened somewhere.

     Built on the click and removed on animationend, so nothing is
     retained and a visitor who never presses anything pays nothing.
     Capped at one gust at a time: a fast clicker was able to stack
     these into a snowstorm.
     --------------------------------------------------------- */
  var gusting = false
  document.addEventListener('click', function (e) {
    var door = e.target && e.target.closest && e.target.closest('.door,.g-card,.cta')
    if (!door || gusting) return
    gusting = true
    setTimeout(function () { gusting = false }, 1200)

    var box = door.getBoundingClientRect()
    var fromX = ((box.left + box.width / 2) / innerWidth) * 100
    var fromY = ((box.top + box.height / 2) / innerHeight) * 100
    var burst = document.createDocumentFragment()
    var made = []
    for (var k = 0; k < 11; k++) {
      var g = document.createElement('i')
      g.className = 'gust'
      var gs = g.style
      gs.setProperty('--x', (fromX + rnd(-6, 6)).toFixed(1) + '%')
      gs.setProperty('--y', (fromY + rnd(-5, 5)).toFixed(1) + '%')
      gs.setProperty('--w', rnd(7, 14).toFixed(1) + 'px')
      gs.setProperty('--dx', rnd(-34, 46).toFixed(0) + 'vw')
      gs.setProperty('--dy', rnd(-14, 26).toFixed(0) + 'vh')
      gs.setProperty('--spin', rnd(300, 1100).toFixed(0) + 'deg')
      gs.setProperty('--dur', rnd(1.6, 2.9).toFixed(2) + 's')
      burst.appendChild(g)
      made.push(g)
    }
    scene.appendChild(burst)
    made.forEach(function (g) {
      g.addEventListener('animationend', function () {
        if (g.parentNode) g.parentNode.removeChild(g)
      })
    })
  }, true)

  /* --------------------------------------------------------- */
  function rnd(a, b) { return a + Math.random() * (b - a) }
  function debounce(fn, ms) {
    var t
    return function () { clearTimeout(t); t = setTimeout(fn, ms) }
  }
})()
