/* ============================================================
   The cabinet registry: which Roblox games the hub carries.
   ------------------------------------------------------------
   WHAT IS ACTUALLY POSSIBLE HERE, SAID PLAINLY, because the whole
   design follows from it:

   A ROBLOX GAME CANNOT BE EMBEDDED AND PLAYED IN A WEB PAGE. The
   browser player was discontinued years ago; games run only in the
   Roblox client. There is no embed SDK and no iframe product for
   third parties, and Roblox's terms prohibit framing their site. Any
   future "just iframe it" idea is not a thing that was missed here.

   What IS possible, and is what this builds: a curated shelf that
   shows each game's real thumbnail, live player count and visit
   count -- read server-side from Roblox's public API -- and hands the
   visitor off to the game's own page to launch it. Same shape as the
   rest of this site: we never take the order, we point at the door.

   PLACE IDS ARE NOT GUESSABLE AND MUST NEVER BE GUESSED. This is the
   same failure the affiliate code has: an invented impact.com
   campaign id does not degrade, it dies at the network. An invented
   placeId is worse, because it DOES resolve -- to a stranger's game,
   under our recommendation. So `placeId: 0` means "not configured",
   a cabinet with one is never served, and /api/roblox reports how
   many are waiting rather than quietly showing a shorter shelf.

   HOW TO FIND A PLACE ID: open the game on roblox.com and read it out
   of the URL -- roblox.com/games/<PLACE ID>/<name>. That is the
   number, and it is the one this file wants. The universe id is a
   different number and is resolved from it at runtime.
   ============================================================ */

export const CABINETS = [
  {
    key: 'heavenpillar',
    name: 'Heavenpillar',
    /* OURS. The game this whole site's interface is ported from --
       see CLAUDE.md section 8. Its place id lives in the roblox-game
       repo's ROBLOX_PLACE_ID secret rather than in its code, so it is
       not something this file could have read. Paste it here. */
    placeId: 0,
    ours: true,
    blurb: 'An original cultivation MMORPG. 144 stages from a mortal in the Azure Vale ' +
           'to a True Immortal. This whole site is drawn in its interface.',
  },
]

/* A cabinet is servable when somebody has put a real place id on it.
   Nothing else gates it: unlike a merchant there is no catalogue to
   read and no include list to write, so there is no review step to
   invent. The id IS the decision. */
export function configured(c) {
  return !!(c && Number(c.placeId) > 0)
}

export function byKey(key) {
  return CABINETS.find(c => c.key === key) || null
}

/* The page a visitor is sent to. Roblox's own game page carries the
   Play button that launches their client, handles "you do not have it
   installed" far better than we could, and is the link a player
   expects.

   DELIBERATELY NOT a `roblox://` protocol URL. That launches the
   client directly when it exists and does NOTHING AT ALL when it does
   not -- no error, no fallback, a dead click on any machine without
   Roblox installed. A protocol link is the kind of thing that works
   perfectly on the machine of whoever added it. */
export function gameUrl(c) {
  return 'https://www.roblox.com/games/' + Number(c.placeId) + '/'
}
