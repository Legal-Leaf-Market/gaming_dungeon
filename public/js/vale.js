/* ============================================================
   vale.js — the two things the scene cannot do in CSS
   ------------------------------------------------------------
   1. The leaves, which need a different size, speed, drift, spin
      and start time each or the eye reads them as copies.
   2. The band separation on scroll, which needs the scroll offset.

   Both are decoration and both are OPTIONAL BY CONSTRUCTION: the
   scene in vale.css is a complete painting without either, so this
   file failing to load, or refusing to run because the visitor asked
   for less motion, leaves a background rather than a blank.
   ============================================================ */
(function () {
  var scene = document.querySelector('.vale')
  if (!scene) return

  /* ASKED AND ANSWERED, ONCE. prefers-reduced-motion is checked here
     as well as in the stylesheet, because the CSS can only stop the
     animation on elements this would otherwise still be creating and
     the scroll handler would still be running. Cheapest correct
     thing: do not build either. */
  var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (still) return

  /* Flora.luau's own greens, plus the blossom pink, which is what is
     actually falling in the vale in spring. */
  var HUES = ['#7ea85c', '#688e4e', '#8fae63', '#f0b8cd', '#d8c48a']

  /* Away from the middle. The shop's own content lives in the centre
     column and a leaf crossing a product photo is litter, not
     weather, so most of them fall down the outer thirds. */
  function column() {
    if (Math.random() < 0.72) {
      var band = Math.random() * 17
      return (Math.random() < 0.5 ? band : 100 - band).toFixed(1)
    }
    return (Math.random() * 100).toFixed(1)
  }

  var count = window.innerWidth < 700 ? 12 : 26
  var frag = document.createDocumentFragment()
  for (var i = 0; i < count; i++) {
    var leaf = document.createElement('i')
    leaf.className = 'leaf'
    var dur = 22 + Math.random() * 22
    leaf.style.cssText = [
      '--l:' + column() + '%',
      '--sz:' + (9 + Math.random() * 11).toFixed(0) + 'px',
      '--drift:' + ((Math.random() < 0.5 ? -1 : 1) * (50 + Math.random() * 90)).toFixed(0) + 'px',
      '--spin:' + ((Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 300)).toFixed(0) + 'deg',
      '--op:' + (0.22 + Math.random() * 0.26).toFixed(2),
      '--hue:' + HUES[Math.floor(Math.random() * HUES.length)],
      '--dur:' + dur.toFixed(1) + 's',
      /* negative, so the leaf is already mid-fall on the first frame
         rather than the whole set entering together */
      '--delay:' + (-Math.random() * dur).toFixed(1) + 's',
    ].join(';')
    frag.appendChild(leaf)
  }
  scene.appendChild(frag)

  /* ---------------------------------------------------------
     BAND SEPARATION

     A FEW PIXELS EACH, and the numbers are small on purpose. The
     scene is fixed to the viewport, so this is not parallax scrolling
     past a backdrop; it is the near grove sliding a little further
     than the far rim as the page moves, which is the only cue depth
     actually needs. Anything larger and the landscape starts riding
     the scrollbar, which is the effect this was written to avoid.

     Capped, too: past a screen or so of scrolling the shop is the
     subject and the scene should have finished settling.
     --------------------------------------------------------- */
  var bands = [
    { el: scene.querySelector('.far'), rate: 0.010, cap: 14 },
    { el: scene.querySelector('.mid'), rate: 0.026, cap: 34 },
    { el: scene.querySelector('.grove'), rate: 0.052, cap: 68 },
  ].filter(function (b) { return b.el })

  var ticking = false
  function settle() {
    var y = window.pageYOffset || document.documentElement.scrollTop || 0
    for (var i = 0; i < bands.length; i++) {
      var b = bands[i]
      b.el.style.setProperty('--rise', Math.min(y * b.rate, b.cap).toFixed(1) + 'px')
    }
    ticking = false
  }
  window.addEventListener('scroll', function () {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(settle)
  }, { passive: true })
  settle()
})()
