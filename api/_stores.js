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
     REJECTED   merchants deliberately turned down, WITH REASONS, so
                nobody rediscovers them in six months and signs up.

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

  /* ==========================================================
     AUDIO.
     ========================================================== */
  { key:'fosiaudio', name:'Fosi Audio', room:'audio', domain:'fosiaudio.com',
    platform:'shopify', ref:'', rate:'8%', cookie:30, tier:1, pending:false,
    note:'Budget hi-fi amps with a real cult following: heavily researched, badly covered ' +
         'by everybody else. The single best brand fit in the electronics cut.' },

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
