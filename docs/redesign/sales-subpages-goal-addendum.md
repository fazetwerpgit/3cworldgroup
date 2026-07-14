# Sales sub-pages — sales-line addendum (BINDING)

Authorization: user approval 2026-07-14 ("Yes" to closing the last gap found
by the full-page audit). Extends the sales-line contract
(docs/redesign/sales-the-line-goal.md) to the three leftover routes:
/portal/sales/new, /portal/sales/[id], /portal/sales/[id]/edit.
No new mockup round — the approved sales-line system covers them.
Orchestrator: main session, 2026-07-14.

Source of truth for anatomy: (scratchpad)/sales-sub-extract-report.txt —
builder MUST read it first (hazards B-1..B-12).

## Scope

- Recompose all three pages onto the sales-line design system (tokens,
  panels, kickers, chips, metallic numerals where a hero number exists).
- SaleForm.tsx has ONE caller (sales/new) — it may be restyled outright or
  replaced; if replaced, delete the dead file in the same change.
- The edit page's inline form gets the same new form language.
- Read-only detail regions: reuse/adapt SaleDetailSheet's block structure
  (customer / plans / summary / proof / notes / status) — do not invent a
  competing layout. SaleDetailSheet ITSELF is out of scope (already shipped);
  if extracting shared markup, it must be additive and leave the sheet's
  rendering pixel-identical.
- The approved/rejected audit banner (approver, date, rejection reason) has
  no analog — design it new in sales-line language.
- CSS: do NOT edit the frozen sales-line block or any other existing section.
  Append ONE new section at the very END of globals.css headed exactly:
  `/* Sales-line addendum — sub-pages (form + detail + audit banner) */`
  All new classes sales-line- prefixed. Additions-only diff on globals.css.
  New form styling (inputs, provider/plan picker cards, file upload) built
  from existing sales-line tokens.

## Behavior rulings (binding)

1. VISUAL-ONLY. Zero API/server file changes. All fetches, request/response
   shapes, redirects-after-save, and client-side validation preserved exactly.
2. B-1/B-2: the two independent gates stay independent — admin-only
   Edit/Delete (isRole('admin')) vs the broader sales:approve set for
   approve/reject. Byte-equivalent role logic.
3. B-3: status changes ONLY via the existing approve flow. Do NOT add any
   status field, dropdown, or new status-change path on any of the three
   pages.
4. B-9 reconciliation: the parent contract's "remove the edit page's broken
   status dropdown" is already satisfied at HEAD (no status field exists).
   Baseline = HEAD. Nothing to remove, nothing to add.
5. B-4: keep the order#/BTN-or-screenshot client-side proof rule exactly as
   is on both create and edit. The missing server-side re-check on PUT is a
   known pre-existing gap — do not touch the API.
6. B-5: totalPoints not recalculated on edit is a known pre-existing data
   hazard — do NOT silently fix; leave behavior identical.
7. B-7: proof re-upload by a non-owner editor may hit the storage ownership
   check — pre-existing; do not change upload paths. Orchestrator smoke-tests
   after build.
8. Delete confirmation (if any exists at HEAD) keeps its current friction
   level; if the admin Delete is currently un-confirmed, add the shipped
   inline confirm-strip pattern (same ruling as recruiting's Reject — it is
   the campaign-standard for destructive actions). No other behavior deltas.
9. Honest empty states; never fabricate data. Sensitive/proof files: never
   bypass existing access checks.

## Hard rules (campaign standard)

Explicit font-weight on display headings; dark (.dark on body) = 1:1 target,
light coherent; reduced-motion exemption must actually cover the new classes
(verify the existing sales-line exemption selector reaches them — if the new
section is not nested under an exempted root, add a matching exemption block
inside the new section); no horizontal scroll at 390 (scrollWidth 375);
plain numbers, no leading zeros; .portal-metallic-num never clipped; lucide
icons only, no unicode glyph icons; real /logo.png if a logo appears.

## Gates

npx tsc --noEmit; eslint on changed files; npm run build; diff check: only
the three pages, SaleForm.tsx (restyle or delete), optionally a new shared
read-only-blocks component file, and globals.css (additions at end only).
Then orchestrator browser verify (1440/390, dark/light, form fill, no real
sale mutated) and fresh Opus adversarial review to PASS before commit.
