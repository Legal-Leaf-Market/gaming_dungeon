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
package.json     Node >= 18, zero dependencies, "type": "module".
api/
  _stores.js     THE REGISTRY. 54 merchants + prospects + rejections.
  _scene.js      ONE RULE: which room, or '' for "we don't carry it".
  _capture.js    The capture store, and THE PUBLISH GATE.
  products.js    The scraper, ported from Nicotia. SEE ITS PORT NOTES.
  capture.js     POST a capture · ?report=<key> · ?worklist
  collector.js   Generates the bookmarklet from typed source.
  track.js       Event sink.
public/
  index.html     The dungeon. Markup only.
  css/tokens.css Family design system, our accent (§8)
  css/app.css    Components
  js/app.js      Engine: the map, rooms, cards, empty states
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
4. Write the reviewed summary to `data/captured/<key>.json` and commit it.
   `data/captured/README.md` has the shape.
5. Only now clear `pending`.

`GET /api/capture?worklist` is public and says what is left. It carries no
rates, no cookie windows and no affiliate codes.

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
| `KV_REST_API_URL` / `KV_REST_API_TOKEN` | The capture store, and the catalogue cache. Without them captures cannot be stored and every request pays a cold scrape. |

The passcode is typed into the collector's panel and used for one request. It is
**never** in the bookmarklet URL, which lives in a bookmarks bar in plain sight
forever, and never on `/collect`, which anybody can load.

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
- Do NOT clear the nicotine-shaped leftovers in `products.js` off the to-do list
  without doing them — read its PORT NOTES header. They must come out **before
  the first `pending` flag is cleared**, because the gate is what is currently
  standing in for that work.
