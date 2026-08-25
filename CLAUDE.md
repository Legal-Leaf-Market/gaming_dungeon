# CLAUDE.md — Operating guide for Gaming Dungeon

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
test/            node --test. No framework.
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

## 3. Routing — ONE file

Legal-Leaf keeps routes in **both** `vercel.json` and a hardcoded map in
`server.mjs`, and its own guide documents an outage caused by the two drifting
apart. **We do not do that.** `server.mjs` parses `vercel.json` at startup. Add
a route there and the local preview picks it up. Never hardcode a route in
`server.mjs`.

`cleanUrls: true` means `public/foo.html` serves at `/foo`. Every room URL
(`/vault`, `/workshop`, `/battlestation` …) rewrites to `index.html` and the
room is chosen client-side from the path.

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

`GET /api/capture?worklist` is public and says what is left. It carries no
rates, no cookie windows and no affiliate codes. On `/collect` each shop is a
link and each key copies on click — **bare domains, never the `?ref=` version**,
because walking the list through tracked links would manufacture 54 fake clicks
against the owner's own conversion stats.

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

## 8. The design system is shared — do not drift it

`public/css/tokens.css`. **Shared across all sister sites:** `--gold #f0b93c`,
`--red #ef5350`, and the three font families (Fraunces / Cormorant Garamond /
Jost). Change one here and you must change it on the other four, or the family
stops looking like a family — and these sites cross-link, so the seam shows.

**Ours alone** is the accent slot: `--arcade`, a CRT violet, mapped onto
`--accent`. Legal-Leaf uses a cold blue, Nicotia tobacco amber, Herbal-Leaf
terracotta. Shared components reach for `--accent` and never for the
site-specific name, which is what lets `arcade.html` be byte-identical across
sites.

The Google Fonts request is byte-identical to the sisters' on purpose: a visitor
crossing between them gets a cache hit.

A note earned on Legal-Leaf: **a stylesheet that claims in its own header to
match another file, and does not, is worse than one that never claimed it.**
Its market pages were recoloured and `tokens.css` was not, so `/library` painted
itself in the old palette for weeks. Nothing errored. Recolour in one commit.

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
| `ADMIN_PASSCODE` | `/api/capture` POST and `?report`. **Unset returns 503** — fails closed. |
| `DATABASE_URL` | Neon Postgres: the capture store and the catalogue cache. Without it captures cannot be stored and every request pays a cold scrape. Same provider Herbal Leaf uses. |

The passcode is typed into the collector's panel and used for one request. It is
**never** in the bookmarklet URL, which lives in a bookmarks bar in plain sight
forever, and never on `/collect`, which anybody can load.

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

## 11. Verify before you merge

1. `npm test` — 23 cases. The collector test parses the assembled program with
   `new Function`, which is the point of having it: a syntax error there does
   not fail locally, it fails silently on a stranger's website with no error
   event.
2. `npm run dev`, load `/`. Confirm the map renders and the empty states say
   what is actually true.
3. Touching the collector: re-drag the self-contained bookmarklet. The build
   stamp in the panel must match the one on `/collect`. **A stale collector does
   not throw** — it returns a smaller catalogue that looks entirely plausible.
4. Touching `_scene.js`: add a test case in the same commit.

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
