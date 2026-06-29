# Bar System — Next.js Rebuild

A clean rebuild on Next.js (App Router): file-based routing,
environment-variable config, a feature-flag system per venue, full
multi-tenant authentication with roles (Admin / Manager / Server), and a
full-featured menu/ordering system with modifiers, combos, tax/service
charge, and a polished customer flow.

## Menu & Ordering overhaul (NEW)

This was the largest single addition to the project. Summary by area:

### Menu data model
- Item modifier groups — e.g. "Size" (required, single-choice) or
  "Add-ons" (optional, multi-choice), each option carrying a price delta.
  Built in lib/menuService.js, edited via
  components/admin/ModifierGroupsEditor.jsx.
- Combos — bundle existing items into one orderable unit at a bundle
  price. Built via components/admin/ComboItemsEditor.jsx.
- Promotional and Featured flags on any item — surface under virtual
  "Promotions" / "Most Popular" categories on the customer menu
  automatically, no manual category management needed. A real category
  can also be pinned to the top via "Featured Category."
- Special instructions — free-text per cart line ("no ice", "allergic to
  peanuts"), carried through to the order and shown to staff.

### Tax / service charge
- Configurable per venue (Admin -> Pricing tab): tax rate %, service
  charge rate %, and a "prices already include tax" toggle for
  tax-inclusive pricing. lib/venueConfig.js's calculateOrderTotals() is
  the single source of truth — used by the cart, order submission, staff
  order edits, and the bill, so all four always agree.
- Every order snapshots its own subtotal/tax/service/total AT THE TIME IT
  WAS PLACED. Changing the venue's rate later never alters past orders or
  bills — this is deliberate, matching how a real receipt works.
- No tipping anywhere in this system. Tips are cash, handled directly
  between customer and server — common practice in Yangon, where most
  payment is cash. There is no tip field, no tip calculation, no tip
  display, by design.

### Customer flow
- Order confirmation screen (components/OrderConfirmation.jsx) — a brief
  full-screen "Order placed" moment with the order number and total,
  instead of the cart drawer just closing silently.
- Persistent order status badge (components/OrderStatusBadge.jsx) on the
  Menu tab — shows "N orders placed - status" and jumps to the Bill tab
  on tap.
- "+ Add More Items" button on the Bill tab jumps back to the Menu tab.
- Reorder — every past order on the Bill tab has a "Reorder" button that
  re-adds all of its items (with the same modifiers/instructions) back
  into the live cart in one tap.
- Quantity selection lives ONLY in the cart / customization modal, never
  on the menu card itself — tapping "Add to Cart" again on the same
  item+modifiers+instructions just increments that line.

### Design polish
- Price typography recalibrated for a bar's register — confident and
  visible, not whisper-quiet fine-dining, not screaming neon.
- Bilingual line-height fix — Burmese script gets extra line-height
  (1.8 vs 1.4) since its glyphs and stacked diacritics run taller than
  Latin and looked cramped at the old setting.
- Friendlier empty states throughout (menu, bill) with a short
  illustration-style icon and warmer copy instead of plain "no items"
  text.
- Cart drawer now shows modifiers and special instructions per line, plus
  a tax/service breakdown above the grand total.

## What's in this build

- Tablet identity setup (/) — staff picks table number + slot (A/B). The
  tablet also captures venueId from the URL (?venue=xxx) the first time
  it's opened, then remembers everything in localStorage.
- Table dashboard (/table) — fixed header + bottom nav with three tabs:
  Status, Menu, and Bill. Feature flags now come from a LIVE Firestore
  subscription per venue (lib/venueConfig.js), not a static object.
- Menu module — full data layer (lib/menuService.js, now venue-scoped) +
  customer-facing browsing UI (components/MenuView.jsx), bilingual EN/MM,
  skeleton loaders, unavailable-item handling.
- Ordering module — cart (lib/CartContext.jsx), cart drawer
  (components/CartDrawer.jsx), running bill (components/BillTab.jsx), and
  Request Bill checkout flow. All venue-scoped (lib/orderService.js).
- Firebase presence/heartbeat — each tablet registers online and sends a
  heartbeat every 10 seconds (lib/tabletService.js, now venue-scoped).
- Admin menu editor (/admin) — two tabs for Categories and Items, modal
  add/edit forms, delete with confirmation. Built against
  lib/menuService.js.
- Floor View (/staff) — server/manager dashboard, grouped by table. Per
  table: every active order, +/- quantity controls on each item, remove
  an item, void a whole order, and "+ Add Order" (opens a menu-browsing
  modal so staff can place an order for that table directly). A banner
  surfaces when a table has requested its bill, with "Mark Handled".
  Accessible to admin, manager, AND server roles. No order-status
  workflow (pending/preparing/served) yet -- deferred per product
  decision.
- Activity Log (/staff, second tab) -- audit trail of every staff action
  (item removed, quantity changed, order voided, order added, bill
  acknowledged, server call acknowledged), each entry showing who did it,
  their role, which table, and when. Global feed by default; click a
  table chip to filter to just that table.
- Call Server -- a floating button on /table (when the callServer
  feature flag is on), opposite side from the cart button. Tapping
  notifies staff; the button shows a confirmed state until acknowledged,
  and reflects reality across BOTH tablets at the same table (if Tablet A
  calls, Tablet B's button shows the same confirmed state). On /staff, an
  urgent pulsing banner appears on that table's card (rendered above the
  bill-request banner, since calls are typically more time-sensitive),
  plus a "X tables need help" counter in the header. No reason field --
  a tap is a tap, staff figures out why in person, per product decision.

### Menu, ordering, and bill overhaul (NEW)

A large pass adding the features a real restaurant kiosk needs:

- **Item modifiers** -- menuItems can carry modifierGroups (e.g. Size:
  Regular/Large, Add-ons: extra cheese/bacon), each group required or
  optional, single- or multiple-choice, each option with its own price
  delta. Items with modifiers open ItemCustomizationModal on "Add to
  Cart"; items without modifiers add straight to cart with no added
  friction. Built/edited in /admin via ModifierGroupsEditor.
- **Special instructions** -- free-text field per cart line ("no ice",
  "extra spicy"), shown through cart, order, Floor View, and bill.
- **Combos / set menus** -- an item can be flagged isCombo and bundle
  other existing items (comboItems) at its own price. Built in /admin via
  ComboItemsEditor; shown with a COMBO badge and its contents listed on
  the customer menu card.
- **Promotional + Featured items** -- independent isPromotional /
  isFeatured flags on any item. MenuView synthesizes two virtual sidebar
  categories (Promotions, Most Popular) whenever matching items exist. A
  real category can also be pinned via isFeaturedCategory.
- **Tax + service charge** -- venue-configurable percentages
  (lib/venueConfig.js's calculateOrderTotals(), set via /admin's Pricing
  tab / PricingSettings.jsx). Every order snapshots subtotal/tax/service/
  total at submit time, so changing the rate later never alters past
  orders' bills. Supports tax-inclusive pricing (menu prices already
  include tax) as a toggle. **No tipping fields anywhere** -- tips are
  cash, handled directly between customer and server, per how tipping
  works in Yangon.
- **Order numbers** -- every order gets a short, speakable orderNumber
  (not the long Firestore doc id), shown on the confirmation screen, the
  bill, and the Floor View.
- **Order confirmation screen** -- a full-screen "Order placed" moment
  (components/OrderConfirmation.jsx) after a successful submit, showing
  the order number and total, auto-dismissing after a few seconds.
- **Persistent order status indicator** -- a small pill on the Menu tab
  (components/OrderStatusBadge.jsx) showing "N orders placed · status",
  tappable to jump straight to the Bill tab.
- **Reorder / quick-add** -- a "↻ Reorder" button on each past order in
  the Bill tab re-adds every item from that order back into the live
  cart (same modifiers, same instructions), using CartContext's own
  merge logic.
- **"+ Add More Items" on the Bill tab** -- jumps back to the Menu tab,
  closing the loop the other direction from the order status badge.
- **Quantity stays in the cart** -- per product decision, quantity
  selection lives only in the cart/customization modal, never on the
  menu card itself. Tapping "Add to Cart" again on an item with identical
  modifiers/instructions just increments that line.
- **Design polish** -- price typography tuned to a bar register (visible
  and confident, not fine-dining-quiet or neon-loud); empty/loading
  states given actual copy and a little personality instead of plain
  text; Burmese text gets extra line-height since its glyphs run taller
  than Latin; cart drawer shows modifiers/instructions per line plus a
  full tax/service breakdown, not just a flat total.

Staff/managers get full parity: StaffOrderModal (the "+ Add Order" flow
on /staff) now wraps its own local CartProvider around MenuView, so
staff placing an order on a table's behalf get the exact same
modifier-picking and special-instructions experience customers get --
this replaced an earlier version that silently dropped that information
for staff-entered orders.

### Authentication and roles (NEW)

- Firebase Authentication (email/password).
- Three roles, stored in users/{uid}: admin, manager, server.
  - admin: full menu CRUD plus can create Manager/Server accounts for
    their own venue (components/admin/StaffManager.jsx).
  - manager / server: identical permissions today (can manage orders
    and bills once that screen is built). Kept as separate roles so
    manager-only abilities (voids, discounts) can be added later without
    a data migration.
- lib/AuthContext.jsx combines Firebase's signed-in user with their
  Firestore profile (role + venueId) into one useAuth() hook.
- components/admin/AdminGuard.jsx wraps any admin/staff page; shows
  LoginScreen if signed out, "Access Denied" if the role doesn't match.
- /admin requires role admin specifically.

### Multi-tenant (NEW)

Every collection that used to be venue-implicit now carries a venueId:

- venues/{venueId} -> { name, ownerUid, config: {...feature flags...} }
- users/{uid} -> { email, role, venueId }
- menuCategories, menuItems, orders, billRequests, tablets -> all now
  require/filter by venueId.

venueId is the founding admin's Firebase Auth uid -- simplest possible
1:1 mapping, no separate ID generation needed.

How a tablet learns its venueId: a tablet has no login. Staff visit
yourapp.com/?venue=VENUE_ID once during physical setup; the Setup
screen captures it and stores it in localStorage alongside table/slot.

How staff/admin screens learn their venueId: from their own logged-in
user profile (useAuth().venueId) -- no URL param needed there.

## What's intentionally NOT in this build

- Games (Tap Battle, etc.) -- paused per request, can return as a flagged
  module + route later
- Real payment processing -- "Request Bill" only notifies staff; cash/card
  is handled in person
- Staff/admin order view -- subscribeToVenueOrders() and
  updateOrderStatus() already exist in lib/orderService.js. The view
  itself (/staff) is now built, but it does NOT yet use
  updateOrderStatus() -- there's no pending/preparing/served workflow,
  per product decision to keep the first version to view + remove/void
  only.
- A self-serve signup flow for new restaurants -- createVenueWithAdmin()
  exists in lib/userService.js and is fully functional, but there's no
  public-facing signup page yet. New venues are onboarded by calling it
  directly (e.g. via the bootstrap script) for now.
- Chat, Call Server -- flags exist, no UI yet
- Final color palette -- still running the placeholder neon theme; every
  color lives in lib/theme.js

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Firebase

```bash
cp .env.local.example .env.local
```

Fill in your Firebase project's web config (Firebase Console -> Project
Settings -> Your Apps -> Web App), and make sure Authentication ->
Sign-in method -> Email/Password is enabled in the Firebase Console --
this build now requires it.

### 3. Update Firestore Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /venues/{venueId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == venueId;
    }
    match /users/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    match /tablets/{tabletId} {
      allow read, write: if true;
    }
    match /menuCategories/{categoryId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /menuItems/{itemId} {
      allow read: if true;
      allow write: if request.auth != null;
    }
    match /orders/{orderId} {
      allow read, write: if true;
    }
    match /billRequests/{requestId} {
      allow read, write: if true;
    }
    match /serverCalls/{callId} {
      allow read, write: if true;
    }
    match /activityLog/{entryId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

`orders`, `billRequests`, and `serverCalls` all stay fully open because
tablets write to them directly with no login of their own. This means a Server/Manager's
destructive actions (removeItemFromOrder, voidOrder, updateItemQuantity)
are NOT currently rules-protected by role -- the UI only shows these
controls on /staff (which IS auth-gated), but the underlying Firestore
write isn't blocked at the database level yet. `activityLog` itself
requires auth for both read and write, which is the one piece of this
flow that's already locked down properly.

This is a meaningful tightening from before: menu writes now require ANY
signed-in user (not yet role-checked at the rules level -- that's a good
follow-up once this is stable). Tablet-facing collections (tablets,
orders, billRequests) stay open since tablets never log in.

### 4. Bootstrap your venue (run once)

This replaces the old seed:menu flow as the starting point. It creates
your admin login, your venue document, AND migrates any existing menu
data (from before multi-tenant existed) to belong to your new venue.

1. Download a service account key: Firebase Console -> Project Settings ->
   Service Accounts -> Generate new private key
2. Save it as scripts/serviceAccountKey.json (gitignored, never commit)
3. Edit the CONFIG block at the top of scripts/bootstrapVenue.mjs with
   your venue name, admin email, and admin password
4. Run:
   ```bash
   npm run bootstrap:venue
   ```
5. Copy the printed venueId -- you'll need it for tablet setup URLs

If you still want fresh sample menu data instead of migrating existing
data, scripts/seedMenu.mjs still exists but needs a venueId added to
each seeded document manually, or run bootstrap first and re-seed after.

**If you already ran bootstrap before Call Server existed:** your venue's
config.callServer is saved as false in Firestore and won't pick up the
new default automatically. Go to Firebase Console -> Firestore Database
-> venues -> your venue document -> edit the config map -> set
callServer to true. (New venues bootstrapped from now on get this flag
enabled automatically.)

### 5. Run locally

```bash
npm run dev
```

- Visit http://localhost:3000/?venue=YOUR_VENUE_ID to set up a tablet
- Visit http://localhost:3000/admin and sign in with your admin email/password

### 6. Deploy to Vercel

```bash
vercel --prod
```

Add the same environment variables from .env.local to your Vercel
project settings.

---

## Architecture notes

### Roles and permissions today

| Role    | Menu (add/edit/delete) | Orders and Bill (Floor View) | Create staff accounts |
|---------|-------------------------|-------------------------------|-------------------------|
| admin   | Yes                     | Yes                           | Yes (own venue only)   |
| manager | No                      | Yes                           | No                      |
| server  | No                      | Yes                           | No                      |

Manager and server are intentionally identical today, kept distinct so
manager-only abilities (voiding orders, discounts) can be layered on later
without touching the data model again.

### Creating staff accounts without logging the Admin out

Firebase's createUserWithEmailAndPassword() signs in as the newly created
user immediately -- a problem when an Admin creates a Manager account
from inside their own session. createStaffAccount() in lib/userService.js
works around this with a SECONDARY, temporary Firebase Auth app instance,
so the Admin's session in the primary auth instance is never touched.

### Feature flags (lib/venueConfig.js)

Now venue-scoped and live (Firestore onSnapshot, not a static object):

```js
venues/{venueId}.config = {
  games: false,
  menu: true,
  ordering: true,
  chat: false,
  callServer: false,
  bill: true,
}
```

/table subscribes to this per its tablet's venueId to decide which
bottom-nav tabs to show. Each venue can have a different combination --
this is the actual mechanism behind sellable pricing tiers.

### Design tokens (lib/theme.js)

Unchanged -- every color/font reference flows through this one file.

### Data layer separation

Every lib/*Service.js file owns ALL Firestore logic for its domain and
now takes venueId as an explicit parameter rather than assuming a single
implicit venue. Components never call Firestore directly.

### New composite indexes for Floor View + Activity Log + Call Server

subscribeToVenueOrders(), subscribeToVenueBillRequests(),
subscribeToVenueServerCalls(), and subscribeToVenueActivityLog() all
filter by venueId (==) and sort by createdAt (desc) -- the same
composite-index pattern hit earlier with Leaderboard and Bill.
subscribeToTableServerCall() additionally needs venueId (==) +
tableNumber (==) + createdAt (desc), same shape as
subscribeToTableBillRequest(). The table-filtered activity log needs that
same three-field shape too. The first time you open /table (with Call
Server enabled) or /staff, check the browser console for a Firestore
"query requires an index" error with a direct link to create it. You'll
likely need to create a handful of these the first time each query shape
runs.

### Data shapes (updated)

```
venues/{venueId}
  name, ownerUid,
  config: {
    games, menu, ordering, chat, callServer, bill,    -- feature flags
    pricing: { taxRatePercent, serviceChargeRatePercent, taxInclusive }
  },
  createdAt

users/{uid}
  email, role ("admin"|"manager"|"server"), venueId, createdAt

menuCategories/{categoryId}
  venueId, name_en, name_mm, icon, sortOrder, isFeaturedCategory

menuItems/{itemId}
  venueId, categoryId, name_en, name_mm, description_en, description_mm,
  price, imageUrl, available, sortOrder,
  modifierGroups: [{
    id, name_en, name_mm, required, selectionType ("single"|"multiple"),
    options: [{id, name_en, name_mm, priceDelta}]
  }],
  isCombo, comboItems: [{itemId, name_en, quantity}],
  isPromotional, isFeatured

orders/{orderId}
  venueId, tableNumber, tabletSlot (null if source is "staff"), orderNumber,
  items: [{
    itemId, name_en, name_mm, basePrice, unitPrice, quantity,
    selectedModifiers: [{groupId, groupName_en, optionId, optionName_en, priceDelta}],
    specialInstructions
  }],
  subtotal, taxAmount, serviceChargeAmount, totalPrice,
  status ("pending"|"preparing"|"served"),
  source ("customer"|"staff"), createdByEmail (if source is "staff"),
  lastEditedBy (if a staff member edited it), createdAt

billRequests/{requestId}
  venueId, tableNumber, tabletSlot, totalDue, status ("pending"), createdAt

serverCalls/{callId}
  venueId, tableNumber, tabletSlot, status ("pending"|"acknowledged"), createdAt

activityLog/{entryId}
  venueId, actorEmail, actorRole, action, tableNumber, details, createdAt
  -- action values: "item_removed" | "item_quantity_changed" |
     "order_voided" | "order_created" | "bill_acknowledged" |
     "server_call_acknowledged"
  -- append-only; entries are never edited or deleted

tablets/{docId}   (docId = "VENUEID_table_TABLENUMBER_SLOTLETTER")
  venueId, tableNumber, tabletSlot, status, lastSeen, updatedAt
```

The bill shown in BillTab is still derived, not stored -- computed live by
querying every order matching venueId + tableNumber. This is why Tablet A
and Tablet B at the same table automatically share one bill within their
own venue.

---

## Next steps (suggested order)

1. Role-aware Firestore rules for orders/billRequests/serverCalls -- right
   now these stay fully open since tablets write to them without logging
   in. The Floor View's destructive actions are only gated by the UI
   (auth-protected /staff route), not by the database itself yet.
   activityLog is the one collection that's correctly auth-gated for both
   read and write.
2. Order status workflow on /staff (pending -> preparing -> served) using
   the already-built updateOrderStatus() -- deferred from this round on
   purpose, but the data field and function are ready.
3. A public signup page wrapping createVenueWithAdmin(), if/when you want
   restaurants to self-onboard instead of you running the bootstrap
   script for each one.
4. Re-add Games as a flagged module + route.
5. Global Chat module.
6. Final color palette swap in lib/theme.js -- the placeholder neon theme
   is still active everywhere; every color flows through this one file.
7. Real food photography -- imageUrl already works on every item, this is
   now a content task (pasting real photo URLs) rather than a code task.
8. Estimated wait time / kitchen-side order status workflow, paired with
   item #2 above (order status workflow on /staff).
