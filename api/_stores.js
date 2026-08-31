/* ============================================================
   THE MERCHANT REGISTRY — the only file you routinely edit.
   ------------------------------------------------------------
   Underscore-prefixed so Vercel does not publish it as a function.
   That is load-bearing: this file holds commission rates, cookie
   windows and rejection reasons, which are our paperwork and nobody
   else's business. `publicStores()` in products.js whitelists what
   actually reaches a browser.

   Three lists live here, and the second and third are as valuable as
   the first:

     STORES     merchants we can reach and intend to stock.
     PROSPECTS  merchants worth having that have no self-serve
                programme. Kept so the outreach list is a file rather
                than somebody's memory.
     REJECTED   merchants that are not going on the shelf, WITH
                REASONS, so nobody rediscovers them in six months and
                signs up. BOTH DIRECTIONS live here: ones we turned
                down, and ones that turned US down. The second kind
                is easier to lose, because the row reads as a good
                merchant right up until you remember the reply.

   The last one is a Kawaii Katz pattern and it earns its place: the
   four highest-commission gaming rows in the entire 22,290-merchant
   source file are all in REJECTED. Sorting that file by commission
   descending is exactly how somebody signs up to all four.

   FIELD REFERENCE
   ---------------
     key        our slug. Stable forever: it keys captures, click logs
                and the /shop/:key spotlight URL.
     name       what a shopper sees.
     room       which room of the dungeon it stocks by default.
                `classify()` in _scene.js routes each PRODUCT by its
                own text, so a store can span rooms; this is only the
                fallback for a product whose text says nothing.
     domain     the storefront host. No scheme, no trailing slash.
     platform   shopify | woo | bigcommerce | magento | unknown
     ref        THE GOAFFPRO AFFILIATE CODE, appended as `?ref=`.
                Empty means UNATTRIBUTED: the link still works, the
                shopper still buys, and we are paid nothing. That is
                a fine state to ship in — see the note below — but it
                must never be a SILENT state, so `?debug` shouts about
                every empty one in capitals.
     rate       headline commission as published at signup.
     cookie     attribution window in days. Sorted on BEFORE rate,
                everywhere. 82 of the merchants in the source file
                give 7 days or less, which is survivable for an
                impulse buy and useless for the $300 chair anybody
                actually researches.
     tier       1 apply first | 2 worth it | 3 only if the niche fits.
     pending    TRUE UNTIL SOMEBODY HAS READ THE FEED. Always.
     network    '' for GoAffPro/direct, or 'awin' | 'cj' | 'impact'.
                Anything set here means the destination is WRAPPED
                rather than having a parameter appended, and `ref` is
                left empty. affTemplate() in products.js owns each
                shape.
     awinmid    the AWIN advertiser id, with network:'awin'. It is the
                `awinmid` in any link AWIN's own generator produces,
                and it is on the advertiser's profile page next to
                their name. Pairs with AWIN_PUBLISHER above.
     amazon     some merchants also issue an Amazon Attribution link.
                Stored, deliberately NOT used to build product links.
     note       anything the numbers do not say.

   ============================================================
   AN EMPTY `ref` IS NOT A REASON TO LEAVE A MERCHANT OUT
   ------------------------------------------------------------
   Roughly half the codes below are filled and half are empty, and
   that is the intended state rather than a half-finished job. The
   owner's instruction was explicit: build the right site, not the
   site we happen to be approved for today. A merchant that belongs
   in the dungeon goes in the registry now; the code gets pasted in
   when the application clears, which is a one-line edit that needs
   no other change anywhere.

   The failure this guards against is the opposite one, and Kawaii
   Katz already paid for it: two sock vendors shipped 466 products
   that earn nothing to this day because nobody noticed the tracking
   value was empty. Empty is fine. Empty and unnoticed is not. That
   is the entire job of the capitals in `?debug`.

   ============================================================
   `pending: true` IS THE DEFAULT, AND THE ORDER IS DELIBERATELY
   THE REVERSE OF THE THREE SISTER SITES
   ------------------------------------------------------------
   EVERY store below ships pending. `getCatalog()` skips a pending
   store, logs that it skipped it, and `?debug` lists it. Nothing
   reaches a room until a human has looked at that merchant's actual
   catalogue.

   On Herbal-Leaf and Kawaii Katz the order was: register the vendor,
   point the scraper at it, ship, and find out afterwards what came
   back. Kawaii Katz's own guide records the bill — an intake of
   vendors "went onto the shelf unread", Tokyo Tiger returned nothing
   at all and still does, and the sock vendors above.

   So here the capture comes FIRST. Open the merchant in your own
   browser, run the collector bookmarklet from /collect, and the
   capture lands in the capture store. `/api/capture?report` then
   tells you what they actually stock, at what prices, under which
   product_types. You write `include` / `roomMap` from THAT, and only
   then clear `pending`.

   CLEARING `pending` NEEDS A CAPTURE ON FILE. Not a guess, not a
   homepage glance. The gate is enforced in _capture.js rather than
   trusted to habit, because habit is what the sister sites had.

   Note what is NOT in that gate: a filled `ref`. Publishing an
   unattributed merchant is a decision the owner is entitled to make
   and has made. Publishing a merchant whose catalogue nobody has
   read is not a decision, it is a guess with a shopper on the other
   end of it.

   ============================================================
   NEVER GET-REQUEST A LINK CARRYING `?ref=`
   ------------------------------------------------------------
   Every code below is live. A GET on a `?ref=` URL registers a real
   click in GoAffPro and pollutes the owner's own conversion stats
   with our own traffic, which is the one class of bug that corrupts
   the very evidence you would use to find it. `get()` in products.js
   refuses any URL matching TRACKING_PARAM, and `ref` is the first
   alternative in that pattern. Do not route around it. Inspect link
   strings; do not follow them.
   ============================================================ */

/* ============================================================
   THE `platform` FIELD WAS GUESSED FOR THE WHOLE LIST, and three
   for three of the merchants anybody has actually captured were
   wrong. customgamingchair, powoxi and bbkeyboard were all
   registered as shopify and all three answered on the WooCommerce
   Store API.

   It matters because it fails SILENTLY IN THE WORST DIRECTION: a
   Shopify strategy pointed at a WooCommerce shop 404s on every
   endpoint, so the store ships ZERO products while reading as
   published. customgamingchair did exactly that on its first live
   publish and nothing complained.

   51 entries still say shopify and 3 have been checked. Treat the
   field as an unverified guess until a capture agrees with it, and
   correct it from the capture, never the other way round. The
   capture has been right every time.
   ============================================================ */

/* ============================================================
   THE AWIN PUBLISHER ID

   The `awinaffid` in every link AWIN generates for this site. NOT a
   secret — it rides in the URL of every outbound click — so it lives
   in config rather than an env var, the same call the sister sites
   made.

   It is per SITE, not per merchant: Kawaii Katz is 3022399 and Herbal
   Leaf is 3004653. Pasting another site's id here would send this
   site's commission to that site's account and nothing would look
   wrong from either end.

   Emptied, every AWIN store falls back to a plain link to the shop:
   the page works, the shopper arrives, and the click earns nothing.
   `?debug` shouts about it, the same as an empty GoAffPro `ref`.
   ============================================================ */
export const AWIN_PUBLISHER = '3064745'

/* IT WAS 3064967 FOR ONE COMMIT, AND THE CORRECTION IS WORTH KEEPING.
   The first AWIN merchant's profile was pasted in as plain text and
   its header line read "Verda Studio (3064967)". The second arrived
   as the page's real markup, and 3064745 appears in roughly twenty
   structured URLs on it -- the dashboard, the account page, every
   merchant-profile link, the commission manager. Twenty links from
   the UI beat one transcribed line.

   Nothing had shipped a click yet, because every AWIN store here is
   still `pending`. Had one been live, this is precisely the failure
   the block above describes: the shopper arrives, the sale completes,
   and the commission lands in an account that is not ours. Nothing
   errors, and the conversion report shows the click either way. */

export const STORES = [
  /* ==========================================================
     THE ARCADE FLOOR — retro, cabinets, coin-op.
     ----------------------------------------------------------
     THIS ROOM IS THE THESIS AND IT IS THE THINNEST ROOM WE HAVE.
     That contradiction is worth stating plainly rather than
     discovering later: the scene research mined 22,290 GoAffPro
     merchants and found SEVEN in retro and arcade. Four are below.
     One of them pays 1%.

     The Disc Replay half of this site cannot be built out of
     GoAffPro, because the used and collector market is eBay, Mercari
     and independent shops rather than affiliate networks. The honest
     fixes are direct outreach and original content, not a looser
     filter. Do not widen `include` here to make the room look fuller;
     a retro room padded with generic gaming stock is worse than a
     small real one.
     ========================================================== */
  { key:'goretrogame', name:'GoRetrogame', room:'arcade', domain:'goretrogame.com',
    platform:'shopify', ref:'uqburdzv', rate:'10%', cookie:45, tier:1, pending:true,
    note:'The only one of the seven retro merchants with a window worth having.' },

  { key:'mixboxarcade', name:'Mixbox Arcade', room:'arcade', domain:'www.mixboxarcade.com',
    platform:'shopify', ref:'', rate:'4%', cookie:45, tier:1, pending:true,
    note:'Arcade sticks and fight controllers. Thin rate, exactly the right room.' },

  { key:'creativearcades', name:'Creative Arcades', room:'arcade', domain:'creative-arcades.com',
    platform:'shopify', ref:'', rate:'1%', cookie:30, tier:1, pending:false,
    note:'Sells ACTUAL ARCADE CABINETS. 1% is nearly nothing, and they are here for the ' +
         'content rather than the commission: a site with an arcade in it should be able ' +
         'to point at a real cabinet. On a $2,000 cabinet 1% is still $20.' },

  { key:'gamecarepro', name:'Game Care Pro', room:'arcade', domain:'gamecarepro.com',
    platform:'shopify', ref:'', rate:'20%', cookie:7, tier:2, pending:false,
    note:'Cleaning and restoration for discs and cartridges. Genuinely a retro-collector need.' },

  /* ==========================================================
     PLAY — games, keys, gaming general.
     ========================================================== */
  { key:'waffleconegames', name:'Waffle Cone Games', room:'play', domain:'www.waffleconegames.com',
    platform:'shopify', ref:'', rate:'38%', cookie:180, tier:1, pending:true,
    note:'Highest rate on the sheet AND a 180-day window, which is an unusual pair. ' +
         'A rate that high usually means the list price is fiction, so read the capture ' +
         'against their real checkout before believing it.' },

  { key:'gamesburner', name:'Games Burner', room:'play', domain:'gamesburner.com',
    platform:'shopify', ref:'zlpvcbfi', rate:'10%', cookie:45, tier:1, pending:true },

  { key:'krazedgaming', name:'Krazed Gaming', room:'play', domain:'krazedgaming.com',
    platform:'shopify', ref:'ctyumzte', rate:'15%', cookie:30, tier:1, pending:true },

  { key:'awkwardgames', name:'Awkward Games', room:'play', domain:'www.awkwardgames.com',
    platform:'shopify', ref:'ykxibzlr', rate:'$10 flat', cookie:30, tier:1, 
    note:'FLAT $10 per sale, not a percentage. The only one on the sheet like that, so any ' +
         'percentage-shaped earnings estimate is wrong for this store specifically.' },

  { key:'gamersansfrontieres', name:'Gamers Sans Frontieres', room:'play', domain:'gamersansfrontieres.com',
    platform:'shopify', ref:'', rate:'10%', cookie:30, tier:1, pending:true },

  { key:'trtlgaming', name:'TRTL GAMING', room:'play', domain:'www.trtlgaming.com',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true },

  /* ---- ROUND THREE, 31 Aug ------------------------------------- */
  { key:'redragon', name:'Redragon', room:'play', domain:'redragonshop.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 76584 when it clears. ' +
         'Keyboards, mice and headsets under a name gamers recognise. 90-day window, 93.2% approval, feed. The 0.06 EPC is the network average, not a verdict.' },

  { key:'moddedzone', name:'ModdedZone', room:'play', domain:'moddedzone.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 89749 when it clears. ' +
         'Custom modded controllers, built to order. 90 days, 100% approval, and a product nothing else on the shelf sells.' },

  { key:'gigatech', name:'Gigatech Gaming', room:'play', domain:'gigatechgaming.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:90, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 98721 when it clears. ' +
         'Prebuilt gaming PCs and complete setups. High basket, 90-day window, and they decline four applications in ten.' },

  { key:'onexplayer', name:'OneXPlayer', room:'play', domain:'onexplayer.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 97359 when it clears. ' +
         'Handheld gaming PCs. A category that did not exist when these rooms were drawn.' },

  { key:'geekshare', name:'GeekShare', room:'play', domain:'geekshare.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 124946 when it clears. ' +
         'Nintendo Switch accessories, cheap and cute. Reads as Kawaii Katz stock as much as Verda stock.' },

  { key:'tomtoc', name:'tomtoc', room:'play', domain:'www.tomtoc.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 96147 when it clears. ' +
         'Cases and bags for handhelds and laptops. Accessory attach, which is what this room sells between releases.' },

  { key:'surfacegaming', name:'Surface Gaming', room:'battlestation', domain:'surface-gaming.com',
    platform:'shopify', ref:'', rate:'20%', cookie:7, tier:2, pending:false },

  /* ==========================================================
     TABLETOP — dice, TCG, miniatures.
     ----------------------------------------------------------
     Small room, disproportionately good customers: tabletop buyers
     are the most researched and highest-repeat in the whole category,
     which is exactly the shopper a 7-day cookie serves worst.
     ========================================================== */
  { key:'frontlinegaming', name:'Frontline Gaming', room:'tabletop', domain:'store.frontlinegaming.org',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true,
    note:'A real miniatures and Warhammer store, not a dropshipper. The best name in this room.' },

  { key:'criticaldice', name:'Critical Dice', room:'tabletop', domain:'thecriticaldice.com',
    platform:'shopify', ref:'', rate:'10%', cookie:30, tier:1, pending:true },

  { key:'rpgtabletops', name:'RPG Tabletops', room:'tabletop', domain:'rpgtabletops.com',
    platform:'shopify', ref:'', rate:'20%', cookie:7, tier:2,  },

  { key:'tabletopitemshop', name:'Tabletop Itemshop', room:'tabletop', domain:'tabletop-itemshop.myshopify.com',
    platform:'shopify', ref:'yrsdhbqg', rate:'15%', cookie:7, tier:3, pending:true },

  /* ---- ROUND THREE, 31 Aug ------------------------------------- */
  { key:'theop', name:'The Op / Usaopoly', room:'tabletop', domain:'theop.games',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:60, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 93879 when it clears. ' +
         'AN ACTUAL BOARD GAME PUBLISHER, with a feed. This room had four merchants and none of them made the games.' },

  { key:'easyrollerdice', name:'Easy Roller Dice', room:'tabletop', domain:'www.easyrollerdice.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:365, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 89093 when it clears. ' +
         'A 365-DAY COOKIE on dice, the longest window in the entire intake, sitting on the cheapest product in it. New programme, no trading data.' },

  /* ==========================================================
     BATTLESTATION — the desk. Chairs, boards, mice, headsets, screens.
     ----------------------------------------------------------
     THE AOV ROOM, and the one most worth getting right. A $300 chair
     at 8-10% is $24-30, which beats thirty game-key sales. It is the
     same lesson the hemp side learned twice: the money is in the
     expensive device, not the consumable.

     It is also where short cookies hurt most. Nobody buys a $300
     chair the day they first read about it, so a 7-day window on this
     room is close to a donation.
     ========================================================== */
  { key:'pulsar', name:'Pulsar Gaming Gears', room:'battlestation', domain:'www.pulsar.gg',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true,
    note:'The best BRAND on the whole list: a genuine esports mouse maker with a real ' +
         'reputation. 5% is thin, but a page about the X2 gets read by people who came to ' +
         'buy one, and it lends the site credibility no anime dropshipper can.' },

  { key:'ficmax', name:'Ficmax Gaming', room:'battlestation', domain:'ficmaxgaming.myshopify.com',
    platform:'shopify', ref:'wnhsmhuw', rate:'8%', cookie:60, tier:1, pending:true,
    note:'Gaming chairs. Best rate-plus-cookie combination on the AOV room.' },

  { key:'customgamingchair', name:'Custom Gaming Chair', room:'battlestation', domain:'www.customgamingchair.com',
    platform:'woocommerce', ref:'irarpdcz', rate:'10%', cookie:30, tier:1,  },

  { key:'odingaming', name:'Odin Gaming', room:'battlestation', domain:'www.odinpc.com',
    platform:'shopify', ref:'', rate:'10%', cookie:30, tier:1, pending:true },

  { key:'weikav', name:'Weikav Keyboard', room:'battlestation', domain:'weikav.com',
    platform:'woocommerce', ref:'fimmfdau', rate:'8%', cookie:30, tier:1, pending:false,
    note:'A real mechanical keyboard brand.' },

  { key:'pkkeyboards', name:'pkkeyboards', room:'battlestation', domain:'pkkeyboards.com',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:false },

  { key:'onikuma', name:'Onikuma Gaming', room:'battlestation', domain:'www.onikuma.com',
    platform:'shopify', ref:'', rate:'20%', cookie:7, tier:1, pending:true,
    note:'Genuine gaming headsets. 20% is the best real rate on the list, and the 7-day ' +
         'cookie caps what it can ever earn.' },

  /* WOOCOMMERCE. Third registry/capture platform disagreement in a row
     and the third correction; see the note at the top of this file. */
  { key:'bbkeyboard', name:'BB Keyboard', room:'battlestation', domain:'www.bbkeyboard.com',
    platform:'woocommerce', ref:'', rate:'15%', cookie:7, tier:1, pending:false },

  { key:'atkstore', name:'ATK Gaming Gear', room:'battlestation', domain:'www.atk.store',
    platform:'shopify', ref:'ukztaetu', rate:'5%', cookie:14, tier:3, pending:true },

  { key:'animekeycaps', name:'Anime Keycaps', room:'battlestation', domain:'animekeycaps.com',
    platform:'shopify', ref:'', rate:'15%', cookie:7, tier:2, pending:true,
    note:'PART OF THE ANIME DROPSHIP CLUSTER — read the warning above the Vault room. ' +
         'Kept because keycaps have genuine search demand and almost no serious coverage. ' +
         'One of exactly two the research says to take from those twenty domains.' },

  { key:'animemousepad', name:'Anime Mousepads', room:'battlestation', domain:'anime-mousepad.com',
    platform:'shopify', ref:'', rate:'15%', cookie:7, tier:2, pending:false,
    note:'The other one of the two. Same cluster, same caveat.' },

  /* ---- screens; both Portable Monitor domains, and why both ----
     The sheet flagged these as "same operator, pick one". They ARE
     the same operator, but they issued TWO DIFFERENT CODES, one per
     domain, so they are two programmes and dropping one drops its
     earnings rather than tidying a duplicate.

     What must not happen is both appearing in the room with the same
     stock under two names. That is the anime-cluster failure and it
     is what makes a comparison site worthless. So: both registered,
     both attributed, and AT MOST ONE PUBLISHED. Which one is a
     question for the captures — whichever has the fuller catalogue —
     and not a question for this file. */
  { key:'portablemonitor', name:'The Portable Monitor', room:'battlestation', domain:'the-portable-monitor.co',
    platform:'shopify', ref:'teegfnou', rate:'8%', cookie:300, tier:1, pending:true,
    amazon:'https://amazon.com/?aa_adgroupid=teegfnou&aa_campaignid=goaffpro&aa_creativeid=&maas=maas_adg_api_589602498275955881_static_12_157&ref=teegfnou&ref_=aa_maas',
    note:'300-DAY cookie, the second longest in the entire source file.' },

  { key:'bestportablemonitor', name:'Best Portable Monitor', room:'battlestation', domain:'best-portable-monitor.com',
    platform:'shopify', ref:'euxmayas', rate:'8%', cookie:300, tier:1, pending:true,
    amazon:'https://amazon.com/?aa_adgroupid=euxmayas&aa_campaignid=goaffpro&aa_creativeid=&maas=maas_adg_api_589602498275955881_static_12_157&ref=euxmayas&ref_=aa_maas',
    note:'Same operator as the-portable-monitor.co, separate programme, separate code. ' +
         'Publish at most ONE of the two.' },

  { key:'portableprojector', name:'Portable Projector', room:'battlestation', domain:'portableprojector.site',
    platform:'unknown', ref:'knyfihdh', rate:'25%', cookie:7, tier:3, pending:true,
    note:'NOT a normal Shopify storefront. Their own affiliate link points at ' +
         '/goodsDetails?hyId=...&jobsProductId=..., which is a hosted-marketplace shape, ' +
         'so there is probably no products.json and possibly no stable product URLs. ' +
         'Establish the platform from a capture before writing any ingest for it.' },

  /* ==========================================================
     WORKSHOP — PC parts, 3D printing, maker tools.
     ----------------------------------------------------------
     Two genuine brands and the longest cookies on the site outside
     collectibles, which is the right combination for a purchase
     people research for weeks.
     ========================================================== */
  { key:'longer3d', name:'LONGER 3D', room:'workshop', domain:'www.longer3d.com',
    platform:'shopify', ref:'', rate:'5%', cookie:180, tier:1, pending:false,
    note:'Major 3D-printer brand. On a $300 printer the 180-day window is worth more than ' +
         'double the rate would be at 30 days.' },

  { key:'miamipcdepot', name:'Miami PC Depot', room:'workshop', domain:'www.miamipcdepot.com',
    platform:'shopify', ref:'', rate:'10%', cookie:120, tier:1, pending:true,
    note:'120-day cookie on PC parts. Best rate-and-window pair in the room.' },

  { key:'anycubic', name:'ANYCUBIC 3D Printing', room:'workshop', domain:'store.anycubic.com',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true,
    note:'Major 3D-printer brand, and the best name recognition in this room.' },

  { key:'3dprinternational', name:'3D Printernational', room:'workshop', domain:'www.3dprinternational.com',
    platform:'shopify', ref:'hqvplmpo', rate:'5%', cookie:30, tier:1,  },

  /* ---- ROUND THREE, 31 Aug: 3D printing is where AWIN is deep --
     Seven of them, against four merchants in the room before. The
     printers are the headline and the filament is the business:
     eSUN, Chitu and BIQU are bought again every month. */
  { key:'foxalien', name:'FoxAlien', room:'workshop', domain:'www.foxalien.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:15, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 59247 when it clears. ' +
         'CNC machines and laser engravers. EPC 4.09, 98.8% approval, feed. Short 15-day window against the best earnings in the room.' },

  { key:'biqu', name:'BIQU', room:'workshop', domain:'biqu3d.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 95665 when it clears. ' +
         '3D printer parts, boards and upgrades. 98.9% approval, EPC 1.03, feed. The consumable half of the hobby.' },

  { key:'crealityfalcon', name:'Creality Falcon', room:'workshop', domain:'www.crealityfalcon.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:60, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 69964 when it clears. ' +
         'Laser engravers from the biggest name in consumer 3D printing. 60-day window, EPC 2.01, feed, and they decline a third of applications.' },

  { key:'bambulab', name:'Bambu Lab', room:'workshop', domain:'bambulab.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:15, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 46345 when it clears. ' +
         'The desktop 3D printer people actually name right now. 99.8% approval and a feed; the 15-day cookie is the only thing wrong with it.' },

  { key:'elegoo', name:'ELEGOO', room:'workshop', domain:'www.elegoo.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 61127 when it clears. ' +
         'Resin printers, the other half of the hobby. 93.2% approval, EPC 0.83, no feed.' },

  { key:'chitu', name:'Chitu Systems', room:'workshop', domain:'www.chitusystems.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 120083 when it clears. ' +
         'Resin printing accessories and supplies. Pure consumables, which is the repeat purchase this room lacks. Feed.' },

  { key:'esun', name:'eSUN', room:'workshop', domain:'www.esun3d.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 99267 when it clears. ' +
         'Filament. Bought again every month, which is why it is here at all.' },

  /* ==========================================================
     AUDIO.
     ========================================================== */
  { key:'slickaudio', name:'Slick Audio', room:'audio', domain:'store.slickaudio.com',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true },

  { key:'noamaudio', name:'NOAM Audio', room:'audio', domain:'www.noamaudio.com',
    platform:'shopify', ref:'', rate:'5%', cookie:15, tier:2, pending:true },

  /* ==========================================================
     POWER — charging, cables, solar.
     ========================================================== */
  /* WOOCOMMERCE, not Shopify. The registry said shopify and the
     capture reached this shop through the Woo Store API; that is the
     second time the two have disagreed and the first cost Custom
     Gaming Chair a publish that shipped zero products while reading
     as live. HELD BACK ON PURPOSE beyond that: see the review file. */
  { key:'powoxi', name:'POWOXI Solar Charger', room:'power', domain:'powoxi.com',
    platform:'woocommerce', ref:'tzexwwsr', rate:'8%', cookie:30, tier:1, pending:true },

  { key:'ohrija', name:'ohrija charger', room:'power', domain:'ohrija.com',
    platform:'woocommerce', ref:'auoqghqm', rate:'3%', cookie:30, tier:1, pending:true },

  { key:'cablepro', name:'Cable Pro', room:'power', domain:'shopcablepro.com',
    platform:'shopify', ref:'vamnsdsg', rate:'10%', cookie:7, tier:3, pending:true },

  /* ==========================================================
     THE VAULT — figures, manga, comics, plushies, pop culture.
     ----------------------------------------------------------
     READ THIS BEFORE ADDING ANYTHING TO THIS ROOM.

     Twenty domains in the source file follow one pattern:
     animekeycaps.com, anime-mousepad.com, animestatue.com,
     animeswimsuit.com, animebed.com, animebackpack.com,
     animekimono.com, animepuzzle.com, animejacket.com,
     otakutreat.shop, otaku4goods.com and the rest. Nearly all at 15%
     on a 7-day cookie, all named the same way.

     THAT IS ONE OPERATOR RUNNING A DROPSHIP NETWORK, NOT TWENTY
     MERCHANTS. The catalogues are near-certainly the same stock.
     Listing a dozen of them republishes the same products a dozen
     times under different names, which is exactly what makes a
     comparison site worthless. THREE are taken, deliberately, on
     search demand: keycaps and mousepads (in Battlestation) and
     statues here. Treat the rest as one merchant we already have.

     The tell to look for in a capture is identical titles and
     identical image URLs across two domains. When you find it, drop
     one. Do not keep both because both are approved.
     ========================================================== */
  { key:'maximuscollectibles', name:'Maximus Collectibles', room:'vault', domain:'maximuscollectibles.myshopify.com',
    platform:'shopify', ref:'', rate:'5%', cookie:365, tier:1, pending:false,
    note:'365-DAY cookie, the longest in the entire file. 5% over a year-long window is ' +
         'genuinely unusual and worth taking on those terms alone.' },

  { key:'animeadventbox', name:'Anime Advent Calendar Gift Box Store', room:'vault', domain:'animeadventbox.com',
    platform:'shopify', ref:'jqlxgpnm', rate:'20%', cookie:30, tier:1, pending:true },

  { key:'otakuinspired', name:'Exclusive Anime Advent Calendar Shop', room:'vault', domain:'otakuinspired.com',
    platform:'shopify', ref:'', rate:'15%', cookie:30, tier:1, pending:true,
    note:'Same product concept as animeadventbox and a strong candidate for the same ' +
         'operator. Compare the two captures before publishing both.' },

  { key:'animestatue', name:'Anime Statue', room:'vault', domain:'animestatue.com',
    platform:'shopify', ref:'', rate:'15%', cookie:30, tier:2, pending:true,
    note:'Anime dropship cluster, taken on search demand. The third and last of the three.' },

  { key:'gearotaku', name:'gearotaku', room:'vault', domain:'www.gearotaku.com',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true },

  { key:'mazzcomics', name:'Mazz Comics', room:'vault', domain:'www.mazzcomics.com',
    platform:'shopify', ref:'', rate:'5%', cookie:30, tier:1, pending:true },

  { key:'fairysgifts', name:'Fairys Gifts and Collectibles', room:'vault', domain:'fairysgiftsandcollectibles.com',
    platform:'shopify', ref:'', rate:'12%', cookie:15, tier:2, pending:true },

  { key:'coveralphacomics', name:'Cover Alpha Comics', room:'vault', domain:'coveralphacomics.com',
    platform:'shopify', ref:'', rate:'20%', cookie:7, tier:3, pending:true },

  { key:'minecraftplushies', name:'Minecraft Plushies', room:'vault', domain:'minecraftplushies.com',
    platform:'shopify', ref:'wgwocjiq', rate:'15%', cookie:7, tier:3, pending:true,
    note:'TRADES ON A LICENSED NAME IT ALMOST CERTAINLY DOES NOT HOLD. Read the capture for ' +
         'counterfeit tells before publishing: a rights-holder complaint lands on the site ' +
         'that listed the goods as well as the shop that sold them, and Mojang enforce.' },

  { key:'distromanga', name:'DISTRO MANGA', room:'vault', domain:'distromanga.com',
    platform:'shopify', ref:'jtndvntg', rate:'10%', cookie:7, tier:3, pending:true },

  /* ---- ROUND THREE, 31 Aug ------------------------------------- */
  { key:'tortugaforma', name:'Tortuga Forma', room:'vault', domain:'tortugaforma.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:60, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 99037 when it clears. ' +
         'Designed collectible objects rather than licensed ones. 60 days, 100% approval, EPC 1.20.' },

  { key:'denuonovo', name:'Denuo Novo', room:'vault', domain:'denuonovo.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:7, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 47521 when it clears. ' +
         'Licensed costumes and props, Star Wars among them. EPC 1.62 against a SEVEN-DAY window, the shortest in the intake, which is what puts a good merchant in tier 3.' },

  { key:'nerdbugs', name:'Nerdbugs', room:'vault', domain:'nerdbugs.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 56891 when it clears. ' +
         'Plush organs and anatomy toys. Odd, specific, has a feed, EPC 0.12.' },

  { key:'pintrill', name:'PINTRILL', room:'vault', domain:'pintrill.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:45, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 96003 when it clears. ' +
         'Enamel pins, licensed heavily. Feed, and an EPC of 0.04: pins are an impulse add rather than a destination.' },

  /* ==========================================================
     WARDROBE — apparel, kawaii, J-fashion.
     ----------------------------------------------------------
     THIS ROOM IS THE LITTLE SISTER'S TERRITORY AND THE OVERLAP IS
     DELIBERATE. Kawaii Katz already aggregates kawaii across eight
     Shopify vendors and it is the kid-friendly, gift-shaped one.
     Verda Studio is the grown-up sibling.

     The two run SEPARATE registries and cross-link hard rather than
     sharing code, which was a decision rather than an accident:
     Kawaii Katz is Next.js and this engine is zero-dep Node, so one
     shared registry means a cross-framework package nobody has built.
     Until somebody does, the boundary is editorial, and it is this —
     a kawaii item here carries a rail to Kawaii Katz, and a merchant
     that reads as gift shop rather than scene belongs over there.

     One thing that does NOT transfer from Kawaii Katz: its
     CUT_PHRASES kid-safety filter. That filter exists because that
     site is for kids and this one is not, and copying it here would
     delete most of a fairy-kei wardrobe for no reason that applies.
     ========================================================== */
  { key:'kawaiifashionstore', name:'Kawaii Fashion Store', room:'wardrobe', domain:'kawaiifashionstore.com',
    platform:'shopify', ref:'vuhxzsqc', rate:'15%', cookie:60, tier:1, pending:true,
    note:'Best rate-plus-cookie in the kawaii niche.' },

  { key:'cozykawaii', name:'Cozy Kawaii LLC', room:'wardrobe', domain:'cozykawaii.shop',
    platform:'shopify', ref:'sbktsccp', rate:'12%', cookie:30, tier:1, pending:true },

  { key:'bestofkawaii', name:'BestofKawaii', room:'wardrobe', domain:'bestofkawaii.com',
    platform:'shopify', ref:'qjvszvtz', rate:'10%', cookie:30, tier:1, pending:true },

  { key:'berrykawaii', name:'BerryKawaii', room:'wardrobe', domain:'berrykawaiiuwu.myshopify.com',
    platform:'shopify', ref:'rzjwubas', rate:'10%', cookie:7, tier:3, pending:true },

  { key:'gamingtees', name:'Gaming Tees', room:'wardrobe', domain:'gamingtees.store',
    platform:'shopify', ref:'', rate:'10%', cookie:7, tier:3, pending:true,
    note:'Filed under Wardrobe rather than Play. It sells shirts.' },

  /* ---- ROUND THREE, 31 Aug ------------------------------------- */
  { key:'miccostumes', name:'miccostumes', room:'wardrobe', domain:'www.miccostumes.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:120, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 88285 when it clears. ' +
         'Cosplay, with a 120-DAY WINDOW and a feed. The window is the whole story: cosplay is planned months out.' },

  { key:'cosplayshopper', name:'Cosplay Shopper', room:'wardrobe', domain:'www.cosplayshopper.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:45, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 90655 when it clears. ' +
         'The second cosplay option. Worth having only if miccostumes declines.' },

  /* ==========================================================
     AUDIO — the room the headphone push is aimed at.
     ----------------------------------------------------------
     This room had two merchants, both unattributed and both pending,
     and it was the emptiest real room on the map. Seven rows arrived
     on 31 Aug 2026 in one afternoon, and they are in three different
     states that must not be confused with each other:

       BASN        GoAffPro, code issued, live. Ready to capture.
       Fosi        AWIN, joined, id in hand. Ready to capture.
       the five    AWIN, APPLIED FOR AND NOT YET APPROVED. Their
                   advertiser ids are known -- they are the public
                   ids in AWIN's own directory export -- and they are
                   deliberately NOT in `awinmid` yet. See below.

     WHY THE FIVE SHIP WITH AN EMPTY `awinmid` WHEN THE NUMBER IS
     SITTING RIGHT THERE IN THE NOTE.

     An empty tracking value is a state this registry already handles
     honestly: buildAff() links direct, isAttributed() says no, and
     `?debug` shouts in capitals. A FILLED one on an unapproved
     programme is a state nothing here handles, because it looks
     exactly like a working store from every angle we can see. The
     link composes, the shopper arrives, AWIN declines the click
     because we are not a partner, and every report on our side
     reports a healthy attributed merchant.

     That is a NEW failure mode this network brought with it, and the
     fix is to not create it: paste the id on approval, which is the
     one-line edit this file is built around. Until then the number
     lives in prose where no code can read it.

     RATE ALONE AND CONVERSION ALONE ARE BOTH MISLEADING, AND THE
     FULL TABLE CAME BACK ON 31 AUG. Multiply them and the room
     reorders completely:

       TOZO       8.28% x 15%   the best row here, and it was
                                nowhere near the top on either
                                number by itself
       EasySMX   13.44% x  8%   third, NOT first: its 15% is a
                                voucher group and this is a shelf
       DubsLabs   6.66% x 18%   second, on Bedphones
       Zygo       5.33% x 17%   third, plus the fastest payment at
                                34 days. Nothing on customer
                                referrals, which is worth knowing
                                before building anything around it
       Maono      7.30% x 10-20%
       Divoom     6.95% x 5%    high conversion, thin rate
       DOSS       2.49% x 20%   thin conversion, best rate
       Status     8.84% x 1%    the second-best conversion of the
                                twenty-two, and axed. See REJECTED

     AND A RATE IS A GROUP, NOT A NUMBER. EasySMX publishes three:
     8% default, 15% on a voucher group, 4% on a rule nobody has
     explained. A voucher group pays coupon and deal sites; nothing
     here is one, so the default is the number to plan on and the
     headline is somebody else's. Maono and Nank publish groups too.
     Where a single figure is recorded on a row below, it is the
     default group unless the note says otherwise.

     BASKET SIZE IS STILL THE THIRD TERM AND WE DO NOT HAVE IT.
     HIFIMAN and Meze both pay 5%, which puts them near the bottom of
     that ranking and is misleading in the other direction: 5% of a
     $2,000 planar headphone is $100, against $6 on a $60 microphone.
     Where the ranking above and the EPC column disagree, the rate is
     fresher -- read off the commission manager today -- and the EPC
     is a trailing network average across every publisher. Neither is
     the answer on its own.
     ========================================================== */
  { key:'basnaudio', name:'BASN Audio', room:'audio', domain:'www.basnaudio.com',
    platform:'unknown', ref:'verdastudio', rate:'10%', cookie:7, tier:2, pending:true,
    note:'GoAffPro, code issued 31 Aug 2026 and live. In-ear monitors for drummers and ' +
         'stage players, which is a category no other site in the portfolio touches. ' +
         'The 7-day window is the short end of this sheet, survivable on an impulse buy ' +
         'and thin for a researched one. `platform` unverified: this box cannot reach ' +
         'the domain (the gateway answers 403), and GoAffPro is not Shopify-only -- ' +
         'three merchants in this file were registered shopify and answered on Woo.' },

  { key:'fosiaudio', name:'Fosi Audio', room:'audio', domain:'fosiaudio.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'119395',
    rate:'8%', cookie:30, tier:1, pending:true,
    note:'AWIN advertiser 119395, joined 31 Aug 2026. THEY DECLINED US ON 30 AUG AND ' +
         'ACCEPTED US ON 31 AUG, so this row spent a day in REJECTED with a note saying ' +
         'not to re-apply "until something about our side changes". Something did: the ' +
         'site went up and the AWIN account went live. The note was right to be written ' +
         'and right to be deleted. ' +
         'HiFi amps, preamps, DACs, headphone amps, speakers, portable DAC amps -- the ' +
         'best brand fit in the whole electronics cut, which is why it was worth the ' +
         'second ask. 30-day cookie, 37-day auto-validation, US only. ' +
         'PAYMENT IS EXPOSURE LEVEL 4, the worst band AWIN publishes: over their credit ' +
         'limit AND over settlement terms, 75 days to pay on the dashboard. Its 79.37% '  +
         'approval rate is the lowest of the three joined: one order in five is ' +
         'declined after the click. Recorded rather than ' +
         'argued -- it is a real risk on a real merchant and the owner joined knowing it. ' +
         'ShopWindow empty, so the link is composed through cread.php and the capture has ' +
         'to come off their own storefront.' },

  { key:'mojawa', name:'MOJAWA', room:'audio', domain:'mojawa.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'123666',
    rate:'unread', cookie:30, tier:1, pending:true,
    note:'AWIN advertiser 123666, joined 31 Aug 2026. Open-ear bone conduction for ' +
         'running and cycling, which is a use case nothing else in this room covers. ' +
         'Publisher dashboard: 5.85% conversion, 90.62% approval, EPC 1.20, 60 days to ' +
         'pay, payment amber. THE ONLY ONE OF THE THREE JOINED PROGRAMMES WITH A PRODUCT ' +
         'FEED, which means it is also the only one that could be ingested through AWIN ' +
         'rather than captured off its own storefront. That path is not built: `feedcsv` ' +
         'exists as a platform and wants a feedId and AWIN_API_KEY. Until it is, this is ' +
         'a capture like the rest. Rate not read yet -- the commission manager has it.' },

  /* ---- APPLIED 31 Aug 2026, NOT YET APPROVED ---------------------
     `awinmid` stays empty until the acceptance lands. The id is in
     each note; pasting it is the whole of switching one of these on,
     after a capture. */
  { key:'beyerdynamic', name:'beyerdynamic', room:'audio', domain:'north-america.beyerdynamic.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'6%', cookie:365, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 95259 when it clears. ' +
         'SIX PER CENT, read off the commission manager 31 Aug. Low as a headline and the ' +
         'best row on the sheet anyway, because it is six per cent against a 365-day ' +
         'window: twelve times the norm here, on a brand people research for months. ' +
         'A 365-DAY COOKIE, which is twelve times the norm on this sheet and the longest ' +
         'window in the portfolio by a distance. Studio and gaming headphones made by ' +
         'hand in Heilbronn since 1924; their Creator and Gamer lines are the same shopper ' +
         'the Battlestation room already has. They publish a product feed.' },

  { key:'maono', name:'Maono', room:'audio', domain:'www.maono.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10% default, 20% on named lines', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 83571 when it clears. ' +
         'COMMISSION GROUPS, read off the commission manager 31 Aug: 10% is the default, ' +
         'and TWO GROUPS PAY DOUBLE — GM Neo and DM40 at 20%, and PD200W, PD200X, PD400X, ' +
         'T5 and the bundle at 20%. That is the best rate anywhere on this sheet and it ' +
         'sits on the best earnings-per-click, which makes this the row to get. ' +
         'The groups are recorded here and NOT modelled anywhere in code: nothing on this ' +
         'site computes an expected commission, and a per-product rate table would be a ' +
         'second copy of AWIN\'s that goes stale silently the first time they retune it. ' +
         'Best earnings-per-click of the five at 1.10, 90-day window, 90% approval rate, ' +
         'and a product feed. Microphones, mixers and boom arms as much as headphones, so ' +
         'it stocks this room and the Battlestation off one approval.' },

  { key:'hifiman', name:'HIFIMAN', room:'audio', domain:'store.hifiman.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'5%', cookie:15, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 88881 when it clears. ' +
         'FIVE PER CENT, read off the commission manager 31 Aug. Small next to Maono\'s ' +
         '10 and worth more per sale than it: these are $300 to $2,000 headphones, so 5% ' +
         'is $15 to $100 a time against $6 on a $60 microphone. Percentage is the wrong ' +
         'unit to compare rows on in this room. ' +
         'ITS LINK STATUS IS RED ON THE AWIN DASHBOARD, alone among twenty-two pending ' +
         'applications, all of which are green. Red means AWIN cannot reach their tracking ' +
         'endpoint. It is not a reason to withdraw and it IS a reason not to clear pending ' +
         'the day approval lands: an approved programme with a dead link earns nothing and ' +
         'looks identical to a working one from our side. Re-check the dashboard before ' +
         'this ships, not after. ' +
         'Planar magnetic, the deep end of the audiophile shelf, 100% approval rate and a ' +
         'feed. The 15-day window is the shortest of the five and the reason this is tier ' +
         '2 rather than 1: cookie is sorted on before rate everywhere in this file.' },

  { key:'mezeaudio', name:'Meze Audio', room:'audio', domain:'www.mezeaudio.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'5%', cookie:30, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 33417 when it clears. ' +
         'FIVE PER CENT, read off the commission manager 31 Aug, on the highest baskets in ' +
         'the room: the 99 Classics are around $300 and the Empyrean is four figures, so ' +
         'one sale here is worth a dozen anywhere else on this sheet. ' +
         'Hand-finished in Baia Mare, 100% approval, feed. High basket and low volume: ' +
         'the one on this list that sells on a photograph, which suits a card with a big ' +
         'image on it.' },

  /* ---- APPLIED 31 Aug 2026, ROUND TWO ----------------------------
     Seventeen more, sent the same afternoon, all pending. Same rule
     as the five above: `awinmid` stays empty, the id lives in the
     note, and approval is a one-line paste.

     THE NUMBERS BELOW ARE OFF THE PUBLISHER DASHBOARD, NOT THE
     DIRECTORY EXPORT, and they carry a column the export does not:
     conversion rate. It reorders things. EasySMX converts at 13.44%
     against Cleer's 0.91%, which is a factor of fifteen and not
     visible from anything in the CSV.
     ---------------------------------------------------------------- */
  { key:'tranya', name:'TRANYA', room:'audio', domain:'shop.tranya.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 62337 when it clears. ' +
         '2.52% conversion, 100% approval, EPC 0.08, 70 days to pay, feed yes. Thinnest EPC of the twenty-two: here for shelf depth.' },

  { key:'tozo', name:'TOZO', room:'audio', domain:'www.tozostore.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'15%', cookie:60, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 98381 when it clears. ' +
         '8.28% conversion, 100% approval, EPC 0.45, 69 days, no feed. Third-best conversion of the set on a name people already search.' },

  { key:'cleer', name:'Cleer Audio', room:'audio', domain:'cleeraudio.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 24716 when it clears. ' +
         '0.91% CONVERSION, the worst of the twenty-two, against amber payment and 96 days to pay. 100% approval and a real brand, and the numbers say hold it at the back.' },

  { key:'edifier', name:'Edifier', room:'audio', domain:'edifier-online.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 54811 when it clears. ' +
         '3.75% conversion, 89.14% approval, EPC 0.75, 52 days, no feed. Ninety-day window, speakers and headphones both.' },

  { key:'oneodio', name:'OneOdio', room:'audio', domain:'www.oneodio.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'15%', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 114832 when it clears. ' +
         '4.14% conversion, 80.39% approval, EPC 0.37, 36 DAYS TO PAY which is the second fastest here, feed yes.' },

  { key:'divoom', name:'Divoom', room:'audio', domain:'divoom.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'5%', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 105457 when it clears. ' +
         '6.95% conversion, 98.15% approval, EPC 0.27, 65 days, feed yes. Pixel-art Bluetooth speakers: filed in Audio, and half its catalogue belongs on the Arcade Floor once the classifier sees it.' },

  { key:'dubslabs', name:'DubsLabs', room:'audio', domain:'www.dubslabs.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'18%', cookie:45, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 56785 when it clears. ' +
         '6.66% conversion, 100% approval, EPC 0.12, 71 days, feed yes. Bedphones: headphones flat enough to sleep in.' },

  { key:'doss', name:'DOSS', room:'audio', domain:'www.dossaudio.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'20%', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 106513 when it clears. ' +
         '2.49% conversion, 100% approval, EPC 0.21, 64 days, no feed. Twenty-five years of portable and bookshelf speakers.' },

  { key:'jabees', name:'Jabees', room:'audio', domain:'jabeesstore.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 130107 when it clears. ' +
         'No performance data at all: the programme launched 26 Aug 2026, five days before we applied. Amber payment. States tiered commission to 20%, which is unproven.' },

  { key:'eksa', name:'EKSA', room:'audio', domain:'www.eksa.net',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'15%', cookie:60, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 92427 when it clears. ' +
         '3.43% conversion, 92.86% approval, EPC 0.15, 67 days, feed yes. Gaming headsets only, and the straightest line from this room to GearAvail.' },

  { key:'retrolife', name:'Retrolife', room:'audio', domain:'retrolifeplayer.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 83661 when it clears. ' +
         '2.84% conversion, 100% approval, EPC 0.66, 71 days, feed yes. HiFi turntables and record players: a 90-day window, and the best thematic fit in the whole intake for a site with an arcade in it.' },

  { key:'naenka', name:'Nank', room:'audio', domain:'www.naenka.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10% (8-12% by group)', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 60125 when it clears. ' +
         'No performance data. Amber payment. Bone conduction, thirteen years of it, and a feed.' },

  { key:'kokoon', name:'Kokoon', room:'audio', domain:'kokoon.io',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:60, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 59387 when it clears. ' +
         'No performance data. Amber payment. Sleep headphones with their own app; publishes 10% up front, which most of this intake does not.' },

  { key:'newbee', name:'New Bee', room:'audio', domain:'anewbee.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'10%', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 128073 when it clears. ' +
         'No performance data: launched 19 Jun 2026. Amber payment. States 10-20% and a high average order, with nothing on the board to check it against.' },

  { key:'easysmx', name:'EasySMX', room:'battlestation', domain:'www.easysmx.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'8% default (15% voucher group, 4% rule 2)', cookie:30, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 90411 when it clears. ' +
         '13.44% conversion, the highest of the intake by five points, 100% approval, EPC 0.80, feed yes. Controllers, mice and headsets, so it is filed at the desk and the classifier will scatter it across three rooms. ITS RATE IS THREE RATES, AND THE HEADLINE ONE IS NOT OURS: default 8%, a \'15.0 Voucher Rate\' group at 15%, and a \'Rule 2- 57909\' group at 4%. A voucher group is for coupon and deal sites; this is a shelf, so 8% is the number to plan on and 15% is the number a different kind of publisher gets. Assume the default until the advertiser says otherwise. That drops it from first on rate times conversion to third, which is still the top of the list and no longer a number that was never on offer.' },

  /* ---- ROUND THREE, 31 Aug ------------------------------------- */
  { key:'huanuo', name:'Huanuo', room:'battlestation', domain:'www.huanuohome.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 82051 when it clears. ' +
         'Monitor arms and desk mounts. EPC 4.53, THE HIGHEST NUMBER IN THIS FILE and roughly two and a half times the best audio row. The desk objects nobody writes about convert better than the ones everybody does.' },

  { key:'lovedeskmats', name:'LoveDeskMats', room:'battlestation', domain:'lovedeskmats.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 96107 when it clears. ' +
         'Deskmats. 90-day window, 100% approval, feed. The one desk object bought for how it looks.' },

  { key:'kawaiikeycaps', name:'KawaiiKeyCaps', room:'battlestation', domain:'kawaiikeycaps.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:60, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 100605 when it clears. ' +
         'Artisan keycaps. Sits across Verda and Kawaii Katz equally, which is rare enough to note.' },

  { key:'ewinracing', name:'EwinRacing', room:'battlestation', domain:'www.ewinracing.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 64242 when it clears. ' +
         'Gaming chairs, with a feed. High basket and the most photographed object in the room.' },

  { key:'womier', name:'Womier', room:'battlestation', domain:'womier.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 78646 when it clears. ' +
         'Mechanical keyboards with the transparent cases. Cheap entry into the deepest room here, EPC 0.14.' },

  { key:'flexispotca', name:'FlexiSpot Canada', room:'battlestation', domain:'www.flexispot.ca',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:45, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 97633 when it clears. ' +
         'Standing desks, CANADA ONLY. Tier 3 for that reason alone: this shelf is US-facing, and a Canadian storefront on it is a dead end for most of the traffic. Worth having only if a CA audience shows up in the click report.' },

  { key:'zygo', name:'Zygo', room:'audio', domain:'www.shopzygo.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'17% (0% on customer referrals)', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 93023 when it clears. ' +
         '5.33% conversion, 100% approval, EPC 1.93 which is the highest here, 34 DAYS TO PAY which is the fastest. A headset that streams audio underwater, for swimmers: the narrowest product in the intake and the best numbers on it.' },

  { key:'ozlo', name:'Ozlo Sleepbuds', room:'audio', domain:'ozlosleep.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'7%', cookie:30, tier:3, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 100653 when it clears. ' +
         'No performance data. 132 DAYS TO PAY, by far the slowest of the twenty-two. Built by ex-Bose engineers after Bose dropped its own sleepbuds.' },

  /* ==========================================================
     THE WALLS — canvas, wallpaper, the room itself.
     ----------------------------------------------------------
     THE FIRST ROOM STOCKED FROM AWIN RATHER THAN GOAFFPRO, and the
     first merchant here who came to US: Big Wall Decor sent the
     invitation, and the programme was already approved and paying
     when it arrived.

     It is also the first entry whose link is WRAPPED rather than
     suffixed. Every other row in this file is a GoAffPro `?ref=`
     append; this one is composed through awin1.com/cread.php from
     AWIN_PUBLISHER and `awinmid`. See affTemplate() in products.js.
     ========================================================== */
  { key:'bigwalldecor', name:'BIG Wall Décor', room:'walls', domain:'bigwalldecor.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'65850',
    rate:'10%', cookie:30, tier:1, pending:true,
    note:'Awin advertiser 65850, joined 31 Aug 2026, US only. Oversized wall art, ' +
         'canvas, metal, acrylic and peel-and-stick wallpaper, plus a custom uploader. ' +
         'AOV $555, which is the highest on this sheet by a distance and the reason a ' +
         '10% headline is worth more here than 38% at Waffle Cone. 30-day cookie, ' +
         '30-day auto-validation, Exposure Level 1. THE PUBLISHER DASHBOARD AND THE ' +
         'PROFILE PAGE DISAGREE ON PAYMENT TIME: the profile said 38 days, the ' +
         'dashboard says 27. The dashboard is the one that moves, so take it as ' +
         'current and the profile as a snapshot. Dashboard also gives 5.13% ' +
         'conversion, 99.47% approval and EPC 1.80, which is the best of the three ' +
         'joined programmes and the highest number anywhere in this file. ' +
         'THEIR AWIN SHOPWINDOW IS EMPTY (0 products, never updated), so there is no ' +
         'feed to ingest and no aw_deep_link to inherit: the capture has to come off ' +
         'their own storefront, and `platform` is unknown rather than guessed because ' +
         'this box could not reach the domain to check. ' +
         'They offer custom 20% coupon codes; we have not asked for one and nothing ' +
         'advertises a discount until a code has been applied at their real checkout.' },
  /* ---- ROUND THREE, 31 Aug: the room itself -------------------
     The Walls had one merchant. Wall art turned out to be the thin
     end of a whole category -- neon, wallpaper, panels, canvas --
     and this room is the only one on the map that sells the room
     rather than something you put in it. */
  { key:'crazyneon', name:'CrazyNeon', room:'walls', domain:'www.crazyneon.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 95753 when it clears. ' +
         'Custom LED neon signs, made to order. 94.8% approval, EPC 1.93, no feed. The one object a gaming room is photographed with.' },

  { key:'justcanvasit', name:'JustCanvasIt', room:'walls', domain:'www.justcanvasit.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 22481 when it clears. ' +
         'Turns a photograph into a canvas. EPC 7.28, the highest in the room sweep. Personalised, so the shelf can only ever link to the tool rather than to a product.' },

  { key:'artzaco', name:'Artza Co.', room:'walls', domain:'artza.co',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:90, tier:1, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 80156 when it clears. ' +
         'Premium wallpaper. 90-day window, 87.5% approval. Complements Big Wall Decor rather than competing with it.' },

  { key:'jeedeson', name:'Jeedeson', room:'walls', domain:'jeedeson.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:15, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 108824 when it clears. ' +
         'Peel-and-stick vinyl flooring and wall panels. EPC 4.77 against a 15-DAY window, which is the shortest here and the reason this is tier 2.' },

  { key:'neonwill', name:'NeonWill', room:'walls', domain:'neonwill.com',
    platform:'unknown', ref:'', network:'awin', awinmid:'',
    rate:'unread', cookie:30, tier:2, pending:true,
    note:'AWIN application sent 31 Aug 2026. Advertiser id 33857 when it clears. ' +
         'LED neon signs WITH A FEED, which CrazyNeon does not have. 62.5% approval: they decline more than a third.' },

]

/* ============================================================
   PROSPECTS — the scene's actual merchants, and none of them are
   reachable from here yet.
   ------------------------------------------------------------
   THE FINDING THAT PRODUCED THIS LIST IS WORTH INTERNALISING RATHER
   THAN REDISCOVERING. Three separate research passes — gaming,
   Japanese culture, electronics — returned the same answer:

     GoAffPro gives you small independent Shopify brands, fast
     approval and real but niche catalogues. It gives you NO BRAND
     ANYBODY HAS HEARD OF.

   No Razer. No Logitech. No Anker. No Secretlab. No Crunchyroll.
   Those live on Impact, CJ, Awin and in-house programmes, because
   GoAffPro is a Shopify app and its directory is Shopify stores.

   So GoAffPro is the LAUNCH MECHANISM, not the catalogue. It gets
   the dungeon to a dozen live merchants in days, and that is exactly
   what makes an Impact application credible three weeks later.

   These are not scraped and they build no links. They exist so the
   outreach list is a file rather than somebody's memory, and so the
   capture worklist knows they are worth a capture even before there
   is any way to earn from them. The bookmarklet does not care
   whether we have a programme: reading a page you are already on is
   research either way.

   HOW TO APPROACH THEM: Sakuraco's own FAQ is the template for the
   whole category. Email support with the site and social URLs and
   they tell you what you qualify for; several will send a free box
   to a creator with an audience, which is content and not just
   product. Do these AFTER the dungeon has pages on it. An
   application from an empty domain gets declined, and re-applying is
   harder than applying.
   ============================================================ */
export const PROSPECTS = [
  { name:'Tokyo Otaku Mode', room:'vault',         network:'in-house', terms:'Official figures and merch from Japan, 18+ manufacturers' },
  { name:'Crunchyroll Store', room:'vault',        network:'in-house', terms:'The biggest name in the category. Absorbed Right Stuf' },
  { name:'AmiAmi', room:'vault',                   network:'own',      terms:'The figure collector\'s shop. Enormous pre-order catalogue' },
  { name:'Good Smile Company', room:'vault',       network:'own',      terms:'Nendoroid and figma, the manufacturer itself. Long shot, high prestige' },
  { name:'CDJapan', room:'vault',                  network:'own',      terms:'5-7%, tiered by volume' },
  { name:'Solaris Japan', room:'vault',            network:'own',      terms:'Japanese import, figures, hobby' },
  { name:'Senpai Mart', room:'vault',              network:'own',      terms:'10%' },
  { name:'Undefined Design', room:'wardrobe',      network:'own',      terms:'Anime-styled apparel. Up to 20%, 30-day' },
  { name:'YesStyle', room:'wardrobe',              network:'own',      terms:'Asian fashion, beauty, lifestyle. Well-documented programme' },
  { name:'Razer', room:'battlestation',            network:'impact',   terms:'3-10%. Wants a site with pages on it' },
  { name:'Secretlab', room:'battlestation',        network:'impact',   terms:'Up to 12%, 45-day cookie. The chair everybody researches' },
  { name:'SteelSeries', room:'battlestation',      network:'impact',   terms:'Peripherals' },
  { name:'Logitech / Corsair', room:'battlestation', network:'cj',     terms:'The Best Buy shelf' },
  { name:'Elgato', room:'battlestation',           network:'corsair',  terms:'Capture cards, stream decks. Runs under Corsair' },
  { name:'Humble Bundle', room:'play',             network:'impact',   terms:'10%' },
  { name:'Anker / Ugreen', room:'power',           network:'impact',   terms:'Charging and cables. The category everybody actually buys' },
  { name:'Micro Center / Newegg', room:'workshop', network:'own',      terms:'PC parts retail, US' },
  { name:'JetPens', room:'vault',                  network:'own',      terms:'Japanese stationery. Cult following' },
  { name:'Bokksu', room:'vault',                   network:'own',      terms:'Japanese snack subscription. Free-box tier for creators' },
  { name:'Sakuraco', room:'vault',                 network:'own',      terms:'Seasonal Japanese snacks and tea. Free box if eligible' },
  { name:'ZenPop', room:'vault',                   network:'own',      terms:'Japanese stationery, snack and ramen packs' },
]

/* ============================================================
   REJECTED — turned down on purpose, with the reason attached.
   ------------------------------------------------------------
   WORTH TWENTY SECONDS BEFORE ANYBODY GOES BACK TO THE SOURCE FILE.
   The four highest-commission gaming rows in the entire 22,290-row
   file are all on this list. Sorting that file by commission
   descending and applying from the top is exactly how somebody signs
   up to all four, and two of them get an affiliate account
   terminated rather than merely wasting a morning.

   A HIGH RATE IS USUALLY A WARNING. 77% commission means the list
   price is fiction.
   ============================================================ */
export const REJECTED = [
  { name:'CheatArena "Dominate Every Game"', terms:'50%, 365d',
    why:'Sells game cheats. Gets affiliate accounts terminated, and it exists to ruin other people\'s games.' },
  { name:'Casino Game Predictor Software', terms:'20%',
    why:'Gambling-prediction "software". The category is a scam by construction.' },
  { name:'Voila Stickers', terms:'77%',
    why:'A 77% commission means the list price is fiction.' },
  { name:'Sex Waifu', terms:'8%, 30d',
    why:'Adult. Wrong site, and it fails other networks\' publisher review later, which costs us Impact.' },
  { name:'Game Cuffs Hunting Drags', terms:'20%',
    why:'False positive. "Game" as in deer.' },
  { name:'Canine Brain Games', terms:'10%',
    why:'False positive. Dog puzzle toys.' },
  { name:'Board Game Design Course', terms:'20%',
    why:'An info product, not a shop.' },
  { name:'Status Audio', terms:'1%, 30d, AWIN 77862',
    why:'ONE PER CENT. A dollar on a hundred-dollar pair, read off the commission manager ' +
        '31 Aug 2026, and the owner axed it the same afternoon. ' +
        'THIS ROW WILL LOOK WORTH RE-APPLYING TO, which is the whole reason it is written ' +
        'down here rather than deleted: it converts at 8.84% with 100% approval and EPC ' +
        '0.68, the second-best conversion of twenty-two applications, on direct-to-consumer ' +
        'studio headphones at prices people actually pay. Every number on the dashboard ' +
        'says yes and the only one that matters says no. Sorting that dashboard by ' +
        'conversion descending is exactly how somebody signs up again. ' +
        'The application may still be pending on AWIN; withdraw it there, this file cannot.' },
  { name:'Tokyo Tiger', terms:'n/a',
    why:'Kawaii Katz measured it at HTTP 403 from Vercel IPs with a real browser UA. Host-level ' +
        'bot protection, not a User-Agent problem. Do not re-run that experiment; a row here ' +
        'would be a merchant that returns zero products forever.' },
]

/* ------------------------------------------------------------
   THE AMAZON LINKS ARE STORED AND DELIBERATELY NOT USED.
   ------------------------------------------------------------
   Two merchants issue an Amazon Attribution link alongside their
   own-site code. Both point at `amazon.com/` with NO product path,
   so they are STOREFRONT-level: they can carry somebody to Amazon's
   front page and nothing more specific than that.

   That is useless for a product card and actively harmful as one. A
   card reading "$89 portable monitor" that lands on amazon.com's
   homepage is a broken promise, and the shopper who wanted that
   monitor now has to go and search for it with our attribution
   already spent. If a per-product Amazon path ever arrives, it
   belongs in a deliberate "also on Amazon" affordance, never in
   cardHref().
   ------------------------------------------------------------ */

/** Attribution is real. An empty `ref` earns nothing, however live the store is. */
export function isAttributed(st) {
  return !!(st && typeof st.ref === 'string' && st.ref.trim())
}

export function byKey(key) {
  return STORES.find(s => s.key === key)
}

/** Longest window first. Cookie before rate, everywhere, deliberately. */
export function byWindow(list = STORES) {
  return list.slice().sort((a, b) => (b.cookie || 0) - (a.cookie || 0))
}

/** Every room that has at least one registered store, in crawl order. */
export const ROOM_ORDER = [
  'arcade', 'play', 'tabletop', 'battlestation', 'workshop', 'audio', 'power', 'vault', 'wardrobe',
]
