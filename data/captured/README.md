# data/captured — the publish gate

One file per merchant, named `<key>.json`, where `<key>` is the `key`
field in `api/_stores.js`.

**A merchant with no file here cannot be published, whatever its
`pending` flag says.** `publishable()` in `api/_capture.js` enforces
it, and that is deliberate: `pending: false` is a one-word edit
anybody can make in a text editor at midnight, and making it is
exactly how all three sister sites shipped a catalogue nobody had
read. A committed file is a gate somebody had to deliberately walk
through, and the walking through shows up in a pull request.

## How a file gets here

1. Open the merchant in your own browser.
2. Run the collector bookmarklet from `/collect`. Capture every page
   of the grid; they merge into one record.
3. `GET /api/capture?report=<key>` with the admin passcode. Read
   `readThisFirst` before anything else — a capture holding 24 of
   1,180 products looks exactly like a small catalogue.
4. When you understand what the merchant stocks, write the summary
   here and commit it.

## What goes in the file

The summary, not the raw capture. Raw captures are large and churny
and live in KV; this is the reviewed conclusion, and it is here so
that six months from now "why does this merchant have these four
product types in its include list" has an answer in the repo rather
than in a cache that expired in April.

```json
{
  "key": "goretrogame",
  "reviewedOn": "2026-08-24",
  "reviewedBy": "who looked at it",
  "products": 214,
  "claimedTotal": 214,
  "partial": false,
  "platform": "shopify",
  "productTypes": [["Consoles", 88], ["Games", 74], ["Accessories", 52]],
  "include": ["Consoles", "Games", "Accessories"],
  "roomMap": { "Accessories": "battlestation" },
  "priceRange": { "min": 4.99, "max": 389.0, "mean": 47.2 },
  "notes": "Grid lazy-loads; captured across 9 pages. No gift cards in the feed."
}
```

`include` and `roomMap` are the two fields the ingest will read. Write
them from the histogram above them, never from a guess: no `include`
fills a room with teaware and gift cards, and a guessed one matches
nothing and reads as a merchant who sells nothing.
