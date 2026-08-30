/* ============================================================
   test/_pages.mjs — which pages have visitors, and which do not.

   ONE LIST, READ BY EVERY TEST THAT NEEDS IT. Several guards here
   care about the difference: the copy rules are about what a VISITOR
   is shown, and the ink layer is the site's face rather than its
   instrument panel. Each of them growing its own exemption list is
   how two lists end up disagreeing about the same page, and the one
   that matters is always the one somebody forgot to update.

   NAMED, NOT INFERRED. An earlier version of the copy guard worked
   this out from the page's robots meta, on the reasoning that an
   operator page is noindex. It is. So is arcade.html, for a
   completely different reason (it is waiting on a game author's
   sign-off) and with real visitors arriving from the header. That
   inference silently exempted the exact page the guard was written
   for. `noindex` means "do not crawl", never "nobody reads it".

   Adding a page here should feel like a decision, which is why it is
   a literal list and not a rule.
   ============================================================ */

export const OPERATOR_PAGES = new Set([
  /* the capture console: the whole audience is whoever maintains this */
  'collect.html',
  /* the analytics console: same. Its numbers are for the owner, and
     the ink hover would make a bar chart unreadable on the way past. */
  'admin.html',
])

export function isOperatorPage (file) {
  return OPERATOR_PAGES.has(file)
}
