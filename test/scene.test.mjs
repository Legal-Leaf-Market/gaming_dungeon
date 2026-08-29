/* Tests for _scene.js, the one rule that decides what the dungeon
   carries and which room it goes in.
   ------------------------------------------------------------
   EVERY CASE HERE IS A CLAIM ABOUT A REAL FAILURE MODE, not a
   restatement of the regex. A test that asserts "the pattern that
   matches 'dice tower' matches 'dice tower'" passes forever and
   catches nothing. The cases below are the ones where the
   classifier could plausibly be wrong and nobody would notice:
   room collisions, off-scene goods riding in on a general
   dropshipper's feed, and the non-products that render as a card
   with a price on it. */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify, ROOMS_META } from '../api/_scene.js'

const st = { key: 'x', room: 'play' }
const room = (name, blob = '') => classify(st, name, blob)

test('non-products are refused, not filed', () => {
  /* Each of these renders as a card with a price on it if nothing
     stops it. "Shipping Protection $2.99" on a shelf is the tell. */
  for (const junk of [
    'Gift Card', '$50 eGift Card', 'Shipping Protection',
    'Route Package Protection', 'Extended Warranty - 2 Year',
    'Donation to charity', 'Store Credit',
  ]) assert.equal(room(junk), '', `should refuse: ${junk}`)
})

test('off-scene goods from a general dropshipper are refused', () => {
  for (const junk of [
    'Stainless Steel Air Fryer 5L', 'Heavy Duty Garden Hose 50ft',
    'Memory Foam Mattress Topper', 'Premium Dog Bed Large',
    'High DA Backlinks SEO Package',
  ]) assert.equal(room(junk), '', `should refuse: ${junk}`)
})

test('a braided PSU cable sleeve is NOT refused as a garden hose', () => {
  /* The reason OFF_SCENE names `garden hose` and never bare `hose`.
     A room full of PC parts is exactly where a loose pattern bites. */
  assert.notEqual(room('Braided PSU Cable Sleeve Kit'), '')
})

test('tabletop wins the words battlestation and play would steal', () => {
  assert.equal(room('Resin Dice Tower'), 'tabletop')      // not a PC "tower"
  assert.equal(room('Neoprene Battle Mat 6x4'), 'tabletop') // not a "mat" for a mouse
  assert.equal(room('Warhammer 40k Miniatures Bundle'), 'tabletop')
  assert.equal(room('MTG Booster Box'), 'tabletop')
})

test('retro vocabulary reaches the arcade room, not play', () => {
  assert.equal(room('Arcade Cabinet 2-Player Upright'), 'arcade')
  assert.equal(room('Sanwa JLF Joystick'), 'arcade')
  assert.equal(room('SNES Cartridge Cleaner'), 'arcade')
  assert.equal(room('Retro Handheld Console 400 Games'), 'arcade')
})

test('the desk fills battlestation', () => {
  assert.equal(room('Ficmax Ergonomic Gaming Chair'), 'battlestation')
  assert.equal(room('65% Hot-Swap Mechanical Keyboard'), 'battlestation')
  assert.equal(room('15.6" Portable Monitor 1080p'), 'battlestation')
  assert.equal(room('XL Deskmat'), 'battlestation')
})

test('the workshop takes parts and printers', () => {
  assert.equal(room('ANYCUBIC Kobra 3 3D Printer'), 'workshop')
  assert.equal(room('PLA Filament 1kg Black'), 'workshop')
  assert.equal(room('2TB NVMe SSD'), 'workshop')
})

test('audio and power do not bleed into each other', () => {
  assert.equal(room('Fosi Audio BT20A Amplifier'), 'audio')
  assert.equal(room('Closed-Back Studio Headphones'), 'audio')
  assert.equal(room('20000mAh Power Bank'), 'power')
  assert.equal(room('100W GaN Charger'), 'power')
  /* A speaker CABLE is audio's, not power's: the room is decided by
     what it is for, and the audio patterns run first for that reason. */
  assert.equal(room('Speaker Cable 2x4mm 5m'), 'audio')
})

test('the vault takes collectibles, the wardrobe takes clothes', () => {
  assert.equal(room('Nendoroid Hatsune Miku'), 'vault')
  assert.equal(room('Chainsaw Man Vol. 1 Manga'), 'vault')
  assert.equal(room('Blind Box Series 3'), 'vault')
  assert.equal(room('Kawaii Pastel Hoodie'), 'wardrobe')
  assert.equal(room('Fairy Kei Pleated Skirt'), 'wardrobe')
})

test('a fairy-kei skirt is NOT filtered out', () => {
  /* Kawaii Katz deletes these on purpose: it is a kid-safe site and
     `pleated skirt`, `thigh high` and `lace up` are in its
     CUT_PHRASES. On a sample of twelve typical decora items, seven
     were dropped. That filter is right for that site and wrong for
     this one, and copying it across is a mistake somebody will be
     tempted to make because the vocabulary overlaps. */
  for (const s of ['Pleated Skirt', 'Thigh High Socks', 'Lace Up Boots', 'Chiffon Blouse']) {
    assert.notEqual(room(s), '', `${s} must not be dropped on this site`)
  }
})

test('the title beats the blob when they disagree', () => {
  /* Kawaii Katz found the mirror of this the hard way: its filter
     read the product NAME only, so sugarhai's bikinis — named
     "Kawaii Maneki Neko", with the garment only in product_type —
     scored 0 out of 447. Both are read here, title first. */
  assert.equal(room('Resin Dice Tower', 'product_type: Home Decor'), 'tabletop')
})

test('a product read from neither falls back to the store room, not to nothing', () => {
  /* Dropping an unreadable title would silently shrink every
     catalogue by whatever share of its titles happen to be terse. */
  assert.equal(room('Bundle #4'), 'play')
  assert.equal(classify({ key: 'y', room: 'vault' }, 'Item 22'), 'vault')
})

test('an empty title is refused', () => {
  assert.equal(room(''), '')
  assert.equal(room('   '), '')
})

test('what a thing IS beats what it is ABOUT', () => {
  /* A REAL MISS, not a hypothetical. "Retro Gaming T-Shirt" filed
     under the Arcade Floor because `retro gaming` matched before
     anything looked at `t-shirt`. It is a shirt. A room of arcade
     cabinets with a t-shirt in it is wrong in the quiet way: it
     renders, it is plausible, and only somebody who came for a
     cabinet notices.

     Fixed by putting wardrobe and vault above the three theme rooms.
     These cases pin BOTH halves — the garment wins, and the theme
     rooms still keep everything that is genuinely theirs. */
  assert.equal(room('Retro Gaming T-Shirt'), 'wardrobe')
  assert.equal(room('Zelda Hoodie'), 'wardrobe')
  assert.equal(room('Arcade Cabinet 2-Player Upright'), 'arcade')
  assert.equal(room('SNES Cartridge Cleaner'), 'arcade')
  assert.equal(room('Retro Handheld Console 400 Games'), 'arcade')
  assert.equal(room('65% Hot-Swap Mechanical Keyboard'), 'battlestation')
  assert.equal(room('Steam Key Bundle'), 'play')
})

test('every room the registry can name has display metadata', async () => {
  /* A room key in _stores.js with no entry in ROOMS_META renders as a
     blank door on the map. Cheap to assert, invisible if it breaks. */
  const { STORES, ROOM_ORDER } = await import('../api/_stores.js')
  const known = new Set(ROOMS_META.map(r => r.key))
  for (const k of ROOM_ORDER) assert.ok(known.has(k), `ROOMS_META is missing "${k}"`)
  for (const s of STORES) assert.ok(known.has(s.room), `${s.key} sits in unknown room "${s.room}"`)
})

test('a non-product TYPE is refused, and the test actually fires', () => {
  /* NONPRODUCT_TYPE HAD NEVER FIRED, ON ANY CALLER, SINCE IT WAS
     WRITTEN. It is anchored ^...$ and was tested against the whole
     blob -- title, variant, tags and description joined together --
     so it could only ever have matched a product whose entire text
     was the single word "fee".

     Found on a real merchant: a 3D printing shop whose feed carries
     97 products of type "Warranty" and 3 of type "Service". All 100
     were being filed into the Workshop, where they would have been
     the largest category in the room -- a shelf of warranty
     certificates with prices on them.

     classify() now takes product_type as its own argument. */
  const st = { key: 'shop', room: 'workshop' }
  for (const type of ['Warranty', 'warranty', 'Service', 'Gift Card', 'Fee', 'Shipping']) {
    assert.equal(classify(st, 'Anything At All ' + type, type + ' Some Vendor', type), '',
      'a product whose type is "' + type + '" must be refused')
  }
})

test('warranty is refused on the TYPE and never on the description', () => {
  /* THE BROAD-REGEX TRAP, which this repo has a standing rule about.
     Half the printers in that catalogue mention a warranty in their
     copy, so putting `warranty` in the description-reading NONPRODUCT
     list would have hidden real machines while looking like a fix. */
  const st = { key: 'shop', room: 'workshop' }
  assert.equal(
    classify(st, 'Bambu Lab X1 Carbon 3D Printer',
      '3D Printer ships with a 1 year warranty included', '3D Printer'),
    'workshop',
    'a real printer whose description mentions a warranty must survive')
})

test('classify still works for callers that have no product_type', () => {
  /* The argument is optional and the old behaviour is the fallback,
     so a caller that only has a blob is not silently changed. */
  const st = { key: 'shop', room: 'workshop' }
  assert.equal(classify(st, 'Gift Card', 'gift card'), '', 'the blob path must still refuse')
  assert.ok(classify(st, 'PLA Filament 1.75mm', 'filament spool'))
})

test('HTML entities in a description never decide a room', () => {
  /* `&amp;` contains "amp" bounded by non-word characters on both
     sides, so the audio room's old \bamp\b matched EVERY product whose
     description contained an ampersand -- and audio is tested before
     workshop. Eight of 3D Printernational's products were filed under
     Audio on the first live publish because their blurbs said things
     like "bins &amp; cabinet".

     Fixed in two places, and both are asserted: row() now builds the
     blob from the CLEANED description rather than the raw HTML, and
     the audio room no longer matches a bare "amp". */
  const st = { key: 'shop', room: 'workshop' }
  assert.equal(classify(st, 'Mosaic Palette 3 Pro', 'Storage bins &amp; a cabinet', '3D Printer Accessories'),
    'workshop', 'an ampersand entity must not send a product to Audio')
})

test('an amp of current is not an amplifier', () => {
  /* "requires a 15 amp circuit" is a sentence every CNC machine and
     3D printer listing eventually contains. */
  const st = { key: 'shop', room: 'workshop' }
  assert.equal(classify(st, 'CNC Router 3018', 'CNC Router requires a 15 amp circuit', 'CNC Router'),
    'workshop')

  /* And the room still has to work for actual amplifiers, which is
     the half of this that a careless fix would break. */
  assert.equal(classify(st, 'Fosi Audio BT20A Tube Amp', 'stereo tube amp', 'Amplifiers'), 'audio')
  assert.equal(classify(st, 'Schiit Magni Headphone Amp', 'headphone amp', 'Amps'), 'audio')
  assert.equal(classify(st, 'Cambridge Audio AXA35 Amplifier', 'integrated amplifier', ''), 'audio')
})

test('a charge controller is not a gamepad', () => {
  /* POWOXI names eleven products "... with MPPT Controller" and one
     "Solar Charge Controller 12V 8A". battlestation is tested before
     power, so bare \bcontrollers?\b filed a 12V solar regulator as
     a thing you hold. Same family as \bamp\b matching the unit of
     current: a word that means one thing in the shop and another in
     the wiring diagram. */
  const solar = { key: 'powoxi', room: 'power' }
  for (const t of [
    'POWOXI 30W Solar Battery Charger Adjustable Rack Upgraded 8A MPPT Controller',
    'POWOXI Solar Charge Controller 12V 8A',
    'PWM Charge Controller 20A',
    'Brushless Motor Controller',
  ]) assert.notEqual(classify(solar, t), 'battlestation', `not a gamepad: ${t}`)
})

test('the guard does not cost us actual controllers', () => {
  /* The other half of the same claim, and the reason the pattern was
     guarded rather than deleted. If this passes while the test above
     fails, somebody widened it back; if it fails, somebody narrowed
     \bcontrollers?\b into uselessness. */
  for (const t of [
    'Xbox Wireless Controller',
    'Controllers for Nintendo Switch',
    'PS5 DualSense Controller - White',
    'Retro USB Controller 2-Pack',
  ]) assert.equal(room(t), 'battlestation', `is a gamepad: ${t}`)
})
