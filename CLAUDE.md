# CLAUDE.md — Operating guide for Verda Studio

Read this fully before editing. Sister project to **Legal-Leaf Market**,
**Herbal Leaf Market**, **Nicotia Market** and **Kawaii Katz**. It copies their
architecture deliberately, and it inverts one thing about how they were built
deliberately (§4). That inversion is the most important paragraph in this file.

---

## 1. What this is

An affiliate storefront for the scene: retro and arcade, tabletop, gaming,
battlestation, PC and 3D printing, audio, power, collectibles and apparel,
aggregated from independent shops. We never take an order; every checkout is a
hand-off to the shop's own site with our attribution attached.

**It is a browse-first shop, and that is the whole design.** The brief was
"GameStop meets Disc Replay meets every arcade you've ever loved". Nobody walks
into Disc Replay with a part number; they walk the crates. So this is a room to
wander, not a search box over a price table — which is the *opposite* of
Legal-Leaf Market's design, where somebody arrives knowing what they want and
wants the cheapest one. Do not port Legal-Leaf's search-and-compare surface
here on the grounds that it is proven. It is proven at a different job.

That also promotes the arcade from a gimmick to the thesis. An arcade in a shop
that sells arcade cabinets is not a novelty feature, it is the shop.

**It is the big sister to Kawaii Katz.** Kawaii Katz is kid-friendly, gift-shaped
and kawaii-scoped; this is the grown-up one. They share four merchants and
nothing else — separate registries, hard cross-links, no shared code (§9).

```
vercel.json      Routing + headers. THE source of truth for routes.
server.mjs       Local preview only. PARSES vercel.json; never restate a route.
package.json     Node >= 18, ONE dependency (@neondatabase/serverless).
api/
  _stores.js     THE REGISTRY. 54 merchants + prospects + rejections.
  _scene.js      ONE RULE: which room, or '' for "we don't carry it".
  _db.js         Neon. Schema on demand, kv + capture tables.
  _capture.js    The capture store, and THE PUBLISH GATE.
  products.js    The scraper, ported from Nicotia. De-nicotined (§6c).
  capture.js     POST a capture · ?report=<key> · ?worklist
  collector.js   Generates the bookmarklet from typed source.
  _scan.js       "Scan everything": the CRAWLING half. Read §4b.
  track.js       Event sink.
public/
  index.html     The dungeon. Markup only.
  css/tokens.css Family design system, our accent (§8)
  css/app.css    Components
  js/grid.js     THE SHELF. Cards, facets, sort. ONE renderer (§6b)
  js/app.js      The map, room routing, empty states
  collect.html   Operator tool: install the bookmarklet, relay tab, worklist
  arcade.html    THE ARCADE. Byte-portable across all sister sites (§7)
  js/arcade-*.js The cabinets
  arcade/dino/   Chromium's offline game, vendored with its licence
data/captured/   THE GATE. One reviewed capture per publishable merchant.
docs/
  SCENE_AFFILIATES.md  The merchant research this site was built from.
test/            node --test. No framework. `ingest.test.mjs` is the
                 end-to-end one (§11b).
```

---

## 2. Deploy model

```
edit -> push -> Vercel auto-deploys
```

`vercel.json` sets `framework: null` + `outputDirectory: public`, so Vercel
serves `public/` statically and runs each non-underscore file in `api/` as a
serverless function. **Do not add Next.js, Vite or any build pipeline** — it
breaks this setup and produces the "No Next.js version detected" failure
Legal-Leaf hit. If a deploy fails, check `vercel.json` first.

Files in `api/` beginning with `_` are helpers, not endpoints. `_stores.js`
holds our commission rates and rejection reasons; the underscore is what keeps
it off the public internet.

---

## 3. Routing and dev — ONE source of truth, twice over

Legal-Leaf keeps routes in **both** `vercel.json` and a hardcoded map in
`server.mjs`, and its own guide documents an outage caused by the two drifting
apart. **We do not do that.** `server.mjs` parses `vercel.json` at startup. Add
a route there and the local preview picks it up. Never hardcode a route in
`server.mjs`.

`cleanUrls: true` means `public/foo.html` serves at `/foo`. Every room URL
(`/vault`, `/workshop`, `/battlestation` …) rewrites to `index.html` and the
room is chosen client-side from the path.

**`server.mjs` discovers `api/*.js` from disk**, the way Vercel does: every
`.js` file becomes `/api/<name>`, `_`-prefixed files are helpers and are not
served. It used to hold a hand-written map of Nicotia's three endpoints, so
`/api/capture` and `/api/collector` — the two the entire capture workflow runs
on — **404'd locally for the whole life of the project** while working fine in
production. That is precisely the drift this file's header brags about
preventing for routes, reproduced one section down for functions. Adding an
endpoint now needs no edit anywhere.

**There is no module cache.** It used to cache handlers, with a note saying
restart after editing anything in `api/` "or you will test stale code". A
footgun with a comment attached is still a footgun, and that one costs an
afternoon per person rather than per project. Handlers re-import per request.

**`.env` is read automatically** if present — `--env-file` cannot be passed
through `npm run dev`, and without `DATABASE_URL` the site's own empty state
says the capture store is unconfigured, which reads as "the app is broken".
Startup prints what it found and warns about what is missing.

`test/server.test.mjs` **boots the real server** and probes every endpoint from
disk. Every other test here reads source or calls a function, and none of them
would have caught this: the bug was not in any function, it was in the wiring,
and wiring is only testable by running the thing.

---

## 4. THE INVERSION: capture first, scrape second

**This is the one thing this repo does differently from all four sister sites,
and everything else in it assumes this is true.**

Herbal-Leaf, Nicotia and Kawaii Katz were all built the same way: register a
vendor, point the scraper at its `products.json`, ship, and learn afterwards
what came back. Each of the three has a paragraph in its own guide about what
that cost. Kawaii Katz's is the bluntest — an intake "went onto the shelf
unread", Tokyo Tiger has returned HTTP 403 since the day it was added, and two
vendors put 466 products up that earn nothing to this day.

Here the order is reversed. **A human opens the merchant in their own browser,
runs the collector bookmarklet, and we read what is actually there before any
scraper is pointed at it.**

The inversion is only real because something enforces it:

- Every merchant in `_stores.js` ships `pending: true`.
- `publishable()` in `_capture.js` **additionally** requires a reviewed capture
  committed at `data/captured/<key>.json`.
- `products.js` filters on `publishable()`, not on `!pending`.

### The draft generator, and the counterweight it required

Hand-writing `data/captured/<key>.json` is twenty minutes of transcribing a
histogram, and twenty minutes of tedium at the one step that must not be skipped
is a step that gets skipped. So `draft()` writes it.

**Which immediately threatens the thing the gate is for.** A generator that fills
in `include` and hands you a file to commit turns "a human read this catalogue"
into "a human ran a command", and the gate becomes a rubber stamp that still
looks like a gate. That is worse than the tedium because it is invisible.

So the split is deliberate:

- **Measured facts are filled in** — counts, the product_type histogram, price
  range, coverage, rows without an image. Nobody retypes a number.
- **Judgement is proposed and marked as a proposal.** `include` and `roomMap`
  arrive as suggestions with the evidence attached. The threshold is stated in
  the file: a type is proposed for inclusion when ≥60% of its products land in a
  real room.
- **`reviewedBy` arrives empty, and `publishable()` refuses a blank one.** A file
  generated and committed without anybody looking publishes nothing.

That last one is not a security control and does not pretend to be — anybody can
type a name. The point is that they have to type it, and that an unreviewed
merchant fails **loudly** instead of publishing quietly.

**The per-type room breakdown is the useful part.** A bare histogram says
"Accessories: 52". What you need before writing an include list is where those 52
would *land*:

```
Accessories   52 -> battlestation 40, power 9  (3 refused)
```

One line answers "does this type belong", "which room does it want" and "is this
merchant carrying junk". That is why the draft runs the real classifier over
every captured row.

**The endpoint returns the JSON; it does not write it.** Not a serverless
limitation dressed up as a rule — the file has to arrive through a commit,
because the commit is what makes the gate a thing somebody walked through.
`tools/draft.mjs` writes it locally, and **refuses to overwrite a file whose
`reviewedBy` is already filled in**: re-running it would wipe somebody's reading
and reset the gate to closed, which reads as "the tool is broken" rather than as
"you just deleted a review".

So **editing `pending: false` publishes nothing.** That is the point. `pending`
is an editorial flag anybody can flip in a text editor at midnight, and
flipping it is precisely how the sister sites shipped catalogues nobody had
read. A committed file is a gate somebody had to deliberately walk through, and
the walking through shows up in a pull request.

### The workflow

1. `/collect` — drag the bookmarklet.
2. Open the merchant. Scroll to the bottom if the grid lazy-loads. Click it.
   Capture every page; they merge into one record per merchant.
3. `GET /api/capture?report=<key>` with the passcode. **Read `readThisFirst`
   before anything else** — a capture holding 24 of 1,180 products looks
   exactly like a small catalogue.
4. **Draft the summary** rather than hand-writing it:
   `npm run draft -- <key>` (needs `DATABASE_URL`; `node --env-file=.env` works),
   or the **Draft the capture file** button on `/collect`.
5. **Read it, and fill in `reviewedBy`.** A summary with a blank `reviewedBy`
   publishes nothing — see below.
6. Commit it, then clear `pending`.

**`include` and `roomMap` are load-bearing, not paperwork.** They are the two
decisions a human makes when reading a capture, and `row()` applies them: a
product whose `product_type` is not in `include` is dropped, and `roomMap`
overrides the classifier. For a while nothing consumed them — the draft produced
them and `data/captured/README.md` promised the ingest would read them — so the
whole review step was theatre that looked like a control.

**An empty `include` means everything**, deliberately. Plenty of merchants have
no `product_type` taxonomy at all, and refusing a whole catalogue because a field
is blank reads as "this shop returns nothing", which is the hardest symptom to
diagnose. The draft always proposes a list, so a blank one on a merchant that
*has* types is somebody deleting it on purpose.

`GET /api/capture?worklist` is public and says what is left. It carries no
rates, no cookie windows and no affiliate codes. On `/collect` each shop is a
link and each key copies on click — **bare domains, never the `?ref=` version**,
because walking the list through tracked links would manufacture 54 fake clicks
against the owner's own conversion stats.

---

## 4c. `/api/probe` — reading a Shopify feed server-side

```
GET /api/probe?key=<key>          what this merchant stocks
GET /api/probe?key=<key>&draft    ...plus the data/captured/<key>.json to commit
GET /api/probe?keys=a,b,c         several, under a 50s budget
```
Admin-gated, `x-gd-admin-token`, fails closed with `ADMIN_PASSCODE` unset. There
is a **Read the live feed** button on `/collect` beside the other two.

**Every sister site has one of these and this repo did not.** Herbal Leaf's guide
names `scripts/vendor_probe.py` in its hard "do not" list: never clear a store's
`pending` flag without running it and writing the `include` list from what the
feed actually holds. Guessing fails in both directions, and both look plausible.

**This does not undo the capture-first inversion (§4).** That inversion is about
the ORDER: read a merchant's catalogue and have a human review it before anything
of theirs reaches a shelf. It is not about the browser being the only instrument.
**53 of the 54 merchants here are Shopify**, and Shopify publishes
`products.json` precisely so machines can read it, so for those a hand walk is
ceremony rather than diligence. The gate has not moved: a committed
`data/captured/<key>.json` with a name in `reviewedBy` is still the only thing
that puts a product on a shelf, and `draftFile()` ships `reviewedBy: ''` with a
test that fails if it ever arrives pre-signed.

**Use the bookmarklet instead** for the one non-Shopify merchant, for any shop
whose feed is off at the edge (403, or HTML instead of JSON — the probe says
which and names the bookmarklet), and whenever you want to see a shop the way a
shopper does.

**`analyse()` was extracted from `_capture.js` so both readers share it.** A
catalogue arrives two ways and the decision made from it must not depend on
which; two copies of that arithmetic would drift, and invisibly — the same
merchant would get a different `include` list on a Tuesday than on a Wednesday
and nothing would say so. A test feeds the same rows through both shapes and
asserts the proposals are identical.

**It pages until a short page comes back.** Shopify caps `products.json` at 250
and truncates silently, so a single request reports a 289-product vendor as a
250-product one and nothing looks wrong (Herbal Leaf found that with a real
merchant). The 12-page runaway guard is **reported when it trips**: a silent cap
is the same bug wearing a different hat, and the note says in words that the read
is a sample.

**No URL it builds ever carries `?ref=`**, and a test with an attributed fixture
store proves it. A GET on a tracking link registers a real click against the
owner's own conversion stats, which is the one class of bug that corrupts the
evidence you would use to find it.

**Every admin-gated endpoint needs an explicit `no-store` in `vercel.json`, and
that is a config fact rather than a code one.** The `/api/(.*)` rule caches for
600s at the edge, which is right for the catalogue and wrong for everything else,
and a `Cache-Control` a handler sets in code does **not** win against the config.
`/api/probe` shipped without one and was, for a commit, a CDN-cacheable response
carrying a merchant's whole catalogue from behind a passcode. The first symptom
was harmless and misleading: a cached 404 from before the endpoint existed. A
test now derives the rule instead of listing the routes: anything whose source
reads `x-gd-admin-token` must have a `no-store` entry.

`offScenePct` is the number to read first. A merchant most of whose catalogue
`_scene.js` refuses is a merchant to drop, **not** a reason to widen the
classifier.

---

## 4b. "Scan everything" is a DIFFERENT ACT, and the code says so

`api/_scan.js`. Read it before changing it.

The plain capture makes **no request to the merchant at all** — it reads a page
the browser already fetched because a human asked for it. That is research, and
it is why the tool can be pointed at any shop without a conversation.

**Scan everything makes requests nobody individually asked for. That is
crawling.** Pretending otherwise would just mean the next person rediscovers it
by surprise. So it is built to be defensible rather than merely fast:

1. **It reads `robots.txt` and obeys it.** Not decoratively: a Disallow match
   means the URL is not fetched, the skip is counted, and the count lands in the
   capture's coverage notes. Wildcards, `$` anchors and longest-match
   Allow-beats-Disallow are all implemented, because Shopify shops routinely
   block a broad path and re-open a narrower one inside it. `Crawl-delay` is
   honoured when it is longer than ours. `test/scan.test.mjs` exercises all of
   it against the real shapes — **a decorative robots parser is worse than
   none**, since it lets everybody believe the crawl is polite.
2. **It prefers the endpoints shops publish for machines.** `products.json`, the
   WooCommerce Store API and `sitemap.xml` exist to be read by programs. A whole
   catalogue in four requests to a documented JSON endpoint is gentler than two
   hundred HTML pages. **HTML crawling is the fallback, not the strategy.**
3. **One request at a time, with a delay.** No concurrency.
4. **Capped at 300 requests, and stoppable mid-run.** A runaway crawl on
   somebody else's shop is what gets an IP banned and an affiliate account
   closed.
5. **It says what it did not see.** The sitemap gives ground truth on catalogue
   size, so "the sitemap lists 1,180 products and this scan holds 214" is now a
   fact rather than an inference.

**Every network call goes through `get()`** — that is where the cap, the robots
check, the throttle and the stop flag live, so a stray `fetch()` elsewhere
bypasses all four at once. A test asserts there are exactly two `fetch(` sites
in the file: `get()` itself, and `robots.txt`.

### What this unlocks, and the real reason to build it

`fetch('/products.json')` **from the operator's browser is same-origin.** No
CORS, no datacentre IP, no bot fingerprint. Kawaii Katz measured Tokyo Tiger at
HTTP 403 from Vercel's IPs with a real browser UA and correctly concluded it was
host-level bot protection no header gets past. A shop that refuses a datacentre
usually serves the person already browsing it, so **this path reaches catalogues
the server-side scraper structurally cannot.**

### Two traps in the build, both already paid for

- **`String.replace` expands `$&` in the replacement.** The robots parser
  contains a literal `'\\$&'`, so inlining the scanner with a string
  replacement silently rewrote it and emitted a program that would not parse.
  Function replacers fixed it. It failed loudly only because the test parses the
  output; a corrupted fragment that stayed syntactically valid would have
  shipped a subtly wrong crawler to a stranger's website.
- **A backtick in a COMMENT is as fatal as one in code.** The program is inlined
  into a `javascript:` URL. A prose comment quoting a regex class with backticks
  broke it, and that is far easier to write by accident than a template literal.
  A test now asserts on both serialised functions directly, so a failure names
  which one.

---

## 5. The registry: 54 merchants, and roughly half earn nothing

`api/_stores.js` holds three lists and the second and third are as valuable as
the first:

- **`STORES`** — 54 merchants we can reach and intend to stock.
- **`PROSPECTS`** — 21 merchants worth having that have no self-serve
  programme. Razer, Crunchyroll, Anker, Secretlab, AmiAmi, Bokksu.
- **`REJECTED`** — 8 turned down, **with reasons**, so nobody rediscovers them.

**Read `REJECTED` before going back to the source file.** The four
highest-commission gaming rows in the entire 22,290-merchant file are all on it.
Sorting that file by commission descending and applying from the top is exactly
how somebody signs up to a cheats vendor and an adult site in one sitting, and
two of those get an affiliate account terminated rather than merely wasting a
morning. **A high rate is usually a warning.** 77% commission means the list
price is fiction.

### An empty `ref` is not a reason to leave a merchant out

About half the codes are filled and half are empty, and that is intended. The
owner's instruction was explicit: build the right site, not the site we happen
to be approved for today. A merchant that belongs goes in now; the code is a
one-line edit when the application clears.

What is **not** acceptable is an empty code nobody notices. `?debug` names every
unattributed store in capitals. That is the Kawaii Katz sock-vendor failure and
the reporting is what stands in for the gate.

### The finding worth internalising rather than rediscovering

Three separate research passes — gaming, Japanese culture, electronics —
returned the same answer:

> **GoAffPro gives you small independent Shopify brands, fast approval and real
> but niche catalogues. It gives you no brand anybody has heard of.**

No Razer, no Logitech, no Anker, no Crunchyroll. GoAffPro is a Shopify app, so
its directory is Shopify stores. **It is the launch mechanism, not the
catalogue** — it gets the dungeon to a dozen live merchants in days, which is
exactly what makes an Impact application credible three weeks later.

### The link a shopper clicks is built server-side, in `row()`

`buildAff(st, url)` appends `?ref=<code>` to the product URL, or returns it
untouched when the store has no code. **`row()` calls it**, so `it.url` is
already the tracked link and the browser never needs `ref`.

That last sentence is the fix for the most expensive bug in the port, and it was
invisible by construction. `buildAff()` came across from Nicotia **and was never
called**: Nicotia deliberately drops attribution from the row and rebuilds it in
the browser to shrink the payload, shipping `ref` and a `click` template to
`app.js`. Both halves of that were removed here — `ref` is not in
`publicStores()` because commission paperwork should not reach a browser, and
`grid.js` links `it.url` directly.

So every card would have linked bare. The link works, the shopper buys, and all
23 live codes pay nothing. **That is Kawaii Katz's sock-vendor failure exactly**
— 466 products earning nothing to this day — reproduced by inheriting half of a
design. `test/products.test.mjs` pins it, because nothing about it errors.

Roughly half the registry ships unattributed on purpose. On purpose is fine;
**unnoticed is not**, and `?debug` names every empty `ref` in capitals.

### Never GET a link carrying `?ref=`

Every code in the registry is live. A GET registers a real click and pollutes
the owner's own conversion stats with our traffic — the one class of bug that
corrupts the evidence you would use to find it. `get()` in `products.js` refuses
any URL matching `TRACKING_PARAM`, and `ref` is the first alternative in it. Do
not route around it. Inspect link strings; do not follow them.

### The two Portable Monitor domains

Same operator, **two different codes**, so two programmes. Both are registered
and both are attributed, and **at most one may be published** — both on the
shelf with the same stock under two names is the anime-cluster failure, which is
what makes a comparison site worthless. Decide which from the captures.

### The anime cluster

Twenty domains in the source file (`animekeycaps`, `anime-mousepad`,
`animestatue`, `animebed`, `otakutreat` …) are **one operator running a dropship
network on one catalogue**. Three are taken, on search demand. Treat the rest as
one merchant we already have. The tell in a capture is identical titles and
identical image URLs across two domains.

---

## 6c. The port is finished: what came out of `products.js`

It arrived as Nicotia's scraper and carried its subject with it. The scraping is
the valuable half and is untouched; the nicotine half is gone. **Two of the
removals were not dead weight — they were actively wrong here, and both would
have failed silently.**

**Merely dead, now removed:** `guessStrength`, `guessPuffs`, `isTobaccoSnus`,
`SNUS_BRANDS`/`SNUS_WORDS`, the six-department `SUBCATS` map and `subclassify()`,
and the `strength` / `puffs` / `tobacco` / `nic0` / `sub` fields on every row.
`dept` is `room` throughout, so this file, `_stores.js` and `_scene.js` finally
use one word for one thing.

**Wrong, now removed: `isApparel()`.** It dropped hoodies, t-shirts, snapbacks,
keychains, stickers and decals. Correct for a pouch shop — branded merch is a
different business wearing the same storefront. Catastrophic here, where **the
Wardrobe is a room**: Gaming Tees sells nothing else, four kawaii merchants join
it, and the Vault explicitly stocks pins, keychains and stickers. Inheriting it
would have deleted five merchants' entire catalogues with every room still
rendering. A genuine merch problem later gets a per-merchant `exclude` written
from that merchant's capture, **never a global regex**.

**Fixed, not removed: `row()` now honours `''` from `classify()`.** The contract
that `''` means "we do not carry this" existed from the first commit and nothing
implemented it — the value was computed and discarded. Every off-scene product a
general dropshipper carries would have shipped with a blank room, and a blank
room renders; it just never appears under a facet, which is the version of wrong
nobody reports.

**The brand lists were nicotine vocabulary and are now scene vocabulary,
deliberately short.** `MULTIWORD` exists so `brandFrom()` does not cut a two-word
brand in half. Grow it **from a capture that shows the truncation**, never from
guessing: an invented entry silently reshapes a brand nobody sells.

### The ordering rule in `_scene.js`: what a thing IS beats what it is ABOUT

Found by a test, not by a shopper. **"Retro Gaming T-Shirt" filed under the
Arcade Floor**, because `retro gaming` matched before anything looked at
`t-shirt`. It is a shirt. A room of arcade cabinets with a t-shirt in it is wrong
in the quiet way: it renders, it is plausible, and only somebody who came for a
cabinet notices.

So `wardrobe` and `vault` sit **above** the three theme rooms (`arcade`,
`battlestation`, `play`). A garment or collectible noun is a claim about what the
object *is*; a theme word is a claim about its *subject*, and the first is
stronger. It costs the theme rooms nothing — a cabinet, a keyboard and a Steam
key contain no garment noun — and `test/scene.test.mjs` pins both halves.

---

## 6b. The grid is ONE renderer with two callers

`public/js/grid.js`. `GDGrid.mount(root, items, opts)` and nothing else.

- **`/`** — the storefront, fed by `/api/products` (published only).
- **`/collect`** — the operator preview, fed by `/api/capture?grid=<key>`
  (captured, unpublished, admin-gated).

Those show the same products at different stages of their life, and the value of
the preview is precisely that **it looks exactly like the shelf**. A second card
component built "just for preview" would drift, and it would drift in the
direction that hides the problem: the preview would go on looking fine while the
real shelf broke. Do not add one.

**The preview is not a back door round the gate.** It is admin-gated, served only
to a noindex operator page, and nothing it returns reaches `/api/products` or a
shopper. What it buys is being able to *look* at ninety product cards the moment
a merchant is scanned, which is how you actually answer "Vault or Wardrobe?" and
"is this the same dropship stock as the other anime domain?" — the second being a
question §5 explicitly asks somebody to settle before publishing either shop. It
also renders each card in the room `_scene.js` would file it under, so a bad
pattern shows up on real titles before the merchant ships.

**Facets are single-select and bidirectionally coupled**, lifted from Herbal
Leaf: room and shop each constrain the other, and a facet's counts are computed
against the pool with the OTHER facet applied but **not itself**. Without that
the counts you are choosing between are wrong the moment you pick one.
Zero-count options are **removed, not greyed** — a visible choice that lands on
an empty grid is a dead end the interface offered you.

**The default sort is a seeded shuffle that spreads the shops**, not price and
not alphabet. Both of those put one merchant's whole catalogue at the top, which
makes an aggregator read as a single shop; a plain shuffle still clumps, and
twelve adjacent cards from one merchant read as sorted to anybody scrolling. So
it round-robins across shops and shuffles within each. Same reasoning as Herbal
Leaf's shelf shuffle.

**A card says what it knows and nothing more.** No price rather than `$0.00`, no
invented "was" price, no fake ratings. A struck-through price the merchant's own
checkout refuses to honour is the worst thing this kind of site can ship.

---

## 5b. The first four merchants on the shelf, and what reviewing them found

`awkwardgames`, `rpgtabletops`, `customgamingchair`, `3dprinternational`. Their
summaries are in `data/captured/`, each carrying a `review` array saying what was
decided and why. Two things came out of doing it for real:

**`NONPRODUCT_TYPE` in `_scene.js` had never fired, on any caller, since it was
written.** It is anchored `^...$` and was tested against the whole blob (title,
variant, tags and description joined), so it could only ever have matched a
product whose entire text was the single word "fee". 3D Printernational's feed
carries **97 products of type `Warranty` and 3 of type `Service`**, all of which
were being filed into the Workshop — where they would have been the largest
category in the room, a shelf of warranty certificates with prices on them.
`classify()` now takes `product_type` as its own fourth argument.

`warranty` is matched on the **type** and deliberately NOT added to the
description-reading `NONPRODUCT` list: half that catalogue's printers mention a
warranty in their copy, so matching the blob would have hidden real machines
while looking like a fix. That is the standing broad-regex rule (§14) applied.

**An empty `include` is a decision, and `analyse()` cannot make it.** The draft
generator never proposes the `(none)` bucket, so a merchant whose catalogue is
mostly untyped gets an include list covering only its typed minority — and a
non-empty include list drops every untyped product. On `customgamingchair` the
proposal would have published **5 of 23 products** and nothing would have said
so. Both that merchant and `rpgtabletops` (23 of 23 untyped) are published with
`include: []`, which means everything.

**Three more came out of the first live publish, which is the point of looking
at the deployed shelf rather than the payload:**

- **`row()` classified against RAW HTML.** It computed `cleanDesc(o.desc)` and
  then built the blob from `o.desc` anyway, so every room decision was made
  against markup: tags, style attributes, class names and entities. `&amp;`
  contains "amp" bounded by two non-word characters, so the audio room's
  `\bamp\b` matched **every product whose description contained an ampersand**,
  and audio is tested before workshop. Eight 3D printer accessories were filed
  under Audio. The blob is built from the cleaned text now.
- **A bare `\bamp\b` is a unit of current at least as often as an amplifier.**
  "Requires a 15 amp circuit" is a sentence every CNC and printer listing
  eventually contains. The audio room names the amplifier now
  (`tube|guitar|headphone|integrated|...` + `amp`), and the tests cover both
  directions so a careless fix cannot quietly delete the Audio room.
- **The registry had `customgamingchair` as Shopify and it is WooCommerce.**
  Every Shopify strategy 404'd, the store shipped **0 products while reading as
  published**, and the capture had said `woo-store-api` all along. Nobody had
  compared the two. When a capture names a platform, check it against
  `_stores.js` before clearing `pending`.

**`roomMap` is the right tool for a merchant-specific reading, and a global
regex is not.** 3D Printernational sells a resin curing box with an "Electric
Turntable" in its title, and a turntable genuinely is Audio for any other
merchant. Rather than bend the shared pattern for one product, that shop's own
types are pinned: `3D Scanners`, `3D Printer Accessories` and `3d printer` all
map to `workshop`.

**`analyse()` does this itself now, and that is the point.** The first fix was a
rule — "read the `(none)` row before accepting any draft" — which puts the burden
on whoever reviews the next fifty. The arithmetic does it instead: when untyped
products are **25% or more** of a catalogue, the proposal is an empty `include`
with a note saying how many products a list would have dropped. Every draft also
carries a `coverage` block (`products`, `untyped`, `wouldPublish`, `wouldDrop`,
`pct`), because "the include list looks sensible" and "the include list keeps
most of the shop" are different claims and only the second is checkable.

Both directions are mutation-tested. A version that always proposed `[]` would
be just as broken — the review step would stop excluding anything — so a
properly typed catalogue is asserted to still get a real list.

---

## 5c. Triage before review, when there are 50 shops to read

```
GET /api/probe?keys=a,b,c&brief     one line each
/collect  "Triage every unread shop"  walks all of them in batches of five
```

The full probe response for 50 merchants is tens of thousands of lines, and **a
review nobody can physically read is the same as no review**. Triage answers what
decides most shops in one block: products, in stock, priced, off-scene share,
**untyped count**, price range, the type histogram with the room each type lands
in, and three sample titles. Pick from that, then draft only the survivors — the
Merchant key box takes a comma-separated list, so a triage result becomes drafts
without retyping.

`untyped` is on the triage line rather than three levels down because of §5b: it
is the single number that catches a catalogue an include list would gut.

Brief mode is tested to be actually brief. If it grows back into the full payload
it has stopped doing its job while still passing a "does it return rows" test, so
the test asserts the heavy fields are **absent**, and that brief never returns
committable files.

---

## 6. `_scene.js` — one rule, one file

`classify()` returns a room key or `''`, and **`''` means we do not carry it.**
The empty string is the important half: every merchant sells things that are
not scene, and a room is only worth walking if what is in it belongs there.

This is the mirror of a pattern both sister sites already run — Legal-Leaf's
`EXCLUDE` refuses delta-8, Kawaii Katz filters what is not kid-appropriate. All
three are "pull a big catalogue, admit only the slice that belongs".

It is **one exported function** because the same question is asked by the
ingest, the report and the tests, and three copies of a classifier drift
silently: all three keep working, they just stop agreeing.

**Do not broaden a pattern to make a room look fuller.** A broad regex does not
announce itself — it admits junk or hides real inventory, and the room still
renders. If the arcade room looks thin, the answer is more retro merchants, not
a looser idea of what retro means. `OFF_SCENE` names `garden hose` and never
bare `hose`, because a braided PSU cable sleeve is sometimes called a hose.

**Do not copy Kawaii Katz's `CUT_PHRASES` here.** `pleated skirt`, `thigh high`
and `lace up` are in it because that site is for kids, and they are also the
plain vocabulary of a fairy-kei wardrobe. On a sample of twelve decora items,
seven were dropped. That filter is right there and wrong here.
`test/scene.test.mjs` asserts those four survive.

---

## 7. The arcade

`public/arcade.html` + `js/arcade-*.js` + `arcade/dino/`, ported from
Legal-Leaf. **Portable by construction:** every colour reaches for a token, so
copying the page to a sister site picks up the local palette with no per-site
branch. The only literal is the scanline black, which is a texture.

Two things were changed on the way in and both matter:
- **The age gate was removed.** The sister sites carry one because they sell
  nicotine and hemp. This one sells keyboards. Do not copy that script back.
- `--accent-rgb` must exist in `tokens.css`, because the page builds its glows
  with `rgba(var(--accent-rgb), .11)` and that cannot be done from a hex token.

**It is `noindex` and in no nav but its own door.** Two of the cabinets are
Brayton's games and do not have his full sign-off yet. Flipping a game to
`listed:true` waits on him actually saying yes.

The arcade is also the only asset in the portfolio that is not an affiliate
link, which is the entire reason it is the connective tissue across the sites.

---

## 8. The design system: the Lantern Quarter

**This site has been redesigned twice in two days and the second one is a
clean break.** On 2026-08-29 the owner looked at the ink-and-paper build and
said, in full: complete redesign, *"something that feels like a city in that
game, but don't try to emulate the game. Come up with your own and just do
it."* That instruction is the whole brief and it overrides the rule this
section used to open with.

**Do not restore the paper palette, and do not re-derive anything from the
game's UiKit.** The previous version of this section said a colour that
drifted from the game was worse than one that never matched. That was true of
the site it described. It is the thing that was asked to stop.

### What the site is now

A night city. Deep blue-black ground, jade for the interface, lantern amber
for the world, and a five-plate silhouette skyline behind everything.

| | |
|---|---|
| ground | `--night #080d16`, rising through three surfaces to `--surface-3` |
| edges | light hairlines (`rgba(146,180,214,.13)`), never a dark border |
| interface | `--jade #7fdcb8`. Anything you can press, and the studio itself |
| the world | `--lantern #ffb86b`. Money, warmth, the city's own light |
| display type | EB Garamond, headings only |
| everything else | the system sans stack |

**Jade is us, amber is the world.** A jade price or an amber button is a
category error and looks like one.

### What survived, and it is only the data

- **The twelve realm colours** (`Realms.luau`). Rooms fly realms, that mapping
  is still a claim about meaning, and it still lives in `ROOMS_META`
  (`api/_scene.js`) mirrored in `public/js/app.js`. **The two must agree.**
  Realms 10 to 12 are still unspent except the arcade door, which flies
  Immortal Ascension because it is the room that sells nothing: *"the last
  stair has no rail."*
- **The four rarity grades** (`Items.luau`), still the card's left edge, now
  3px rather than 6. `rarityOf()` still exists twice, in `api/_scene.js` and
  `public/js/grid.js`, and they must agree.
- **EB Garamond**, still the display face.
- **The one hard rule, and it holds on any ground:** strokes go on the BORDER
  of a box, never on the glyphs of text. No `-webkit-text-stroke`, no shadow
  ring on body copy. It makes everything read blobby.

### What did not survive, and why each one had to go

These four were what "clunky" actually meant. None of them was the colour.

1. **`3px 3px 0` hard offset shadows**, on every card, door and sister link. A
   solid displaced block is the most dated thing an interface can wear.
   Replaced by `--lift-1/2/3`: a tight contact shadow plus a wide soft one.
2. **One typeface at five sizes.** `--sans`, `--bold` and `--pixel` all
   resolved to Garamond, so nothing had a different voice and therefore
   nothing had emphasis.
3. **5px radii and 1.8px borders** on everything, so the page was a page of
   boxes. Now 8/14/20 and hairlines.
4. **No air.** Sections sat 24px apart and `.ink-hero` reserved 172px of
   bottom padding for ink ridges deleted long before, so the copy huddled in
   the top-left of a 430px hole. `--gap-section` is now over 100px wide.

Merriweather is gone with them: it was the game's BOLD_FONT and at 11px on a
dark ground it is a slab of texture rather than a label.

### The scene: `tools/city.mjs`

The background was a trace of the game's own `Terrain.heightAt()`. It was
accurate and it was not what was wanted. It is now a city that does not
exist, generated into five flat silhouettes plus `public/css/city-sky.css`.

**The lesson that carried over, and it is the expensive one.** Two attempts
were made to give the vector scene painted surfaces: an `feDiffuseLighting`
pass and a multiplied fractal grain. Both were built, judged on screenshots
against the flat version, and reverted. Multiply-blended noise over flat
colour does not read as paint, it reads as dirt. **Vectors are bad at paint
and excellent at silhouette**, so nothing in the scene is shaded and all the
depth comes from three things a browser does well: a value ladder between
bands, haze BETWEEN them rather than over them, and emitted light.

Four traps in that file, all of them found by rendering rather than by
reading, all of them written up in place:

- **One winding direction, every shape.** The whole silhouette is one
  `<path>` and SVG fills with the nonzero rule, so subpaths wound opposite
  ways cancel and leave holes. Roofs read counter-clockwise; a rectangle
  written the natural way reads clockwise. Mixing them looks fine on every
  band except the one with large overlaps, which comes out full of pale
  almond gaps.
- **Bands are staged by lifting the IMAGE, not the element.** Every plate is
  solid to its own bottom edge, so an element floated off the floor cuts that
  solid mass in mid-air and rules a line across the picture. Each band
  reaches the floor and carries a second flat background layer, `--lift`
  tall, continuing its base down.
- **Haze must be tall and faint.** Three short slabs at a quarter strength
  each stack into visible steps. If you can point at where the haze starts,
  it is too short or too strong.
- **The value ladder does the depth, not the haze.** Each band sits about 40%
  of the way from the one in front toward the SKY. Step them 8 levels apart
  and you get four dark bands reading as one dark mass.

`public/js/city.js` does only what CSS cannot: the drift loop distance (one
rendered tile, measured, or the band jumps once a cycle), the scroll offset,
and the petals. Everything it does is motion, so it is optional by
construction and the scene is complete without it.

### The painted upgrade path

Drawn geometry has a ceiling and the two failed filter experiments are the
evidence. So each of the five plates can be replaced by a painting: commit
`public/assets/paint/<name>.webp` and city.js probes it, adds
`painted-<name>`, and city.css swaps that layer alone. Nothing to configure.
`docs/SCENE_ART_BRIEF.md` is what the painter (or an image model) is handed,
and `test/` holds the probe list, the stylesheet and that document to the
same five names plus the same aspect ratios.

### arcade.html is FORKED, and it was silently broken by the redesign

It was byte-identical across all four sister sites and it no longer is. Do
not copy it back over a sister site.

Three of its rules broke on 2026-08-29 and all three the same way: **a rule
that hard-coded the answer instead of asking for the token.** Its lede and
footnote were given a near-white paper plate to sit on; `.ar-top h1` asked
for `--ink`, which is now the darkest thing on a dark page; and `.ar-cab`
reached for `--hud-slot/--hud-ink/--hud-cream`, which hud.css no longer
defines, so every cabinet fell back to its hard-coded browns.

A rule with a literal fallback does not fail when the palette moves, it
drifts, and drift is invisible in review. A note earned on Legal-Leaf and
still true: **a stylesheet that claims in its own header to match another
file, and does not, is worse than one that never claimed it.** Recolour in
one commit.

---

## 8c. The ink layer: everything you hover over becomes brush and ink

The owner's idea, and the best one the site has had: *"leave everything
default, but anything you hover over make this black and white thing. And not
just black and white, I don't want it sterile. I want black and white ink hand
drawn type shit. Every button, everything you hover over."*

**It is the site's own story, not an effect bolted on.** The boot plate is a
brush enso on black; the studio's mark is a brush V inside a brush ring. The
colour world is what the ink lifts to reveal, so peeling a control back to
paper and ink for as long as you touch it is the same idea at the scale of a
button.

Four things together make it read as drawn rather than as a filter, and
dropping any one of them takes it back to a greyscale filter:

| | |
|---|---|
| **Paper, not white** | `#f2efe4` plus `assets/paper.svg` grain, blended `multiply`. A flat `#fff` is a dialog box; paper is a material. |
| **Ink, not black** | `#15120e`, the colour of a dried stroke. |
| **A brush edge** | `assets/ink-frame.svg` through `border-image: … 34 / 3px / 0 round`. A drawn line swells and thins; a border has one width, and one width is what "sterile" means. |
| **The enso on round things** | `assets/enso.svg`, the logo's own gesture, on the map pins. A rectangle's `border-image` squeezed into a circle stops looking drawn. |

`tools/ink.mjs` generates all three assets, zero dependencies, same shape as
`tools/city.mjs`. `brush()` builds **filled geometry, not a stroke**, because a
brush has no single width: the outline is walked out and back with the width
varying along it.

### `/css/ink.css` IS THE LAST STYLESHEET ON EVERY PAGE, and that is the point

Every page here carries a local `<style>` for its own components, and those
sit after the `<link>` to `app.css`, so at equal specificity **the page wins**.
With the ink layer living inside `app.css`, `.ar-top a:hover` kept its jade
text and only the `border-image` came through: a paper tile with green writing
on it. Loading the ink last makes it a layer *over* the site instead of one
more voice in the cascade arguing with the page. `test/ink.test.mjs` asserts
the ordering per page, on the real markup, because nothing about that failure
is visible in a diff.

### Two things that only turn up when you look

- **Ink on a dark plate is not there.** The enso was first drawn on the pin
  anchor, ringing the dot from outside: `#15120e` over the map's near-black
  plate, invisible at every size. The only ground it reads against is the
  paper the dot has just turned into, so it is a background layer *of the dot*,
  sized inside the rim, with the room glyph in the ring the way the leaf sits
  in the mark.
- **Every coloured thing inside a control has to be named.** One jade
  placeholder initial or one orange slot number left on the paper gives the
  whole thing away as a filter rather than a redraw. `.ar-glyph`, `.ar-slot`,
  `.ar-soon`, `.g-noimg`, `.g-oos`, `.g-save`, `.g-zoom` each set their own
  colour and each needed saying.

Gated on `@media (hover:hover)` throughout: a touch device has no way to leave
a hover state, and a control stuck mid-transformation is worse than no
treatment at all.

---

## 8d. The realism pass: what actually made the scene read as real

Owner: *"make this all sexier and cleaner, more realistic, try again on every
single element."* Four findings, and each one is a rule rather than a tweak.

**SHAPE COMPLEXITY IS FREE IN THIS SCENE.** Every blossom is defined once in
`<defs>` and placed with `<use>`. The file's weight is the placements, and a
placement is identical bytes whatever it points at. The old library rationed
detail as if it cost something: a plain circle at the small tiers, a
three-petal flower at the middle one. Both were paying a realism price for a
saving that does not exist. Draw every tier as well as it can be drawn.

**THE PETAL WAS A STAR, and that was the whole confetti problem.** Centre, out
one side, tip, back, with both curves meeting at a point, is a pointed lens;
five of them is a star. A cherry petal is obovate and NOTCHED. Draw a
candidate at sixty units next to the current one before believing any
reasoning about it, including this paragraph.

**AERIAL PERSPECTIVE IS PIGMENT, NOT OPACITY.** The three canopy plates were
separated by CSS opacity. That bleeds the city through the flowers when the
brief is to see it through the GAPS, and flattens the far layer toward
whatever is behind it. `LAYER_PAL(t)` mixes distance in at generate time
against TWO haze targets: wood recedes toward the cool sky and goes nearly all
the way, blossom recedes toward the warm pale the low sun puts in the air.
Mixing blossom toward the blue is what made the far layer dusty mauve.

**A MAP READS THROUGH RELATIONSHIPS, NOT DETAIL.** Buildings gather into
blocks, blocks sit on lanes, lanes run to a bridge because that is where the
river can be crossed, fields take the contour because water does. `quarterPlan()`
builds in that order. Each district has ONE orientation give or take a few
degrees: agreement is what turns marks into streets, and exactness is what
turns them into a circuit board.

Two things that keep coming back and now have tests (`test/copy.test.mjs`):

- **No em dashes in shipped copy.** Four had crept back in, including every
  control hint an opened cabinet prints.
- **The workshop does not talk in front of the customer.** The arcade's empty
  state told a visitor which source file to paste a place id into. The site
  had been cleaned of exactly this once already.

**And the exemption in that test is the part to read.** `collect.html` is the
operator console and neither rule applies to it. Working that out from the
page's robots meta looks right and is wrong: `arcade.html` is also noindex, for
a completely different reason, and has real visitors arriving from the header.
That inference silently exempted the page the test was written for, and it
passed while doing it. Operator pages are NAMED. `noindex` means "do not
crawl", never "nobody reads it".

---

## 8b. The workflow layer, and the sister sites it came from

**The look was finished before the interface was.** The owner's words after
the redesign: *"the UI, like, how it looks is great, but the user experience
needs to be updated."* So the sister sites were read and the patterns each of
them had grown, and this one had not, were brought over.

The seven live sites could not be browsed from the build container: the agent
proxy gateway answers **403 to CONNECT** for every one of those hosts. Their
SOURCE is what the survey read, which is the better artefact anyway when what
you want is the mechanism rather than the pixels.

| Taken from | What it is |
|---|---|
| Herbal Leaf | search wired INTO the facet pool; the photo viewer, with its four fixes |
| Nicotia | the skeleton; the toast; the retry that shows its working |
| Legal Leaf | the shelf explaining WHICH filter is too narrow |
| all of them | URL state, so a filtered shelf is a place you can send |

### The bug the survey found: the shop filter never existed

`pool()` filtered on `it.k` and `counts()` counted `it.shop`. **No product row
has ever carried a `shop` field** -- `api/products.js` emits `k` for the store
key. So `counts()` returned `{}`, `chipRow` saw fewer than two options, its own
"one option is not a choice" rule dropped the row, and the SHOP FILTER WAS
NEVER ON THE PAGE. Nothing errored. On a shelf drawn from fifty shops that was
the filter that mattered most.

`FIELD = { room: 'room', shop: 'k' }` is now read by the filter and by the
counter, so the two cannot disagree again. **A facet's name is not the property
it reads**, and assuming it is has now cost this repo one silently missing
feature.

### `test/shelf.test.mjs` runs grid.js instead of reading it

Every previous guard on the client JS asserted on its SOURCE, which is exactly
why the above could live for the life of the site. Source guards prove a line
is present; only running the thing proves it works. `facetOptions()` and
`pool()` are pure, so the file loads grid.js with `new Function` and calls
them.

**`new Function`, not `node:vm`.** A vm context is a separate realm, so arrays
built inside it have a different `Array.prototype` and every `deepEqual`
against a literal fails with "same structure but not reference-equal" -- a
confusing failure that says nothing about the code under test.

Five mutations were run and all five fail the suite: restoring the shop-facet
bug, turning search from AND into OR, stopping search feeding the facet counts,
`pushState` instead of `replaceState`, and hashing the satchel key.

### Rules the layer holds to

- **Search and the satchel are in `pool()`, not in `draw()`.** They are not
  facets, they are the pool. A shop chip counted against the unsearched
  catalogue promises 214 things and hands over three.
- **Search is tokenised AND.** "hot swap" has to find "Hot-Swap", which a plain
  `indexOf` on the raw query never does. The shop name is in the haystack on
  purpose (typing a maker's name gives you their shelf); the room is not, or
  typing one returns a thousand things.
- **`replaceState`, never `pushState`.** Search runs per keystroke.
- **The satchel key is `k + '|' + url`, never a hash.** A collision puts a
  product somebody never saved into their satchel.
- **Loading beats empty.** Before this, a cold cache showed the words for
  "there is nothing here" for as long as the fetch took, and every door read
  "no answer". A visitor cannot tell slow from empty, and empty is the one that
  makes them leave.
- **The retry shows its working.** "Attempt 2, retrying in 4s" is something a
  person will sit through. An unexplained pause is not.

---

## 9. Kawaii Katz: siblings, no shared code

Decided rather than defaulted. Kawaii Katz is Next.js and this engine is
zero-dep Node, so one shared registry means a cross-framework package nobody has
built. Until somebody does:

- **Separate registries. Hard cross-links.** A kawaii item here carries a rail
  to Kawaii Katz; a merchant that reads as gift shop rather than scene belongs
  over there.
- The four shared merchants (Kawaii Fashion Store, Cozy Kawaii, BestofKawaii,
  BerryKawaii) may legitimately appear on both.

**The mall runs one way.** A gaming and electronics site can point at its sister
sites without a compliance problem; Legal-Leaf cannot point back at the same
audience. Do not add reciprocal links on the assumption they are symmetrical.

---

## 10. Environment variables

| Var | Gates |
|---|---|
| `ADMIN_PASSCODE` | `/api/capture` POST and `?report`, `/api/probe`, and `/api/admin-stats`. **Unset returns 503** — fails closed. |
| `DATABASE_URL` | Neon Postgres: the capture store, the catalogue cache, and `site_events`. Without it captures cannot be stored, every request pays a cold scrape, and `/admin` records nothing. Same provider Herbal Leaf uses. |

The passcode is typed into the collector's panel and used for one request. It is
**never** in the bookmarklet URL, which lives in a bookmarks bar in plain sight
forever, and never on `/collect`, which anybody can load.

---

## 10b. `/admin` — what the site is doing

`public/admin.html` + `/api/events` + `/api/admin-stats` + `/js/events.js`, ported
from Kawaii Katz. `site_events` has the **identical shape** to that site's table,
for the reason `kv` matches Herbal Leaf's: two sites that may share a database
later should not need a reconciliation first.

**It wires itself, and nothing in `grid.js`, `app.js` or `hub.js` was edited.**
Every event comes from a delegated listener on `document`, matching markup those
files already emit: `a[rel~="sponsored"]` is an outbound click, `[data-save]` is a
save, `[data-zoom]` is a zoom, `#gQ` is a search. Delegation is what `grid.js`
already does for save and zoom, for the reason it gives there: the grid re-renders
on every keystroke.

**Those selectors are the contract.** Rename `data-save` in `grid.js` and saves
stop being recorded, silently, with nothing failing. That trade is deliberate,
because analytics must never break the shelf, but it means the check after
touching card markup is `/admin`, not the page.

**The product id is the URL with the query stripped**, which is what
`_capture.js`'s `identity()` already uses, so a product's id here matches its id
in the capture store. Stripping is load-bearing twice: `it.url` arrives from
`row()` already carrying `?ref=` (section 5), and commission paperwork should no
more be copied into an analytics table than into `publicStores()`; and a ref
change would otherwise turn every product into a new row and silently reset its
history.

**An outbound click is the GOAL, not a leak.** It is the only event on this site
that can earn anything, and it is also the last thing observable, because this
site never takes payment. The funnel marks that step `goal` and annotates it as a
win. The Kawaii Katz version printed "lost N here" under it in alarm red, which
read as attrition and had it exactly backwards; the drop-off note also now renders
ABOVE the bar it precedes, because printed underneath it read as a property of the
step it sat under.

**Every funnel step counts DISTINCT `sid`, not events.** A funnel counted in
events lies: one person setting six filters and clicking nothing looks like six
steps of engagement. A session is a TAB, so one person over two visits is two
sessions. Good for shape, wrong for "how many humans", and nothing claims the
latter.

`sid` is a random value in sessionStorage: no IP, no cookie, no fingerprint. That
is also why `/api/events` is not rate limited by IP, since limiting by IP means
holding one. The clamps bound it instead (name allow-list, length caps, 40 events
per request) and a 120-day sweep runs on roughly one request in two hundred.

**`/api/events` and `/api/admin-stats` need `no-store` in `vercel.json`.** The
catch-all `/api/(.*)` rule sets `s-maxage=600`, which on the stats endpoint would
serve one operator's numbers to the next reader from the CDN.

`admin.html` links `/css/ink.css` last like every other page (section 8c), and
`test/ink.test.mjs` caught it when it did not.

### The datastore is Neon, and the one dependency is the driver

The first cut used Upstash Redis, copied from Nicotia's catalogue cache. That was
a copy of the wrong sister. Herbal Leaf already runs Neon, the owner already has
it, and a second datastore for one table is a second thing to pay for and forget
the credentials of.

It is also the better fit on the merits. **Captures are evidence, not cache.**
They are what you go back to in six months to answer "why does this merchant have
these four product types in its include list", and a store whose entire design is
"this will expire" is the wrong shape for that.

`@neondatabase/serverless` is the only dependency in the repo. That costs the
"zero dependencies" line the sister sites carry, and it is worth being precise
about what that line was protecting: **the load-bearing property is NO BUILD
STEP**, which is what broke Legal-Leaf's deploy and produced the "No Next.js
version detected" failure. Installing a package is not a build step. `vercel.json`
still has `framework: null` and `buildCommand: null`; Vercel installs
dependencies for the serverless functions and serves `public/` untouched.

The alternative was hand-rolling Neon's SQL-over-HTTP wire format with plain
`fetch`, which does work and would have kept the count at zero. It was rejected
because it means owning a private protocol contract Neon can change under us, to
save one 130KB dev-time install. That is the trade this repo keeps warning about
in the other direction.

**Three tables, created on demand** (`CREATE TABLE IF NOT EXISTS`, memoised per
instance). Herbal Leaf runs Drizzle migrations and that is right for Herbal Leaf,
which has a build step and a dozen tables; a migration toolchain to manage three
would be the heavier half of the trade.

- `kv` — the catalogue cache. **Deliberately the same shape as Herbal Leaf's**
  (`k text primary key, v text, expires_at bigint`) so the two sites could share
  a database later without a reconciliation.
- `capture_products` — **one row per product, not one blob per merchant.** The
  blob version forced a read-modify-write on every page captured, so two tabs
  capturing two pages of the same shop would race and the loser's page would
  vanish silently. A row per product makes the merge an UPSERT: atomic, and no
  read half at all. It also sidesteps the SQL-over-HTTP response ceiling, which
  "capture everything, filter never" would eventually hit — we keep raw per-card
  HTML, and a 1,200-product shop is megabytes.
- `capture_pages` — what was captured and, more usefully, what it admits it did
  not see.

`product_type` is lifted out of the jsonb into its own indexed column, because
the histogram is the thing you read before writing an `include` list. Left inside
the jsonb it would be a sequential scan on every report.

---

## 10b. Pre-launch posture, and the checklist that undoes it

**`robots.txt` currently blocks the entire site**, and that is deliberate. Two
facts make it right today and both stop being true on the same day:

1. **Nothing is published.** Every room says "nothing is stocked yet". Letting
   Google index that spends the first impression on every URL selling an empty
   shop.
2. **The domains have landed.** `verdastudio.store` is canonical, because
   the site is Verda Studio; `verdacultivation.store` is the game's name and
   308s to the studio via a host-matched redirect in
   `vercel.json`. The address is written down in ONE place,
   `SITE` in `tools/sitemap.mjs`; swapping which domain is canonical
   means changing that constant AND the redirect together, or you get
   a loop. The old note follows, kept because the reasoning still
   applies to any future preview URL:

   **`gaming-dungeon.vercel.app` is a deploy URL, not a domain.** If it gets
   indexed and a real domain lands later, the two compete — duplicate content,
   split signal, and a canonical mess far more work to unpick than to prevent.

Blocking costs nothing while there is nothing to index. **But a `Disallow: /`
nobody remembers to remove is a site that quietly never gets traffic, and the
symptom — "our SEO isn't working" — points nowhere near that file.** So:

### Launch checklist

1. A real domain is live **and** at least one merchant is published.
2. Paste the LAUNCH block at the bottom of `public/robots.txt` over the rest.
3. `SITE_URL=https://the-real-domain npm run sitemap`.
4. Check `/sitemap.xml` lists what you expect and nothing `noindex`.
5. Update the `Sitemap:` line to the real domain.
6. Update `og:url` and `og:image` in `index.html`, `disclosure.html`,
   `privacy.html` and `terms.html` to the real domain, **and** `SITE` in
   `tools/sitemap.mjs`. A test fails if those two disagree, so this step
   cannot be half-done (§10c).

`npm run sitemap` **generates** `public/sitemap.xml` from two real sources — the
rewrites in `vercel.json` and the pages in `public/` — because a hand-written
sitemap is a third list to keep in step, and this repo has been bitten twice by
exactly that (`server.mjs`'s API map, the `/api/capture` usage block). A page
whose own `<meta name="robots">` says `noindex` is **never** listed: the page's
head is the authority, so `/collect` and `/arcade` cannot be re-added by
accident. `test/server.test.mjs` checks the committed sitemap against the
running server and fails if it is stale.

### The three policy pages, and why they were written last

`/disclosure`, `/privacy`, `/terms`. Written **after** auditing what the site
actually does, because a boilerplate policy describing cookies we do not set is
not harmless padding — it is a false statement about our own conduct, and the
kind that survives for years because nobody re-reads a policy page.

The audit deleted more than it documented. **`api/subscribe.js` and
`api/track.js` were inherited from Nicotia and nothing on this site called
either** — `source: 'nicotia-market'`, env vars named `NM_*`. `subscribe`
accepted an email address on a public unauthenticated endpoint and forwarded it
to whatever `NM_CRM_WEBHOOK` pointed at: a spam relay waiting for somebody to
set the variable. **A public PII intake nobody uses is a liability, not an
asset.** Both deleted. If a newsletter is wanted later, build it then, with this
site's own naming.

What survived the audit is a genuinely short surface, and the policy says so: no
accounts, no cookies, no analytics, one `localStorage` key for the arcade high
score (`gd_arcade_invaders`, never sent anywhere), and three third parties who
see an ordinary request — Google Fonts, Vercel, Neon. Neon holds merchant
catalogues and not one field about a person.

`test/server.test.mjs` **checks the policy against the code**: no `document.cookie`
write, no analytics snippet, exactly one storage key and the policy must name it,
and no `api/*.js` may read `body.email`. A policy that drifts from the code now
fails a test rather than sitting there being wrong.

**`/disclosure`** is the affiliate disclosure, and it is the one compliance
obligation here with teeth outside our own codebase. It states plainly that
roughly half the links pay us and half do not, that the price is identical
either way, that money buys neither position nor inclusion, and that the
merchant's own checkout is always the truth on price. Every outbound product
link carries `rel="nofollow sponsored"` **whether or not that merchant pays us**
— sorting the disclosure by our own convenience is how disclosure stops meaning
anything. A test asserts the page serves and that the front page links it.

---

## 10c. Brand assets: all of them are generated

`npm run branding` rebuilds **every** raster from `public/assets/mark.svg`:

```
public/favicon.ico              16 + 32 + 48, BMP payloads
public/assets/icon-192.png      manifest, purpose "any"
public/assets/icon-512.png      manifest, purpose "any"
public/assets/icon-maskable-192.png   manifest, purpose "maskable"
public/assets/icon-maskable-512.png   manifest, purpose "maskable"
public/assets/apple-touch-icon.png    180, opaque
public/assets/og.png            1200x630 share card
public/manifest.webmanifest     the manifest itself
```

**Never hand-edit any of them.** This is Herbal-Leaf's rule (`scripts/branding.py`,
its own hard "do not") and it is not tidiness: a hand-made favicon is a fork of
the logo that nobody can see is a fork. The mark changes, the SVG in the `<link>`
updates, and the `.ico` in the tab goes on showing last year's artwork for as
long as anybody's browser has it cached. `test/branding.test.mjs` regenerates
every asset in memory and **compares bytes**, so a hand-edit and a forgotten
`npm run branding` both go red.

**`tools/branding.mjs` is not an SVG renderer and must not be treated as one.**
There is no cairosvg, no rsvg-convert, no ImageMagick and no headless browser on
the machines this repo is worked on, and the whole dependency list is one
Postgres driver — adding a rendering stack to make eight small squares would be
the heaviest thing here by an order of magnitude. It gets away with reading the
rects straight out of the SVG because the mark is *only* axis-aligned `<rect>`s
on a 32px grid, with no curves, paths, gradients or text. `parseMark()`
**throws** on anything else rather than skipping it, so adding a `<path>` to the
mark fails the build loudly instead of quietly shipping an icon with a shape
missing. If the mark ever needs one, teach this file — do not work around it.

**Two families of icon, and neither substitutes for the other.** A `maskable`
icon is cropped by the platform to whatever shape it likes, and only the centre
circle of 80% diameter survives; the mark's corners sit at 46% from centre,
outside it. So the maskable pair is drawn inset at 19% on a full-bleed plate,
and the plain pair keeps its transparent rounded corners. Ship only maskable and
desktop shows a small mark adrift on a big square; ship only `any` and Android
clips the coin door. The apple-touch icon is opaque for a third reason: iOS
never reads the manifest and never honours alpha, and would composite our
transparent corners onto black — *nearly* our background, which is what lets
that bug survive review.

`favicon.ico` lives at the **root**, not in `assets/`. The `<link>` tags settle
it for browsers; `/favicon.ico` is still requested blind by crawlers, unfurlers
and feed readers that never parse a head, and a 404 there is the one icon
failure nobody ever sees in their own tab. Its payloads are **BMP, not PNG**:
the only reason to ship `.ico` at all is the clients that ignore
`<link rel="icon">`, and those are the same clients that predate PNG-in-ICO.

The manifest is generated for the same reason the sitemap is, and its colours
are read from `--bg` in `tokens.css` rather than restated — `background_color`
paints the splash screen and `theme_color` paints the status bar, both are the
site's ground by definition, and a hardcoded copy would drift silently and only
on installed devices. `render()` warns if `mark.svg`'s plate and `--bg` disagree.

### The share card, and the font that had to exist for it

`public/assets/og.png` is 1200x630 because that is the frame Discord, iMessage,
Slack and the timeline all crop into, and it is **fully opaque** because about
half of those clients put the card on white. Without it every link to this site
unfurls as a grey rectangle with a line of text in it, which for a mall shared
in group chats is most of how anybody would have arrived. Like every icon
failure it looks fine to us: we are the only people who never see our own links
unfurl.

**It needed type, and there is nothing here to set type with** — no rasteriser,
no font loader, no canvas. Press Start 2P, the face the site already uses for
headings, is a bitmap font pretending to be a webfont, so the honest way to
reproduce it is a bitmap font: `FONT` in `tools/branding.mjs` is 5x7 cells drawn
as strings, scaled by **whole numbers only** (fractional scaling is what makes
pixel type look like a mistake). It is uppercase, digits and punctuation, and
`drawText` **throws** on a glyph it does not have — the same posture as
`parseMark`, and for the same reason: a card reading `GAMING DUNGEN` would ship
and nobody here would ever see it. Writing the tests found two missing glyphs
that way, `+` among them, on a site whose three sister links are all 21+.

The layout is **derived from the content**, not placed by hand. The first
version used six hand-tuned numbers and sat 30px low, which is invisible until
the card is next to somebody else's in a channel. Change the tagline or a type
size and it re-centres; a tagline too wide for the card throws rather than
running off the edge.

`og:image` and `og:url` **cannot be relative** — no unfurler resolves one — so
they hardcode a host, in four HTML files, and `tools/sitemap.mjs` hardcodes it
in a fifth place. `test/branding.test.mjs` fails if they disagree, because the
drift lands on the day a domain is bought and the symptom is a card that goes on
loading from the old deploy, looking perfectly fine until that deploy is
deleted. SVG is not an option however tempting: no major unfurler accepts
`image/svg+xml` for `og:image`.

`/collect` gets the icons but **no `<link rel="manifest">`**: `start_url` is
`/`, so an install prompt fired from the operator tool would install the
storefront, which is a confusing thing to offer somebody who came here to paste
a passcode. `arcade.html` is byte-identical across all four sister sites and was
not touched.

## 11b. `test/ingest.test.mjs` runs the whole money path

Every other test here reads source or calls one function. This one drives the
real chain on a fake shop:

```
reviewed summary  ->  publishable() lets the store through
fake products.json ->  the Shopify strategy maps it
include / roomMap ->  the human's decisions are applied
_scene.js         ->  what is left gets a room, or is refused
buildAff()        ->  the surviving URLs carry the tracking code
respond()         ->  the payload the grid receives
```

**That chain had four bugs no unit test caught**, because every one was a
mechanism that existed and was never called: `buildAff` uninvoked,
`include`/`roomMap` unread, `row()` discarding the classifier's refusal, and the
dev server not serving the endpoints. Running the whole thing is the only kind
of test that finds those.

No network, no database: `fetch` is replaced with a fake shop and `_stores.js`
with a one-merchant registry. **Mocking the registry rather than adding a test
hook to it is deliberate** — production code carrying scaffolding for its own
tests is what this repo keeps deleting from inherited files. It needs
`--experimental-test-module-mocks`, which `npm test` passes; if a future Node
drops the flag this fails loudly with "bad option", which is the right way for
it to break.

### It was mutation-tested, and that caught a vacuous assertion

A suite that passes on a chain you just claimed had four bugs deserves suspicion,
so each fix was reverted in turn to confirm the test fails. Three did. **The
`roomMap` assertion did not** — it used the t-shirt, and the classifier already
puts a shirt in the wardrobe, so it passed with `roomMap` disabled entirely. It
proves the ordering fix, not `roomMap`.

The fixture now carries a coiled USB-C cable typed `Accessories`: the classifier
files it under `power`, correctly in general, and this merchant's summary maps
Accessories to `battlestation`. Disabling `roomMap` now fails.

**An assertion that cannot fail is worse than no assertion, because it is
counted.** If you add a case here, revert the code it guards and watch it go red
before you trust it.

---

## 11. Verify before you merge

1. `npm test` — 109 cases. The collector test parses the assembled program with
   `new Function`, which is the point of having it: a syntax error there does
   not fail locally, it fails silently on a stranger's website with no error
   event.
2. `npm run dev`, load `/`. Confirm the map renders and the empty states say
   what is actually true.
3. Touching the collector: re-drag the self-contained bookmarklet. The build
   stamp in the panel must match the one on `/collect`. **A stale collector does
   not throw** — it returns a smaller catalogue that looks entirely plausible.
4. Touching `_scene.js`: add a test case in the same commit.
5. Touching `mark.svg`: `npm run branding` in the same commit, and eyeball
   `icon-512.png`, `icon-maskable-512.png` and `og.png`. The byte-compare test
   proves they were regenerated; only a human can see that they still look like
   a coin door (§10c).

---

## 12. Hard "do not" list

- Do NOT clear a `pending` flag without a committed capture. The gate will
  refuse it anyway, which is the point, but do not go looking for the bug.
- Do NOT publish both Portable Monitor domains (§5).
- Do NOT GET-request a link carrying `?ref=` (§5).
- Do NOT broaden a `_scene.js` pattern to make a room look fuller (§6).
- Do NOT copy Kawaii Katz's `CUT_PHRASES` into this site (§6).
- Do NOT add Next.js, Vite or any build step (§2).
- Do NOT hardcode a route in `server.mjs` (§3).
- Do NOT import `_stores.js` from anything that reaches a browser (§2).
- Do NOT put the admin passcode in the bookmarklet or on `/collect` (§10).
- Do NOT let `/api/` become crawlable; a crawl costs a live scrape of every shop.
- Do NOT add the age gate back to `arcade.html` (§7).
- Do NOT add a bare `fetch()` to `_scan.js`; go through `get()` (§4b).
- Do NOT weaken or bypass the robots.txt check to make a scan reach more (§4b).
- Do NOT raise the 300-request cap without a reason written down beside it (§4b).
- Do NOT put a backtick anywhere inside `captureSource` or `scanSource`,
  comments included (§4b).
- Do NOT build a second card component for the preview (§6b).
- Do NOT let the preview endpoint feed `/api/products` or any public page (§6b).
- Do NOT reintroduce `isApparel()` or any global apparel/merch filter — it would
  empty the Wardrobe and half the Vault (§6c).
- Do NOT let `row()` stop honouring `''` from `classify()` (§6c).
- Do NOT add to `MULTIWORD` from guesswork; grow it from captures (§6c).
- Do NOT make `draft()` fill in `reviewedBy`, and do NOT drop the gate's check
  for it. That pairing is the only thing keeping the generator from turning the
  gate into a rubber stamp (§4).
- Do NOT resolve `data/captured/` at import time; `capturedDir()` reads cwd per
  call, after a frozen constant made two tests pass for the wrong reason (§4).
- Do NOT stop `row()` calling `buildAff()`, and do NOT move link-building into
  the browser to shrink the payload. That is how every card shipped unattributed
  once already (§5).
- Do NOT let `include` / `roomMap` stop being applied in `row()` (§4).
- Do NOT open `robots.txt` before a real domain AND a published merchant, and
  do NOT forget to (§10b). Both failure directions are quiet.
- Do NOT hand-edit `public/sitemap.xml`; run `npm run sitemap` (§10b).
- Do NOT accept a draft's `include` list without reading its `(none)` row. A
  mostly-untyped catalogue needs `include: []`, and the proposal will instead
  publish its typed minority silently (§5b).
- Do NOT add `warranty` to `NONPRODUCT`; it belongs in `NONPRODUCT_TYPE`, matched
  on the type alone (§5b).
- Do NOT add an endpoint that reads `x-gd-admin-token` without a `no-store` rule
  for it in `vercel.json`. The `/api/(.*)` cache rule wins over the handler's own
  header (§4c).
- Do NOT let `/api/probe` fill in `reviewedBy`, and do NOT add a mode that writes
  `data/captured/`. It is the shortest path from "nobody read this shop" to "this
  shop is on the shelf", and the blank field is what keeps a person on it (§4c).
- Do NOT re-implement the `include`/`roomMap` arithmetic for a second reader;
  call `analyse()` (§4c).
- Do NOT hand-edit a PNG, the `.ico` or `manifest.webmanifest`; edit
  `public/assets/mark.svg` and run `npm run branding` (§10c).
- Do NOT add a `<path>`, gradient or text to `mark.svg` without teaching
  `tools/branding.mjs` to draw it. It throws on purpose (§10c).
- Do NOT point `<link rel="manifest">` at `/collect` or any operator page (§10c).
- Do NOT point `og:image` at an SVG, and do NOT make it relative. No unfurler
  accepts either (§10c).
- Do NOT let `drawText` skip a glyph it does not have. It throws so that a
  missing letter fails the build instead of shipping on every shared link (§10c).
- Do NOT let a test derive its subject list from the flag it is checking. The
  opacity test did, so deleting `plate: true` removed the file from the test
  instead of failing it; a mutation run caught it (§10c).
- Do NOT drop `rel="nofollow sponsored"` from a card because that merchant has
  no code filled in (§10b).
- Do NOT add analytics, a cookie, a newsletter or an endpoint that reads
  personal data without rewriting `/privacy` in the same commit. Tests enforce
  the pairing (§10b).
- Do NOT copy `api/subscribe.js` or `api/track.js` back from a sister site
  (§10b).
- Do NOT link a stylesheet, or open a `<style>`, after `/css/ink.css` on any
  page. It has to keep the last word or the hover treatment half-applies (§8c).
- Do NOT draw ink on anything but paper. `#15120e` on the site's own grounds is
  invisible, and it fails silently (§8c).
- Do NOT add a control to the site without adding it to the one hover list in
  `ink.css`, descendants and all (§8c).
- Do NOT ration shape detail in `tools/city.mjs` to save bytes. The `<use>`
  placements are the file; the `<defs>` are free (§8d).
- Do NOT separate the canopy plates with CSS opacity again. Distance is mixed
  into the pigment by `LAYER_PAL` (§8d).
- Do NOT infer "operator page" from `noindex` in `test/copy.test.mjs`.
  `arcade.html` is noindex and has visitors (§8d).
- Do NOT stretch an absolutely positioned scrim past the viewport to escape the
  page rail. `overflow-x:hidden` on body hides the overflow, it does not remove
  it, and the document ends up twice its own width. Position it fixed (§8d).
