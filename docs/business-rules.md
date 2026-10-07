# ReNest — Business Rules · MVP R1

**For:** the dev who reviews these rules and turns them into tickets.
**Built from:** the PRD (`renest-prd.md`, Epics 1–5), the design screens, [`erd.dbml`](erd.dbml) and [`api-contract.md`](api-contract.md).

### How to read this

Every rule has an ID (`BRW-3`, `RES-2`…) so tickets can reference it. The tag after each rule says how it relates to the PRD:

| Tag | Meaning |
|---|---|
| ✅ | Matches the PRD. |
| ➕ | Detail the PRD does not specify. We decided it to make the feature buildable. Review, but it doesn't contradict anything. |
| 🔀 | **Differed from the PRD and was resolved.** The decision is in §1. |

---

## 1. Differences with the PRD — decided

| # | PRD says | Decision |
|---|---|---|
| C1 | Epic 1: the buyer can tap **"Doubts about this product?"** to message the seller on WhatsApp **before** reserving. | **Follow the PRD.** The listing detail shows the seller's WhatsApp, **only to logged-in users**. |
| C2 | Epic 5: the seller can **add or remove pickup pairs** on an Active listing until it's reserved. | **Follow the PRD.** Add + remove (no in-place edit) while the listing is Active. |
| C3 | Permissions matrix: seller can **"edit"** own listings. | **Follow the PRD.** The seller can edit their listing while it's Active (rules in LST-11 to LST-13). |
| C4 | Permissions matrix: seller **"marks payment received"** / "receives payment". | **Out of R1.** No payments in the app; money is exchanged in person. Remove it from the matrix. |
| C5 | Epic 3 ends with the buyer confirming reception, then the purchase shows as "Completed". | **Follow the PRD for the buyer side:** only the buyer's own reception moves the purchase from "Agendados" to "Completados". Reception stays **optional**, and the seller's handover never takes that option away. |
| C6 | North Star = "Completed transactions per week", not defined. | **Completed transaction = seller confirmed the handover.** |
| C7 | Epic 4: "Entering the item's **photo**" (singular). | **1 to 3 photos.** |
| C8 | KPIs mention **Wishlist** and **"Buy Now"**. | No wishlist in R1. "Buy Now" = "Schedule Pickup". |
| C9 | KPI: **Dispute rate** < 5%. | No dispute flow. A reception checklist with any "no" answer or a written report counts as a dispute. |

---

## 2. General rules

| ID | Rule | Tag |
|---|---|---|
| GEN-1 | One account can be both buyer and seller. There's no role field: the role depends on the transaction (you're the seller on your listings, the buyer on your reservations). | ✅ |
| GEN-2 | **Prices** are stored as integers **in cents**. There is no currency field and no conversion: the app always shows "$" as a generic price sign, whatever the city or country (Bs, soles, dollars…). Buyer and seller settle the actual money in person. Minimum $1 (100 cents), maximum 20,000,000 (2,000,000,000 cents). | ➕ |
| GEN-3 | **Pickup times** are the local time of the meetup city. No timezones. | ➕ |
| GEN-4 | System dates (created, reserved, confirmed…) are stored in UTC. | ➕ |
| GEN-5 | Browsing is public: feed, search and listing detail work without logging in. Any action (publish, reserve, confirm, rate) requires login. | ➕ |
| GEN-6 | Messaging is WhatsApp only (`wa.me` link with the other person's phone). No in-app chat. | ✅ |
| GEN-7 | **Phone visibility:** the seller's WhatsApp is shown on the listing detail to **logged-in** users (never to anonymous visitors). The buyer's phone is only shown to the seller of a listing that buyer reserved (see **C1**). | 🔀 |
| GEN-8 | **"Verified seller"** is set manually by the ReNest team. There's no way to request it in the app. | ➕ |
| GEN-9 | No payments in the app; money is exchanged in person (see **C4**). | 🔀 |
| GEN-10 | Reservations can't be cancelled in R1. An item can only be reserved once, ever. | ➕ |

### Listing lifecycle

```
ACTIVE ──(buyer confirms reservation)──▶ PENDING ──(seller confirms handover)──▶ COMPLETED
"Activos"                                "En proceso"                             "Completados"
```

Buyer side (independent of the listing): `Agendados` → `Completados` **only** when the buyer confirms reception (`buyer_received_at`). The seller's handover does not move the buyer's purchase and does not remove the buyer's "I picked up the item" or rating options.

---

## 3. Account (not in the PRD, required to use the app)

| ID | Rule | Tag |
|---|---|---|
| AUTH-1 | Sign-up: email, password, full name, **phone (required)** and city, picked from a fixed list: Cochabamba (BO), Arequipa (PE), San Salvador (SV), Utah (US). Stored as an enum (`COCHABAMBA_BO`…); the labels live in the frontend. | ➕ |
| AUTH-2 | Email is unique and case-insensitive (`Ana@x.com` = `ana@x.com`). | ➕ |
| AUTH-3 | Password: 8–72 characters. | ➕ |
| AUTH-4 | Phone in international format (`+52…`, `+57…`, `+591…`), because it's used to build the WhatsApp link. | ➕ |
| AUTH-5 | Login with email + password. On failure the message is always the same ("incorrect email or password"), never "that email doesn't exist". | ➕ |
| AUTH-6 | A single session token, no refresh. When it expires, the user logs in again. Logout = the app discards the token. | ➕ |
| AUTH-7 | Avatar: no upload in R1. Without a photo, the app shows the user's initials. | ➕ |

---

## 4. Epic 1 — Browse & Evaluate

| ID | Rule | Tag |
|---|---|---|
| BRW-1 | The feed only shows **available (Active)** items, newest first. | ✅ |
| BRW-2 | Search matches the **title only**, case-insensitive, minimum 2 characters. | ➕ |
| BRW-3 | Category filter: Muebles, Electrónica, Hogar (fixed list). Can be combined with search. | ✅ |
| BRW-4 | Each card shows: cover photo, title, price, condition, category, seller's zone and the "Verified seller" badge. | ✅ |
| BRW-5 | The detail shows: 1–3 photos, price, condition, category, description, the seller's pickup pairs and the seller snapshot. | ✅ |
| BRW-6 | Seller snapshot: name, avatar (or initials), verified badge, rating (average with 1 decimal + number of ratings) and zone. With 0 ratings, show "No ratings yet", not "0.0". | ✅ ➕ |
| BRW-7 | **"Doubts about this product?"** opens WhatsApp with the seller. Logged in only: an anonymous visitor who taps it is sent to login first (see **C1**). | 🔀 |
| BRW-8 | An item that's already reserved or sold (e.g. opened from a shared link) still opens, shows "No longer available", and has no "Schedule Pickup" button. | ➕ |
| BRW-9 | The seller doesn't see "Schedule Pickup" on their own listing. | ➕ |

---

## 5. Epic 2 — Reserve & Schedule Pickup

| ID | Rule | Tag |
|---|---|---|
| RES-1 | Reserving requires login. | ➕ |
| RES-2 | The buyer picks **exactly one** pickup pair (place + days + time range) from that listing's pairs. The exact day within those days is agreed on WhatsApp. | ✅ ➕ |
| RES-3 | One confirmation (the modal) does both things at once: reserves the item and fixes the pickup pair. | ✅ |
| RES-4 | A buyer can't reserve their own listing. | ➕ |
| RES-5 | **First come, first served.** If two buyers confirm at the same moment, only one gets it; the other sees "This item was just reserved". | ➕ |
| RES-6 | Once reserved, the item leaves the feed and search, and its pickup pairs can no longer change. | ➕ |
| RES-7 | After confirming, the buyer sees the place, days and hours, a **Google Maps** link (built from the place text) and the seller's **WhatsApp** button. | ✅ |
| RES-8 | "See more products" goes back to the feed. The reservation waits in My Purchases; nothing forces the next step. | ✅ |
| RES-9 | No cancellation (GEN-10). | ➕ |

---

## 6. Epic 3 — My Purchases & Reception

| ID | Rule | Tag |
|---|---|---|
| PUR-1 | My Purchases has two tabs: **Agendados** (In progress) and **Completados** (Completed). | ✅ |
| PUR-2 | A purchase moves from Agendados to Completados **only when the buyer confirms reception**. The seller's handover doesn't move it; the recap just shows "The seller confirmed the handover" (see **C5**). | 🔀 |
| PUR-3 | The purchase recap shows: item, seller info with WhatsApp, chosen pickup pair and Maps link. | ✅ |
| PUR-4 | **Confirming reception is optional for the buyer** and stays available until done, whether or not the seller already confirmed the handover. After confirming, the buyer can rate the seller (PUR-8). | 🔀 |
| PUR-5 | "I picked up the item" opens the **reception checklist**: | ✅ |
| | • "The item matches the photos and description" (yes/no) | |
| | • "Works / no undisclosed damage" (yes/no) | |
| | • "Includes all parts and accessories" (yes/no) | |
| | • "I have the item with me now" (**must be checked** to continue; not stored) | ➕ |
| | • "Anything to report?" (optional text, max 1000 characters) | |
| PUR-6 | An unchecked box does **not** block the confirmation. It's saved as "no", and it's the signal used for the Dispute Rate (see **C9**). | ➕ |
| PUR-7 | Reception can be confirmed only once and can't be changed afterwards. | ➕ |
| PUR-8 | **Rating:** 1 to 5 stars, no comment. Only the buyer of that purchase, only **after confirming reception**, only once, and it can't be edited. | ✅ ➕ |
| PUR-9 | The rating can be skipped. If skipped, it stays available from the purchase recap. | ➕ |
| PUR-10 | The rating counts toward the seller's average shown on their snapshot (BRW-6). | ✅ |

---

## 7. Epic 4 — Create & Publish a Listing

| ID | Rule | Tag |
|---|---|---|
| LST-1 | Required fields: **1 to 3 photos** (the first is the cover), title, description, category, condition and price. | 🔀 C7 |
| LST-2 | Photos: JPEG, PNG or WebP, max 5 MB each. | ➕ |
| LST-3 | Title 3–120 characters. Description up to 2000. | ➕ |
| LST-4 | Condition: **Como nuevo / Poco uso / Muy usado**. | ✅ |
| LST-5 | Price: minimum $1 (GEN-2). | ➕ |
| LST-6 | **"Set delivery availability":** 1 to 3 pickup pairs per listing. | ✅ ➕ |
| LST-7 | Each pair = a **public place** (free text, e.g. "Café Toscano, Av. Álvaro Obregón", 3–120 characters) + **one or more weekdays** (no repeats) + a **time range** (end later than start, same day). | ✅ ➕ |
| LST-8 | The place is visible to everyone. Suggest in the UI to use public places, never a home address. | ➕ |
| LST-9 | The success message for each added pair is shown by the app. Nothing is saved until "Publish listing". | ➕ |
| LST-10 | "Publish listing" asks for confirmation in a modal. Publishing is all-or-nothing (listing + photos + pairs), there are no drafts, and the listing goes live as Active immediately. | ✅ ➕ |
| LST-11 | **Editing (see C3):** only the seller, and only while the listing is **Active**. Once reserved (Pending) or Completed, it's frozen: the buyer reserved what they saw. | 🔀 |
| LST-12 | Editable: title, description, category, condition, price and photos. Same rules as when publishing (LST-1 to LST-5): photos are replaced as a whole set of 1 to 3, and the first one is the cover. | 🔀 |
| LST-13 | Editing doesn't change the publish date, so the listing doesn't jump back to the top of the feed. Pickup pairs are managed separately (SAL-6). | ➕ |

---

## 8. Epic 5 — My Listings & Fulfill Sales

| ID | Rule | Tag |
|---|---|---|
| SAL-1 | My Listings has three tabs: **Active**, **Pending** ("En proceso") and **Completed**. | ✅ |
| SAL-2 | Pending items show the bell marker (they need action). | ✅ |
| SAL-3 | A Pending item shows the buyer's name and WhatsApp, the chosen pickup pair and the Maps link. | ✅ |
| SAL-4 | **"Confirm handover"** asks for confirmation in a modal. It can be done only once, moves the item to Completed (it's already out of the feed since it was reserved, RES-6) and doesn't depend on the buyer. It **never blocks the buyer**: they can still confirm reception and rate afterwards. | ✅ ➕ |
| SAL-5 | Completed items keep the sale record: buyer, pickup pair, reservation date and handover date. | ✅ |
| SAL-6 | **"Set my pickup times"** on an Active listing: add or remove pairs until someone reserves it. There must always be at least 1 and at most 3. Existing pairs are not edited in place: remove and add a new one (see **C2**). | 🔀 |

---

## 9. Out of R1

Deleting a listing · cancelling a reservation · in-app chat · payments · wishlist · disputes or refunds · editing the profile or uploading an avatar · requesting verification · multiple currencies or timezones · private addresses or map coordinates.

**Accepted in R1:** photos uploaded but never published (or replaced while editing) stay in S3/R2. No cleanup job; it comes after R1.
