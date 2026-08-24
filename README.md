# Gaming Dungeon

An affiliate storefront for the scene: retro and arcade, tabletop, gaming,
battlestation, PC and 3D printing, audio, power, collectibles and apparel.
A room to wander, not a search box. Plus an arcade.

Sister site to [Legal-Leaf Market](https://legal-leafmarket.com),
[Herbal Leaf Market](https://herballeafmarket.com),
[Nicotia Market](https://nicotiamarket.com) and
[Kawaii Katz](https://www.kawaiikatz.com) — the last of which is the little
sister to this one.

## Running it

```
npm run dev      # http://localhost:3000, api/ included
npm test         # 23 cases, no framework
npm run worklist # what still needs capturing
```

Node >= 18. No dependencies, no build step, no bundler.

## The one thing to know before editing

**Every merchant ships `pending`, and clearing that flag publishes nothing.**
A merchant reaches a shelf only when a reviewed capture is committed to
`data/captured/<key>.json`. Read [CLAUDE.md §4](CLAUDE.md) before touching the
registry; the whole repo is built around that inversion.

Current state: **54 merchants registered, 0 captured, 0 published.** The arcade
is open.
