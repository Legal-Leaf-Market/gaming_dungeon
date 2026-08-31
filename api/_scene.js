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

/* MATCHED AGAINST THE product_type ALONE, which is why classify()
   takes it as its own argument rather than trusting it to be in the
   blob. It was anchored ^...$ and tested against the whole blob --
   title, variant, tags and description joined together -- so it could
   only ever have fired on a product whose entire text was the single
   word "fee". In other words it never fired at all, on any of the
   three callers, since the day it was written.

   Found on a real merchant: a 3D printing shop whose feed carries 97
   products of type "Warranty" and 3 of type "Service". All 100 were
   being filed in the Workshop, where they would have been the largest
   category in the room -- a shelf of warranties with prices on them.

   `warranty` is HERE and deliberately not in NONPRODUCT, because
   NONPRODUCT reads the description too and half the printers in that
   catalogue mention a warranty in their copy. Refusing on the type is
   exact; refusing on the blob would have hidden real machines. That is
   the broad-regex trap this repo has a standing rule about. */
const NONPRODUCT_TYPE = /^(fee|tax|shipping|insurance|service|service plan|warranty|extended warranty|gift ?cards?)$/i

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

  /* THE WALLS. Placed above the Vault on purpose, and the boundary
     between the two is worth writing down because it is not obvious:

       THE VAULT holds what a FANDOM prints -- posters, wall scrolls,
       tapestries, shikishi. Merch that happens to hang.
       THE WALLS holds the wall itself -- canvas, metal, acrylic,
       wallpaper, murals. The thing that is still there when the
       poster comes down.

     So `posters?`, `wall scroll` and `tapestry` are deliberately NOT
     claimed here; they stay with the Vault where they have always
     been. Taking them would empty a room to fill a new one, which is
     the "do not broaden a pattern to make a room look fuller" rule
     from the top of this file, run in reverse.

     And nothing here is a bare \bwall\b: Power owns `wall charger`
     and `wall adapter`, and a bare word would take both. */
  ['walls', new RegExp([
    'wall art', 'wall d[eé]cor', 'wall hanging', 'wall mural', '\\bmurals?\\b',
    'wallpaper', 'peel[ -]and[ -]stick', 'peel ?& ?stick', 'removable wallpaper',
    'canvas (print|art|wall|set)', '\\bcanvas\\b (wall|art)',
    'metal print', 'acrylic print', 'framed (art|print|canvas)',
    'art print', '\\btriptych\\b', '\\bdiptych\\b', 'oversized (art|print|canvas)',
    'gallery wrap', 'picture frame', '\\bwall clock\\b',
  ].join('|'), 'i')],

  ['audio', new RegExp([
    '\\bamplifiers?\\b',
    /* NOT a bare \\bamp\\b. It was, and it matched two things that are
       not amplifiers: the HTML entity `&amp;` (bounded by non-word
       characters on both sides, so the word boundaries hold) and the
       unit of current -- "requires a 15 amp circuit" is a sentence
       every CNC machine and 3D printer listing eventually contains.
       The entity is fixed at source now (row() cleans the HTML before
       classifying), but the current is not, and both belong in the
       Workshop rather than in Audio. Name the amplifier. */
    '\\b(tube|valve|guitar|bass|headphone|integrated|stereo|power|class[- ]?d)\\s+amps?\\b',
    '\\bdac\\b', 'phono (stage|preamp)', '\\bpreamp',
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
    /* THE CONTROLLER GUARD. `\bcontrollers?\b` was written for the thing
       you hold, and it caught the thing that regulates a current: POWOXI
       names eleven products "... with MPPT Controller" and one "Solar
       Charge Controller", and battlestation is tested before power, so a
       12V solar charge regulator was filed as a gamepad. Same family as
       \bamp\b matching the unit of current. Guard the word by what comes
       before it rather than dropping it: "Xbox Controller" still lands. */
    '(?<!\\b(?:charge|charging|solar|mppt|pwm|voltage|motor|temperature|fan|speed|led|light|lighting)\\s)controllers?\\b',
    '\\bgamepad', 'thumb ?grips', 'controller (charger|stand|skin)',
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
 * @param {string} [ptype]  the merchant's own product_type, ALONE.
 *                      Passed separately because the non-product test
 *                      is anchored and cannot work against a blob.
 * @returns {string} a room key, or '' meaning do not carry it.
 */
export function classify(st, name, blob = '', ptype = '') {
  const title = String(name == null ? '' : name)
  const rest = String(blob == null ? '' : blob)
  const type = String(ptype == null ? '' : ptype).trim()
  const both = title + ' ' + rest

  /* Refuse first. See the ordering note at the top. */
  if (!title.trim()) return ''
  if (NONPRODUCT.test(both)) return ''
  /* The type, on its own. Callers that have it pass it; the ones that
     do not fall back to the blob, which is what every caller was
     effectively doing before and is why this test never fired. */
  if (NONPRODUCT_TYPE.test(type || rest.trim())) return ''
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
  /* ---- ROOMS ARE REALMS -------------------------------------
     Each room flies one of the twelve major realms from
     `src/shared/Realms.luau` in Legal-Leaf-Market/roblox-game:
     its band colour and its epithet, both verbatim. The mapping is
     by meaning rather than by list order, and each one is a claim
     you can argue with:

       Workshop      Body Tempering   a printer IS the first furnace
       Play          Qi Gathering     a library fills breath by breath
       The Table     Foundation Est.  what is built on stone endures
       Battlestation Core Formation   the desk is where you hold centre
       Arcade Floor  Golden Core      a sun the size of a seed, in a cabinet
       The Vault     Nascent Soul     a figure IS a self outside the self
       The Wardrobe  Soul Transform.  the river forgets it was rain
       Power         Void Refinement  a charged cell is stored emptiness
       Audio         Dao Integration  sound is the way walking with you

     Realms 10 to 12 -- Tribulation Transcendence, Immortal
     Ascension, True Immortal -- are DELIBERATELY UNSPENT. They are
     the top of the game's ladder and there is no room here that
     earns them yet. Leave them for rooms that do not exist, rather
     than promoting a shelf of cables to immortality. */
  { key:'arcade',        name:'The Arcade Floor', realm:5,  band:'#e8be50',
    epithet:'A sun the size of a seed.',
    blurb:'Cabinets, sticks, and everything that used to eat quarters.' },
  { key:'play',          name:'Play',             realm:2,  band:'#78aadc',
    epithet:'Breath by breath, the sea fills.',
    blurb:'Games, keys and the things you actually play.' },
  { key:'tabletop',      name:'The Table',        realm:3,  band:'#60b496',
    epithet:'What is built on stone endures.',
    blurb:'Dice, decks, minis and the four hours you lost to them.' },
  { key:'battlestation', name:'Battlestation',    realm:4,  band:'#5896eb',
    epithet:'A whirlpool learns to hold its center.',
    blurb:'The desk. Boards, mice, screens, chairs.' },
  { key:'workshop',      name:'The Workshop',     realm:1,  band:'#9b948a',
    epithet:'Flesh is the first furnace.',
    blurb:'Parts, printers and the rig you keep almost finishing.' },
  { key:'audio',         name:'Audio',            realm:9,  band:'#8cdcdc',
    epithet:'The way walks with you now.',
    blurb:'Amps, cans and speakers worth the shelf.' },
  { key:'power',         name:'Power',            realm:8,  band:'#6e6ea0',
    epithet:'Emptiness, polished until it shines.',
    blurb:'Chargers, cables, and the brick you keep losing.' },
  { key:'vault',         name:'The Vault',        realm:6,  band:'#be82eb',
    epithet:'The self that steps outside the self.',
    blurb:'Figures, manga, plush and things kept in the box.' },
  { key:'wardrobe',      name:'The Wardrobe',     realm:7,  band:'#e278b4',
    epithet:'The river forgets it was rain.',
    blurb:'What you wear to the thing.' },
  /* REALM 10 IS SPENT, AND HERE IS THE CLAIM.

     The note above says to leave 10 to 12 for rooms that earn them
     rather than promoting a shelf of cables to immortality. This is
     the first room that is not a shelf: every other room here sells
     something you put IN the room, and this one sells the room. A
     sixty-inch canvas over the desk outlasts three generations of the
     gear beneath it, and "The heavens themselves object" is what a
     piece that size does to a wall.

     Band and epithet verbatim from Realms.luau, like the other nine:
     RGB(240,240,250), which is gallery white and the only near-white
     band on the map. */
  { key:'walls',         name:'The Walls',        realm:10, band:'#f0f0fa',
    epithet:'The heavens themselves object.',
    blurb:'Canvas, wallpaper and the things that make it a room.' },
]

/* ---- ITEM RARITY -------------------------------------------
   Items.luau grades every item common | fine | rare | precious, and
   a price-sorted shelf is a rarity ladder whether or not anybody
   says so out loud. So the shelf says so.

   The thresholds are ours, not the game's -- the game grades by
   what a thing IS and we only know what it costs -- and they are
   set against this catalogue's actual spread ($1 to $62,895), not
   guessed. Anything unpriced is `common` rather than blank: a card
   with no grade at all reads as a bug. */
export const RARITY = [
  { key:'precious', from: 500 },
  { key:'rare',     from: 100 },
  { key:'fine',     from: 25 },
  { key:'common',   from: 0 },
]

export function rarityOf(price) {
  const n = Number(price)
  if (!isFinite(n) || n <= 0) return 'common'
  for (const r of RARITY) if (n >= r.from) return r.key
  return 'common'
}


export function roomMeta(key) {
  return ROOMS_META.find(r => r.key === key) || null
}
