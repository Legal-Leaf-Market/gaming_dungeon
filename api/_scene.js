/* ============================================================
   _scene.js — ONE RULE, ONE FILE: which room does this belong in,
   and does it belong in the dungeon at all?
   ------------------------------------------------------------
   `classify()` returns a room key, or '' meaning WE DO NOT CARRY
   THIS. The empty string is the important half. Every merchant in
   the registry sells things that are not scene: phone cases, mugs,
   gift cards, a branded tote, somebody's dropshipped garden hose.
   A room is only worth walking if what is in it belongs there.

   THIS IS THE MIRROR OF A PATTERN BOTH SISTER SITES ALREADY RUN.
   Legal-Leaf's EXCLUDE refuses delta-8 and the synthetics; Kawaii
   Katz filters what is not kid-appropriate. Both are "pull a big
   catalogue, admit only the slice that belongs". This is the third,
   and it is written as one exported function for the same reason
   those are: a classifier copy-pasted into two callers drifts, and
   the drift is invisible because both callers keep working.

   ------------------------------------------------------------
   HOW IT DECIDES, AND WHY THE ORDER IS THE ORDER
   ------------------------------------------------------------
   1. REFUSE first. Non-products (gift cards, shipping protection,
      warranties) and off-scene goods are dropped before anything
      tries to place them. Refusing last means a washing machine
      gets a room and then gets removed from it, and whichever pass
      forgets step 2 ships the washing machine.

   2. STRONG SIGNALS next, most specific first. `arcade cabinet`
      beats `cabinet`; `dice tower` beats `tower`. Every rule below
      is ordered specific-to-generic within its room, and the ROOMS
      are ordered on two principles:

        - unambiguous object vocabulary first (tabletop, audio,
          power, workshop), so they get first refusal on a title;
        - then WHAT A THING IS beats WHAT IT IS ABOUT — wardrobe and
          vault above arcade, battlestation and play. A garment or a
          collectible noun is a claim about the object; a theme word
          is a claim about its subject. See the note above wardrobe.

   3. THE STORE'S OWN ROOM is the fallback, never the first answer.
      A store spans rooms: Krazed Gaming sells both games and mouse
      pads. Reading the product's own text first is what lets one
      merchant stock three rooms honestly.

   4. UNPLACEABLE returns the store's room rather than ''. A product
      we cannot read is not evidence of a product we should not
      carry, and dropping it would silently shrink every catalogue
      by whatever share of titles are terse.

   ------------------------------------------------------------
   DO NOT BROADEN A PATTERN TO MAKE A ROOM LOOK FULLER
   ------------------------------------------------------------
   Written down because all three sister sites have this note and
   all three earned it. A broad regex does not announce itself: it
   silently admits junk to a room, or silently hides real inventory
   from one, and the room still renders. The Herbal-Leaf guide puts
   it as "do NOT broaden isExcluded without checking live product
   names first", and that is the rule here too. If the arcade room
   looks thin, the answer is more retro merchants, not a looser
   idea of what retro means.

   Every pattern here is checked by test/scene.test.mjs against real
   captured titles. Add a pattern, add a case.
   ============================================================ */

/* ---- 1. things that are not products at all -----------------
   Shopify feeds are full of these and every one of them renders as
   a card with a price on it if nothing stops it. `Shipping
   Protection $2.99` on a shelf is the tell that this list is
   missing an entry. */
const NONPRODUCT = new RegExp([
  '\\bgift ?cards?\\b', '\\begift\\b', '\\bdonation\\b',
  /* The real wording varies more than you would guess: Shopify shops
     ship this as "Shipping Protection", "Route Package Protection"
     and "Order Protection" depending on which app added it. Matching
     only one of the three is how a $2.99 insurance line ends up on a
     shelf looking like the cheapest thing in the room. */
  '\\b(shipping|route|package|order|delivery)\\b[\\w ]{0,14}\\b(protection|insurance)\\b',
  'extended warranty', 'protection plan', '\\bpre-?order deposit\\b',
  'sample pack request', '\\btest product\\b', '\\bdo not (buy|order)\\b',
  '^\\s*select \\d+ for', 'rewards? coupon', '\\bstore credit\\b',
].join('|'), 'i')

const NONPRODUCT_TYPE = /^(fee|tax|shipping|insurance|service|gift card)$/i

/* ---- 2. off-scene goods -------------------------------------
   The Best Buy problem in reverse. Several registry merchants are
   general dropshippers with a gaming section, so their feeds carry
   kitchen gadgets and car accessories. This is the list that keeps
   those out, and it is deliberately narrow: each entry names a
   THING, never a vague word.

   `garden hose` is here. `hose` is not, because a braided PSU cable
   sleeve is sometimes called a hose and a room full of PC parts is
   exactly where that would land. That is the shape of every entry
   below: refuse the specific object, never the loose word. */
const OFF_SCENE = new RegExp([
  'washing machine', 'refrigerator', '\\bdishwasher\\b', 'vacuum cleaner',
  'air fryer', 'coffee (maker|machine)', '\\bblender\\b', '\\bmicrowave\\b',
  'garden hose', 'lawn mower', '\\bweed ?(eater|wacker)\\b',
  'baby (monitor|bottle|stroller)', '\\bdiapers?\\b',
  'car (seat|cover|wax|mat)\\b', '\\btyres?\\b', '\\bwiper blades?\\b',
  'dog (bed|leash|collar|toy)', 'cat litter', 'pet (bowl|carrier)',
  '\\bmattress\\b', 'shower curtain', '\\btoilet\\b',
  'dietary supplement', '\\bvitamins?\\b', 'weight loss',
  '\\bbacklinks?\\b', '\\bseo (service|package)\\b', 'guest post',
].join('|'), 'i')

/* ---- 3. the rooms, specific to generic ----------------------
   Order within this array IS the precedence order. The first room
   whose pattern matches wins, so anything whose vocabulary overlaps
   another room's must sit above it.

   TABLETOP IS FIRST ON PURPOSE. "Dice tower", "battle mat" and
   "miniature" all contain words that Battlestation and Play would
   otherwise claim, and a $40 resin dice tower filed under
   Battlestation is the kind of wrong that nobody reports because it
   is not obviously wrong, it is just in the wrong room. */
const ROOMS = [
  ['tabletop', new RegExp([
    'dice (set|tower|tray|bag)', '\\bd20\\b', '\\bd6\\b', 'polyhedral',
    '\\btcg\\b', 'trading card', 'card sleeves?', '\\bdeck box\\b', 'playmat',
    'booster (pack|box)', '\\bmagic: ?the gathering\\b', '\\bmtg\\b', '\\bpok[eé]mon cards?\\b',
    'board ?game', '\\brpg\\b', 'dungeons? ?(and|&) ?dragons', '\\bd&d\\b',
    'warhammer', 'miniatures?\\b', '\\bwargam', 'battle ?mat', 'terrain (kit|piece)',
    'game ?master', '\\bcampaign (book|guide)\\b',
  ].join('|'), 'i')],

  ['audio', new RegExp([
    '\\bamplifiers?\\b', '\\bamp\\b', '\\bdac\\b', 'phono (stage|preamp)', '\\bpreamp',
    'bookshelf speakers?', '\\bsubwoofers?\\b', '\\bstudio monitors?\\b',
    'headphones?', '\\bearbuds?\\b', '\\biems?\\b', '\\bin-?ear monitors?\\b',
    'gaming headset', '\\bheadsets?\\b', '\\bmicrophones?\\b', '\\bxlr\\b',
    '\\bturntables?\\b', '\\bsoundbar', 'audio interface', 'speaker (stand|wire|cable)',
  ].join('|'), 'i')],

  ['power', new RegExp([
    'power bank', 'portable charger', 'solar (charger|panel)', 'wall (charger|adapter)',
    '\\bgan charger\\b', 'charging (station|dock|hub|cable|brick)',
    '\\busb-?c\\b', '\\bhdmi cable\\b', '\\bdisplayport cable\\b', 'thunderbolt cable',
    'cable (management|sleeve|organiser|organizer|clip|tie)', 'extension (lead|cord)',
    'surge protector', 'power strip', '\\bups\\b battery', '\\bpsu\\b', 'power supply',
  ].join('|'), 'i')],

  ['workshop', new RegExp([
    '3d ?print', '\\bfilament\\b', '\\bpla\\b', '\\bpetg\\b', '\\bresin printer\\b',
    'laser engraver', '\\bcnc\\b', '\\bnozzles?\\b', 'build plate', '\\bhotend\\b',
    'graphics card', '\\bgpu\\b', '\\bcpu\\b', '\\bmotherboard', '\\bram\\b (kit|module)',
    '\\bddr[45]\\b', '\\bnvme\\b', '\\bssd\\b', '\\bhdd\\b', 'hard drive',
    'pc case', 'mid ?tower', 'full ?tower', '\\bcpu cooler\\b', 'liquid cooling', '\\baio cooler\\b',
    'case fan', 'thermal paste', 'soldering (iron|station)',
  ].join('|'), 'i')],

  /* ---- WHAT THE THING IS beats WHAT IT IS ABOUT ----------------
     Wardrobe and the Vault sit ABOVE the three theme rooms, and this
     is the fix for a real miss rather than a preference.

     "Retro Gaming T-Shirt" filed under the Arcade Floor, because
     `retro gaming` matched before anything looked at `t-shirt`. It is
     a shirt. "Retro gaming" is its subject, the way "Zelda" is a
     hoodie's subject, and a room full of arcade cabinets with a
     t-shirt in it is wrong in the quiet way: it renders, it is
     plausible, and only somebody who wanted a cabinet notices.

     A garment or a collectible noun says what the object physically
     IS, which is a stronger claim than a theme word, so it wins.
     This costs nothing on the theme rooms: an arcade cabinet, a
     mechanical keyboard and a Steam key contain no garment noun. */
  ['wardrobe', new RegExp([
    '\\bt-?shirts?\\b', '\\btees?\\b', '\\bhoodies?\\b', 'sweatshirt', '\\bjackets?\\b',
    '\\bcrewneck\\b', '\\bjoggers?\\b', '\\bsweatpants\\b', '\\bleggings\\b',
    '\\bskirts?\\b', '\\bdress\\b', '\\bblouse\\b', '\\bcardigan\\b', '\\bcosplay\\b',
    '\\bsocks?\\b', '\\bbeanie\\b', '\\bsnapback\\b', '\\bcaps?\\b hat', '\\bhats?\\b',
    'kawaii (dress|skirt|top|outfit)', 'fairy ?kei', '\\bdecora\\b', 'lolita (dress|skirt)',
    '\\bkigurumi\\b', '\\bkimono\\b', '\\bharajuku\\b', '\\bapparel\\b',
    '\\bbackpacks?\\b', '\\btote bags?\\b',
  ].join('|'), 'i')],
  ['vault', new RegExp([
    '\\bfigures?\\b', '\\bfigurines?\\b', '\\bnendoroid\\b', '\\bfigma\\b', '\\bscale figure\\b',
    '\\bstatues?\\b', '\\bbust\\b', '\\bfunko\\b', '\\bpop! ?vinyl\\b', '\\bvinyl figure\\b',
    '\\bplush(ie|ies)?\\b', '\\bplush toy\\b', '\\bblind ?box\\b', '\\bgachapon\\b', '\\bgashapon\\b',
    '\\bmanga\\b', '\\bcomics?\\b', 'graphic novel', '\\bomnibus\\b', '\\btrade paperback\\b',
    '\\bart ?book\\b', '\\bposters?\\b', '\\bwall scroll\\b', '\\btapestry\\b',
    '\\bkeychains?\\b', '\\bkeyrings?\\b', '\\bpin badge\\b', '\\benamel pin\\b',
    '\\bstickers?\\b', '\\bacrylic stand', '\\bstandee\\b', '\\bshikishi\\b',
    '\\btrading figures?\\b', '\\bmodel kit\\b', '\\bgunpla\\b', '\\bgundam\\b',
    'advent calendar', '\\bmystery box\\b',
  ].join('|'), 'i')],
  ['arcade', new RegExp([
    'arcade (cabinet|machine|stick|1up|button|joystick)', '\\bcoin-?op\\b', '\\bcoin door\\b',
    'fight ?stick', 'sanwa', '\\bseimitsu\\b', '\\bjamma\\b',
    'retro (console|handheld|gaming|game)', '\\bretrogam', '\\bemulat',
    '\\bnes\\b', '\\bsnes\\b', '\\bn64\\b', 'game ?boy', '\\bgamecube\\b',
    '\\bgenesis\\b', '\\bmega drive\\b', '\\bdreamcast\\b', '\\bneo ?geo\\b',
    '\\bps1\\b', '\\bps2\\b', '\\bpsp\\b', '\\bnintendo ds\\b',
    'cartridge (cleaner|case|storage)', 'disc (repair|resurfac)', '\\bcrt\\b',
    '\\bpinball\\b', 'light ?gun',
  ].join('|'), 'i')],
  ['battlestation', new RegExp([
    'mechanical keyboard', '\\bkeyboards?\\b', '\\bkeycaps?\\b', '\\bswitches?\\b tester',
    '\\bkeeb\\b', 'artisan cap', 'wrist rest', 'switch (puller|lube)',
    'gaming (mouse|mice)', '\\bmouse ?pad', '\\bmousepad', 'deskmat', 'desk ?mat',
    'mouse (bungee|skates|feet|grip)', 'gaming chair', '\\bergonomic chair\\b',
    'monitor (arm|stand|riser|mount)', 'portable monitor', '\\bmonitors?\\b',
    '\\bprojector', 'ultrawide', 'standing desk', 'desk (pad|shelf|organiser|organizer)',
    '\\bcontrollers?\\b', '\\bgamepad', 'thumb ?grips', 'controller (charger|stand|skin)',
    '\\bwebcam', 'capture card', 'stream ?deck', 'ring light', '\\bboom arm\\b',
    '\\brgb (strip|light|panel)\\b', '\\bled strip\\b',
  ].join('|'), 'i')],
  ['play', new RegExp([
    '\\bsteam key\\b', '\\bgame key\\b', '\\bcd key\\b', '\\bgame code\\b',
    '\\bgift card\\b (steam|xbox|playstation|nintendo)',
    '\\bvideo ?game\\b', '\\bpc game\\b', '\\bps5\\b', '\\bxbox\\b', '\\bswitch game\\b',
    '\\bgame pass\\b', '\\bdlc\\b', '\\bseason pass\\b', '\\bexpansion\\b',
  ].join('|'), 'i')],




]

/**
 * Which room does this product belong in?
 *
 * @param {object} st   the registry entry it came from
 * @param {string} name the product title
 * @param {string} blob everything else worth reading — product_type,
 *                      tags, vendor, a trimmed description. Passed
 *                      separately from `name` because the title is
 *                      the stronger signal and a long description
 *                      full of cross-sell links is the weakest.
 * @returns {string} a room key, or '' meaning do not carry it.
 */
export function classify(st, name, blob = '') {
  const title = String(name == null ? '' : name)
  const rest = String(blob == null ? '' : blob)
  const both = title + ' ' + rest

  /* Refuse first. See the ordering note at the top. */
  if (!title.trim()) return ''
  if (NONPRODUCT.test(both)) return ''
  if (NONPRODUCT_TYPE.test(rest.trim())) return ''
  if (OFF_SCENE.test(both)) return ''

  /* THE TITLE GETS ITS OWN PASS BEFORE THE BLOB DOES, and this is
     not a micro-optimisation. Kawaii Katz found the opposite bug the
     hard way: its safety filter read the product NAME ONLY, so a
     merchant that names by design rather than by garment — "Kawaii
     Maneki Neko", which is a bikini — scored 0 out of 447 on a feed
     full of them. The lesson is that BOTH have to be read, and that
     the title is the more reliable of the two when they disagree. */
  for (const [room, re] of ROOMS) if (re.test(title)) return room
  for (const [room, re] of ROOMS) if (re.test(rest)) return room

  /* Unplaceable. Fall back to the store's own room rather than
     dropping it: a product we cannot read is not evidence of a
     product we should not carry, and returning '' here would
     silently shrink every catalogue by whatever share of its titles
     happen to be terse. */
  return (st && st.room) || ''
}

/** The rooms, in crawl order, with the names a visitor sees. */
export const ROOMS_META = [
  { key:'arcade',        name:'The Arcade Floor', blurb:'Cabinets, sticks, and everything that used to eat quarters.' },
  { key:'play',          name:'Play',             blurb:'Games, keys and the things you actually play.' },
  { key:'tabletop',      name:'The Table',        blurb:'Dice, decks, minis and the four hours you lost to them.' },
  { key:'battlestation', name:'Battlestation',    blurb:'The desk. Boards, mice, screens, chairs.' },
  { key:'workshop',      name:'The Workshop',     blurb:'Parts, printers and the rig you keep almost finishing.' },
  { key:'audio',         name:'Audio',            blurb:'Amps, cans and speakers worth the shelf.' },
  { key:'power',         name:'Power',            blurb:'Chargers, cables, and the brick you keep losing.' },
  { key:'vault',         name:'The Vault',        blurb:'Figures, manga, plush and things kept in the box.' },
  { key:'wardrobe',      name:'The Wardrobe',     blurb:'What you wear to the thing.' },
]

export function roomMeta(key) {
  return ROOMS_META.find(r => r.key === key) || null
}
