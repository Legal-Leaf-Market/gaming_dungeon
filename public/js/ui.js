/* ============================================================
   ui.js — the two pieces of chrome every sister site grew

     VerdaToast(msg)          a line that says what just happened
     VerdaPhoto(src, label)   the card photo, full screen, zoomable

   Both are OPTIONAL BY CONSTRUCTION. grid.js calls them through
   `global.VerdaToast` / `global.VerdaPhoto` and checks first, so this
   file failing to load costs a confirmation message and a zoom, not
   the shelf.
   ============================================================ */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------ toast
     An action with no feedback reads as a broken button. Saving to
     the satchel changes one small icon in the corner of one card,
     which on a shelf of 240 is easy to miss entirely, and the second
     press of a button that "did nothing" undoes the first.

     One element, reused. A stack of toasts is a notification centre
     and this is a shop. */
  var tEl = null, tTimer = null;
  global.VerdaToast = function (msg) {
    if (!tEl) {
      tEl = document.createElement('div');
      tEl.id = 'toast';
      /* polite, not assertive: this is a confirmation, and a screen
         reader should finish the sentence it is on before saying it. */
      tEl.setAttribute('role', 'status');
      tEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(tEl);
    }
    tEl.textContent = msg;
    tEl.classList.add('on');
    clearTimeout(tTimer);
    tTimer = setTimeout(function () { tEl.classList.remove('on'); }, 2400);
  };

  /* ============================================================
     THE PHOTO VIEWER

     PORTED FROM HERBAL LEAF, which ported it from Legal Leaf, and
     carried across deliberately rather than written again: it has
     four fixes in it that were each found by somebody using the
     thing, and every one of them is invisible in a fresh
     implementation until a real visitor hits it. They are marked
     below. A 210px thumbnail cannot show a keycap profile, a die's
     edge finish, or what a resin figure's face actually looks like,
     and those are the things the decision turns on.

     Three ways out, because a photo you can open and cannot close is
     worse than one you cannot open: Escape, the backdrop, and the
     phone's back button.
     ============================================================ */
  var ov, pic, cap, open = false, lastFocus = null;

  function build() {
    if (ov) return;
    ov = document.createElement('div');
    ov.id = 'vPhoto';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', 'Product photo');
    ov.innerHTML =
      '<button id="vPhotoX" type="button" aria-label="Close photo">&times;</button>' +
      '<img alt=""/><div id="vPhotoCap"></div>';
    document.body.appendChild(ov);
    pic = ov.querySelector('img');
    cap = ov.querySelector('#vPhotoCap');

    /* Click the picture to zoom, anywhere else to close. The picture
       stops its own click from reaching the backdrop. */
    pic.addEventListener('click', function (e) {
      e.stopPropagation();
      if (!hitsPicture(e)) { close(); return; }
      pic.classList.toggle('zoomed');
    });
    pic.addEventListener('load', capToNatural);
    ov.addEventListener('click', close);
    ov.querySelector('#vPhotoX').addEventListener('click', function (e) {
      e.stopPropagation(); close();
    });
  }

  /* FIX 1 -- ASK THE CDN FOR THE MASTER BEFORE UPSCALING A THUMBNAIL.
     The grid only needs ~600px and that is often exactly what the
     card's src is. Every Shopify-family store this catalogue draws
     from takes the size in the query or in the filename, so the
     honest move is to request the bigger original rather than
     interpolate a small one. A wrong guess just 404s back to the
     src the card already showed: worst case is what we had. */
  function hiRes(src) {
    try {
      var u = new URL(src, location.href), big = false;
      ['w', 'width', 'maxwidth', 'max-w'].forEach(function (p) {
        if (u.searchParams.has(p) && Number(u.searchParams.get(p)) < 1600) {
          u.searchParams.set(p, '1600'); big = true;
        }
      });
      if (big) { ['h', 'height'].forEach(function (p) { u.searchParams.delete(p); }); return u.toString(); }
      var path = u.pathname.replace(/_\d+x\d*(_crop_[a-z]+)?(?=\.(jpe?g|png|webp|gif)$)/i, '');
      if (path !== u.pathname) { u.pathname = path; return u.toString(); }
    } catch (e) {}
    return src;
  }

  /* FIX 2 -- THE BACKDROP HAD A DEAD ZONE COVERING MOST OF THE SCREEN.
     The <img> is sized to fill the overlay so a small derivative
     still fills a phone, and object-fit:contain then letterboxes the
     PICTURE inside an element box that still spans everything. Those
     empty margins belong to the <img>, so a click on what plainly
     looks like backdrop hit the image and toggled zoom instead of
     closing. On a square photo in a wide window that is most of the
     window. Measure where the picture is actually painted and let a
     click outside it fall through to close, which is what the person
     aimed at. getBoundingClientRect() already carries the .zoomed
     transform, so the arithmetic holds at either zoom level. */
  function hitsPicture(e) {
    /* FIX 3 -- A CLICK WITHOUT A POINTER HAS NO COORDINATES. Keyboard
       activation and any programmatic .click() arrive with
       clientX/clientY at 0,0 and detail 0. Read geometrically that is
       the top-left corner, which is backdrop, so the viewer closed on
       a keystroke that means "zoom". */
    if (!e.detail) return true;
    var nw = pic.naturalWidth || 0, nh = pic.naturalHeight || 0;
    if (!nw || !nh) return true;              /* size unknown: old behaviour */
    var r = pic.getBoundingClientRect();
    if (!r.width || !r.height) return true;
    var scale = Math.min(r.width / nw, r.height / nh);
    var pw = nw * scale, ph = nh * scale;
    var px = r.left + (r.width - pw) / 2, py = r.top + (r.height - ph) / 2;
    return e.clientX >= px && e.clientX <= px + pw &&
           e.clientY >= py && e.clientY <= py + ph;
  }

  /* FIX 4 -- CAP GROWTH AT 2x THE FILE'S OWN PIXELS, once hiRes()
     cannot find a bigger original. Big enough to fill a phone screen
     without the upscale turning to mush. Recomputed per image because
     it depends on the file. */
  function capToNatural() {
    var nw = pic.naturalWidth || 0, nh = pic.naturalHeight || 0;
    if (!nw || !nh) { pic.style.maxWidth = ''; pic.style.maxHeight = ''; return; }
    pic.style.maxWidth = (nw * 2) + 'px';
    pic.style.maxHeight = (nh * 2) + 'px';
  }

  global.VerdaPhoto = function (src, label) {
    if (!src) return;
    build();
    var want = hiRes(src);
    pic.onerror = want === src ? null : function () { pic.onerror = null; pic.src = src; };
    pic.style.maxWidth = ''; pic.style.maxHeight = '';
    pic.src = want;
    pic.alt = label || 'Product photo';
    pic.classList.remove('zoomed');
    cap.textContent = label || '';
    ov.classList.add('on');
    open = true;
    lastFocus = document.activeElement;
    /* The page behind must not scroll: on a phone a flick meant for
       the photo otherwise scrolls the shelf underneath, and the
       overlay comes back over a different part of it. */
    document.documentElement.style.overflow = 'hidden';
    try { ov.querySelector('#vPhotoX').focus(); } catch (e) {}
  };

  function close() {
    if (!ov) return;
    ov.classList.remove('on');
    open = false;
    document.documentElement.style.overflow = '';
    /* Dropped rather than left loaded: a full-size photo held in an
       offscreen node is real memory on a phone, and the next open
       sets it again. */
    pic.removeAttribute('src');
    try { if (lastFocus && lastFocus.focus) lastFocus.focus(); } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    if (open && e.key === 'Escape') { e.preventDefault(); close(); }
  });
  /* The phone's back button is what a person reaches for first. */
  global.addEventListener('popstate', function () { if (open) close(); });
})(window);
