/* The Roblox cabinets. Renders /api/roblox into the arcade page.
   ------------------------------------------------------------
   THESE CABINETS LEAVE THE SITE AND THE UI SAYS SO. A Roblox game
   cannot be embedded and played in a page -- the browser player was
   discontinued years ago and there is no third-party embed -- so
   every cabinet here is a door, not a screen. Labelling them the same
   as the canvas games above would be the one genuinely dishonest
   thing this page could do. */
(function () {
  'use strict';
  var el = document.getElementById('hub');
  if (!el) return;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
    });
  }
  function num(n) {
    if (typeof n !== 'number') return null;
    return n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'
         : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
         : String(n);
  }

  fetch('/api/roblox').then(function (r) { return r.json(); }).then(function (j) {
    if (!j || !j.ok) { el.innerHTML = '<p class="empty">The arcade is not answering. That is us, not you.</p>'; return; }

    if (!j.cabinets.length) {
      /* THE EMPTY STATE SAYS WHICH EMPTY IT IS. "No cabinet has a
         place id yet" and "Roblox is down" produce the same bare
         list, and only one of them is somebody's to fix. */
      el.innerHTML = '<p class="empty"><strong>No cabinets yet.</strong><br>' + esc(j.why || '') +
        (j.waiting && j.waiting.length
          ? '<br><br>Waiting on an id: ' + j.waiting.map(function (w) {
              return '<code>' + esc(w.name) + '</code>';
            }).join(', ')
          : '') + '</p>';
      return;
    }

    var stale = j.live === false
      ? '<p class="empty" style="margin-bottom:14px">Roblox is not answering right now, so the ' +
        'player counts are hidden rather than guessed. The links still work.</p>'
      : '';

    el.innerHTML = stale + '<div class="g-grid">' + j.cabinets.map(function (c) {
      var shot = c.thumb
        ? '<img loading="lazy" decoding="async" alt="" src="' + esc(c.thumb) + '"/>'
        : '<span class="g-noimg" aria-hidden="true">' + esc((c.name || '?').charAt(0)) + '</span>';
      var playing = num(c.playing);
      var visits = num(c.visits);
      return '<a class="g-card" href="' + esc(c.url) + '" target="_blank" rel="noopener"' +
        ' style="--rar:var(--' + (c.ours ? 'precious' : 'rare') + ')">' +
        '<span class="g-shot">' + shot +
          (playing !== null ? '<span class="g-live">' + esc(playing) + ' playing</span>' : '') +
        '</span>' +
        '<span class="g-body">' +
          '<span class="g-title">' + esc(c.name) + (c.ours ? ' <em>(ours)</em>' : '') + '</span>' +
          '<span class="g-blurb">' + esc(c.blurb || '') + '</span>' +
          '<span class="g-foot">' +
            '<span class="g-shop">' + esc(c.creator ? 'by ' + c.creator : 'Roblox') + '</span>' +
            (visits !== null ? '<span class="g-price">' + esc(visits) + ' visits</span>' : '') +
          '</span>' +
          '<span class="g-rar">opens roblox</span>' +
        '</span>' +
      '</a>';
    }).join('') + '</div>';
  }).catch(function () {
    el.innerHTML = '<p class="empty">The hub is not answering.</p>';
  });
})();
