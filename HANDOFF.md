# Social Bar — Work Handoff

Context handoff for continuing the premium-hardening work in Claude Code.
Written at the end of the security track (①). Read this first, then see
"Immediate next steps."

---

## What this project is

Multi-tenant (multi-venue) bar/restaurant tablet ordering + kitchen system.
Next.js (App Router) + Firebase (Firestore, Auth) + Vercel. Vitest on pricing
logic. Bilingual EN/Burmese. No tipping. Currency is MMK.

**Firebase projects**
- Production: `social-bar-41fc4` — venue `yVp4BXsawJXYboKZ4e5f7DfN9tI2`, admin `admin@test.com`
- Staging: `social-bar-staging` — venue `9QLomhLFBhV3UyL8i4YR06XMegZ2`, admin `staging-admin@test.com`
- **Both databases are in region `asia-southeast3`** — this matters (see Functions note).

**Pipeline:** staging branch → main → Vercel. GitHub `amhtutt/social-bar`.

---

## The premium roadmap (agreed order)

1. **Security hardening** ← we are finishing this now
2. Design system refactor (design tokens + shared primitives + motion; move off per-component inline styles)
3. Order-status feedback to the customer tablet (Received → Preparing → Delivered)
4. Reports (shift/daily) + payment-method tracking on Close Tab
5. Offline resilience (Firestore persistence, queued writes, reconnect banner)
6. New-venue onboarding wizard

Working style the user wants: complete ready-to-place files with explicit
paths, no partial snippets, minimal hand-editing, action-oriented.

---

## ① Security hardening — what was built

All of the following files were produced and should be in the repo. Verify
each is placed before deploying.

### `firestore.rules` (repo root) — NEW
Replaces a wide-open rule set (previously `orders`, `billRequests`,
`serverCalls`, `tablets` were world-readable/writable with no auth). New model:

- **Staff** (roles `admin` / `staff` / `kitchen`): email-password auth + a
  `users/{uid}` profile doc `{ venueId, role }`.
- **Customer tablets**: Firebase **Anonymous Auth**. On Setup, the device writes
  `tabletIdentities/{its anon uid} = { uid, venueId, tableNumber, tabletSlot }`.
  This identity doc is the security anchor — rules use it to scope what a device
  may read/write to exactly its own venue + table.
- **Cloud Function** uses Admin SDK → bypasses rules → only it can write the
  `priceValidation` field (clients are blocked from writing it at all).
- Venue scoping enforced everywhere; no self-escalation on `users` (can't change
  own role/venueId); `activityLog` is append-only (no client update/delete);
  kitchen role may update **only** an order's `status`/`updatedAt`; `menuItems`
  kitchen writes limited to the `available` field (for a future 86'd-item flow).
- `tablets` presence docs keep their deterministic IDs (`{venueId}_table_{N}_{slot}`).
- `flaggedTables` now has an explicit FOH-only rule.

### `functions/index.js` + `functions/package.json` — REPLACED
Server-side price validation: re-derives each line item's expected unitPrice from
current `menuItems` and flags mismatches. **Flag, don't block** — writes
`priceValidation: {status:"ok"|"mismatch", ...}` on the order and an
`activityLog` entry on mismatch; never edits/deletes/blocks the order.

**IMPORTANT — it's a SCHEDULED SWEEP, not a Firestore trigger.** Firestore event
triggers (both v1 `document().onCreate` and v2 `onDocumentCreated`/Eventarc) are
**unsupported in `asia-southeast3`** and fail at deploy. The function therefore
runs `every 5 minutes` (`functions.pubsub.schedule`), validating orders created
since the last sweep (with a 5-min overlap buffer, skipping already-validated
orders). Cursor doc: `_system/priceValidationSweep`. A ≤5-min detection lag is
fine because this is an audit/detection signal, not a gate. `package.json` pins
Node 22 + `firebase-functions@^6`.

### `lib/customerAuth.js` — NEW
`ensureCustomerAuth()` — idempotent anonymous sign-in for tablets. Waits for
`onAuthStateChanged` to restore any persisted session before minting a new uid
(so a cold start doesn't orphan the tablet identity). Returns an existing staff
session untouched if one is present.

### `lib/orderService.js` — REPLACED
- Customer paths call `ensureCustomerAuth()` before any read/write.
- Every order / billRequest carries `createdByUid`.
- Idempotent re-submit is rules-aware (customers can create but never update
  orders; a rejected retry is verified with a read-back).
- Restore/undo helpers carry `createdByUid` + `priceValidation` forward
  (rules treat them as immutable on update).
- **Kitchen actions added:** `markOrderCompleted()` (Finished — stays on bill),
  `cancelOrderFromKitchen()` (Dismiss — drops off bill), `uncancelOrder()` (undo).
- **Central `isActiveOrder()` filter** — one source of truth: an order leaves all
  live views (customer Bill tab, Floor View, Kitchen) when `settledAt` is set OR
  `status === "cancelled"`. This is how kitchen Dismiss removes an order from the
  bill with no change needed in customer/Floor code.
- `closeTab()` settles cancelled orders too but excludes them from the total.

### `lib/tabletService.js` — REPLACED
`registerTablet()` now writes the `tabletIdentities/{uid}` anchor doc (before the
presence doc) inside itself, so **no Setup-component change was needed**. Presence
model + deterministic IDs unchanged. All tablet writes ensure anon auth first.

### `app/kitchen/page.js` — REPLACED
Real Firestore-backed **Finished** (primary) + **Dismiss** (danger, confirm
dialog + ~6s Undo bar) buttons, replacing the old local-only/localStorage
"Dismiss" that only hid a ticket on one screen. Kitchen now shows only `pending`
orders. Chime-on-new-order and New/Older urgency sections retained.

### `firebase.json` — REPLACED
Added `"firestore": { "rules": "firestore.rules", "indexes": ... }` so rules
deploy via CLI alongside functions.

---

## ⚠️ OPEN RISK — resolve before/at deploy

**Role-string mismatch.** The new rules + the updated `AdminGuard` in
`app/kitchen/page.js` use roles **`admin` / `staff` / `kitchen`**. The *old*
kitchen `AdminGuard` used **`admin` / `manager` / `server` / `kitchen`**. If the
actual `users/{uid}` profile docs in Firestore store `manager` / `server`, those
users will be **locked out** by the new rules.

**Action:** grep the codebase for role strings (`"manager"`, `"server"`,
`"staff"`) and check a real user profile doc in the Firestore console. Then
reconcile so the rules, `AdminGuard` calls, and stored profile data all agree on
one vocabulary. Do this on staging first.

**Minor:** the kitchen Dismiss dialog passes a `confirmLabel` prop to
`ConfirmDialog`. If that component doesn't accept it, the label is silently
ignored (harmless). Patch `ConfirmDialog` if the custom label is wanted.

---

## Immediate next steps (finish ①)

Do everything on **staging** first, verify, then repeat for **production**.

**Console (can't be scripted):**
1. `social-bar-staging` → Authentication → Sign-in method → enable **Anonymous**.
2. `social-bar-staging` → upgrade to **Blaze** (set a low budget alert). Required
   for Cloud Functions + Cloud Scheduler. Effectively free at this volume.

**Deploy (staging):**
```bash
git checkout staging
git add . && git commit -m "Security: hardened rules, anon tablet auth, price validation sweep, kitchen finish/dismiss"
git push origin staging
# install function deps if not done:
cd functions && rm -rf node_modules package-lock.json && npm install && cd ..
npx firebase-tools deploy --only firestore:rules,functions --project social-bar-staging
```
(First functions deploy auto-enables the Cloud Scheduler API.)

**Post-deploy (staging):**
3. **Re-run tablet Setup** on the staging URL — mandatory, creates the
   `tabletIdentities` doc. Existing tablets have none and will be denied until
   they do.
4. Test flow:
   - Place an order from the tablet → appears on `/kitchen`.
   - Tap **Finished** → leaves kitchen, still on the table's Bill tab + Floor View.
   - Place another → tap **Dismiss** → confirm → leaves kitchen AND drops off the
     bill/Floor View → hit **Undo** → it returns.
   - **Close Tab** from Floor View → total excludes any dismissed order.
   - Price validation: GCP console → Cloud Scheduler → force-run
     `...sweepOrderPriceValidation...` → the order doc gets
     `priceValidation: {status:"ok"}`. (To test a mismatch: edit a menu item's
     price after placing an order, force-run, confirm a `mismatch` entry on the
     order + an `activityLog` "price_validation_failed" row.)

**Production rollout:** same Anonymous + Blaze toggles on `social-bar-41fc4`,
merge staging → main, `deploy --only firestore:rules,functions --project
social-bar-41fc4`, then **re-run Setup on every real tablet**.

**Composite indexes:** the order/bill subscriptions need venueId+tableNumber+
createdAt and venueId+createdAt indexes. If a query throws a "needs index" error
with a link, create it and redeploy — or add to `firestore.indexes.json`.

---

## Then continue the roadmap

Next up is **② design system refactor**. Suggested first move: introduce a design
token layer (spacing / radii / type scale / semantic colors), extract shared
primitives (Button, Card, Sheet, Badge), add a body/UI font alongside the display
font, and a light motion pass (Framer Motion) — starting with the highest-traffic
screens. `lib/theme.js` already exists as a seed to build the token layer around.
