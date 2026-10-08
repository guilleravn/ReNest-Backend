# ReNest Business Rules (MVP R1)

The product rules the MVP must enforce. Each rule has a stable ID (`RES-5`, `LST-2`, ...) that tickets, tests and code reviews reference. Data model: [`erd.dbml`](erd.dbml). Endpoints: [`api-contract.md`](api-contract.md).

- Rules are enforced by the backend. The frontend mirrors validations for UX only.
- UI copy is in Spanish. Quoted UI strings below are English references, and the app shows the Spanish equivalent. Where the exact Spanish label matters, it is given in parentheses.
- The PRD column says how each rule relates to the PRD:
  - `PRD`: matches it.
  - `Added`: a detail the PRD doesn't specify, decided to make the feature buildable.
  - `Resolved`: differed from the PRD; the decision is in section 1.

---

## 1. Deviations from the PRD

The PRD (`renest-prd.md`) is the product vision. Where these rules differ from it, the rules win.

| # | PRD says | Decision |
|---|---|---|
| C1 | The buyer can message the seller on WhatsApp before reserving. | Kept. The listing detail shows the seller's WhatsApp to logged-in users only (GEN-7). |
| C2 | The seller can add or remove pickup pairs on an Active listing until it's reserved. | Kept. Add and remove only, with no in-place edit (SAL-6). |
| C3 | The seller can edit their own listings. | Kept. The seller can edit while the listing is Active (LST-11 to LST-13). |
| C4 | The seller "marks payment received". | Removed. There are no payments in the app; money is exchanged in person (GEN-9). |
| C5 | Epic 3 ends with the buyer confirming reception, and then the purchase shows as Completed. | Kept for the buyer side. Only the buyer's own reception completes the purchase. Reception stays optional, and the seller's handover never takes that option away (PUR-2, PUR-4). |
| C6 | North Star "completed transactions per week" is not defined. | Defined in section 10. |
| C7 | A listing has one photo. | Changed to 1 to 3 photos (LST-1). |
| C8 | KPIs mention Wishlist and "Buy Now". | No wishlist in R1. "Buy Now" means "Schedule Pickup". |
| C9 | Dispute rate KPI, with no dispute flow. | Measured from the reception checklist (section 10). |

---

## 2. General

| ID | Rule | PRD |
|---|---|---|
| GEN-1 | One account can be both buyer and seller. There is no role field: you are the seller on your listings and the buyer on your reservations. | PRD |
| GEN-2 | Prices are integers in cents. There is no currency field and no conversion: the app always shows "$" as a generic price sign, whatever the city or country. Buyer and seller settle the actual money in person. Minimum $1 (100 cents), maximum $20,000,000 (2,000,000,000 cents). | Added |
| GEN-3 | Pickup times are the local time of the meetup city. No timezones. | Added |
| GEN-4 | System timestamps (created, reserved, confirmed) are stored in UTC. | Added |
| GEN-5 | Browsing is public: the feed, search and listing detail work without logging in. Every action (publish, edit, reserve, confirm, rate) requires login. | Added |
| GEN-6 | Messaging is WhatsApp only, through a `wa.me` link with the other person's phone. No in-app chat. | PRD |
| GEN-7 | Phone visibility: the seller's WhatsApp is shown on the listing detail to logged-in users only, never to anonymous visitors. The buyer's phone is shown only to the seller of the listing that buyer reserved. | Resolved |
| GEN-8 | "Verified seller" is set manually by the ReNest team (seed or database). It can't be requested in the app. | Added |
| GEN-9 | No payments in the app. Money is exchanged in person. | Resolved |
| GEN-10 | Reservations can't be cancelled in R1. A listing can be reserved only once. | Added |

### Lifecycle

```
Listing (seller side)
ACTIVE ──(buyer confirms reservation)──▶ PENDING ──(seller confirms handover)──▶ COMPLETED
"Activos"                                "En proceso"                             "Completados"

Purchase (buyer side, independent)
IN_PROGRESS ──(buyer confirms reception)──▶ COMPLETED
"Agendados"                                 "Completados"
```

Each side completes only with its own confirmation. The seller's handover doesn't move the buyer's purchase, and it doesn't remove the buyer's "I picked up the item" or rating options. The buyer's reception doesn't move the listing.

---

## 3. Account

| ID | Rule | PRD |
|---|---|---|
| AUTH-1 | Sign up requires email, password, full name, phone and city. The city comes from a fixed list: Cochabamba (BO), Arequipa (PE), San Salvador (SV), Utah (US). It is stored as an enum (`COCHABAMBA_BO`, ...); the labels live in the frontend. | Added |
| AUTH-2 | Email is unique and case-insensitive (`Ana@x.com` equals `ana@x.com`). | Added |
| AUTH-3 | Password: 8 to 72 characters. | Added |
| AUTH-4 | Phone in E.164 format, because it builds the WhatsApp link. Only mobile numbers of the four supported countries are accepted: Bolivia `+591` (8 digits, starts with 6 or 7), Peru `+51` (9 digits, starts with 9), El Salvador `+503` (8 digits, starts with 6 or 7), United States `+1` (10 digits, area code and exchange start with 2-9). The backend validates the number against the country its prefix names; it does not check that the prefix matches the chosen city (the frontend guarantees it). | Added |
| AUTH-5 | Login with email and password. On failure the message is always "Incorrect email or password", never revealing whether the email exists. | Added |
| AUTH-6 | A single session token lasting 1 day, with no refresh. When it expires, the user logs in again. Logout discards the token on the client. | Added |
| AUTH-7 | No avatar upload in R1. The app shows the user's initials. | Added |
| AUTH-8 | The Account tab ("Cuenta") shows the user's name, email, phone and city (read-only) and a logout button. | Added |
| AUTH-9 | Login and register are rate limited per client IP to slow down brute force and mass sign-ups. Login: 5 requests per minute (failed and successful attempts both count). Register: 10 requests per hour. Each endpoint has its own counter. Over the limit the API answers `429 RATE_LIMITED` with a `Retry-After` header (seconds), even if the credentials are correct. The limits are configurable (`AUTH_LOGIN_LIMIT`, `AUTH_LOGIN_WINDOW`, `AUTH_REGISTER_LIMIT`, `AUTH_REGISTER_WINDOW`). | Added |

---

## 4. Browse and evaluate (Epic 1)

| ID | Rule | PRD |
|---|---|---|
| BRW-1 | The feed shows only Active listings, newest first. | PRD |
| BRW-2 | Search matches the title only, case-insensitive, with a minimum of 2 characters. | Added |
| BRW-3 | Category filter over a fixed, seeded list: "Muebles", "Electrónica", "Hogar" (there is no admin endpoint). It combines with search. | PRD |
| BRW-4 | Each card shows the cover photo, title, price, condition, category, seller city and the "Verified seller" badge when applicable. | PRD |
| BRW-5 | The detail shows 1 to 3 photos, price, condition, category, description, the listing's pickup pairs and the seller snapshot. | PRD |
| BRW-6 | Seller snapshot: name, initials, verified badge, rating (average with 1 decimal and number of ratings) and city. With 0 ratings it shows "No ratings yet", not "0.0". | PRD, Added |
| BRW-7 | "Doubts about this product?" opens WhatsApp with the seller. Anonymous visitors are sent to login first (GEN-7). | Resolved |
| BRW-8 | A listing that is Pending or Completed (for example, opened from a shared link) still opens, shows "No longer available" and has no "Schedule Pickup" button. | Added |
| BRW-9 | The seller doesn't see "Schedule Pickup" on their own listing. | Added |
| BRW-10 | The feed and search return 20 listings per page, loaded with a "Load more" button. | Added |

---

## 5. Reserve and schedule pickup (Epic 2)

| ID | Rule | PRD |
|---|---|---|
| RES-1 | Reserving requires login. | Added |
| RES-2 | The buyer picks exactly one pickup pair (place, days and time range) from the listing's pairs. The exact day within those days is agreed on WhatsApp. | PRD, Added |
| RES-3 | One confirmation (the modal) does both things at once: it reserves the listing and fixes the pickup pair. | PRD |
| RES-4 | A user can't reserve their own listing. | Added |
| RES-5 | First come, first served. If two buyers confirm at the same moment, exactly one gets the listing; the other sees "This item was just reserved". | Added |
| RES-6 | Once reserved, the listing leaves the feed and search. It can no longer be edited, and its pickup pairs can no longer change. | Added |
| RES-7 | After confirming, the buyer sees the place, days and time range, a Google Maps link (a search URL built from the place text) and the seller's WhatsApp button. | PRD |
| RES-8 | "See more products" returns to the feed. The reservation waits in My Purchases; nothing forces the next step. | PRD |

---

## 6. My purchases and reception (Epic 3)

| ID | Rule | PRD |
|---|---|---|
| PUR-1 | My Purchases has two tabs: In progress ("Agendados") and Completed ("Completados"). | PRD |
| PUR-2 | A purchase moves to Completed only when the buyer confirms reception (C5). The seller's handover doesn't move it; the recap shows "The seller confirmed the handover". | Resolved |
| PUR-3 | The purchase recap shows the listing, the seller info with WhatsApp, the chosen pickup pair and the Maps link. | PRD |
| PUR-4 | Confirming reception is optional. It stays available until done, whether or not the seller already confirmed the handover. | Resolved |
| PUR-5 | "I picked up the item" opens the reception checklist, described below the table. | PRD |
| PUR-6 | Unchecked yes/no items don't block confirmation. They are saved as "no" and feed the dispute rate (section 10). | Added |
| PUR-7 | Reception can be confirmed only once and can't be changed. | Added |
| PUR-8 | Rating: 1 to 5 stars, no comment. Only the buyer of that purchase can rate, only after confirming reception, only once, and it can't be edited. | PRD, Added |
| PUR-9 | The rating can be skipped. If skipped, it stays available from the purchase recap. | Added |
| PUR-10 | Ratings count toward the seller's average on the seller snapshot (BRW-6). | PRD |

The reception checklist (PUR-5) has these items:
- "The item matches the photos and description": yes/no.
- "Works / no undisclosed damage": yes/no.
- "Includes all parts and accessories": yes/no.
- "I have the item with me now": must be checked to continue, and is not stored.
- "Anything to report?": optional text, at most 1000 characters.

---

## 7. Create and publish a listing (Epic 4)

| ID | Rule | PRD |
|---|---|---|
| LST-1 | Required fields: 1 to 3 photos (the first is the cover), title, description, category, condition and price. | Resolved |
| LST-2 | Photos: JPEG, PNG or WebP, at most 5 MB each. | Added |
| LST-3 | Title: 3 to 120 characters. Description: at most 2000 characters. | Added |
| LST-4 | Condition: `LIKE_NEW` ("Como nuevo"), `GENTLY_USED` ("Poco uso") or `HEAVILY_USED` ("Muy usado"). | PRD |
| LST-5 | Price: within the GEN-2 limits. | Added |
| LST-6 | A listing has 1 to 3 pickup pairs. | PRD, Added |
| LST-7 | A pickup pair is a public place (free text, 3 to 120 characters, for example "Café Toscano, Av. Álvaro Obregón"), one or more weekdays with no repeats, and a time range on the same day where the end is later than the start. | PRD, Added |
| LST-8 | The place is visible to everyone. The UI suggests a public place and never a home address. | Added |
| LST-9 | The success message for each added pair is shown by the app. Nothing is saved until "Publish listing". | Added |
| LST-10 | "Publish listing" asks for confirmation in a modal. Publishing is all-or-nothing (listing, photos and pairs), there are no drafts, and the listing goes live as Active immediately. | PRD, Added |
| LST-11 | Editing (C3): only the seller, and only while the listing is Active. Once Pending or Completed the listing is frozen, because the buyer reserved what they saw. | Resolved |
| LST-12 | Editable fields: title, description, category, condition, price and photos, with the same rules as publishing (LST-1 to LST-5). Photos are replaced as a whole set of 1 to 3, and the first one is the cover. | Resolved |
| LST-13 | Editing doesn't change the publish date, so the listing doesn't jump back to the top of the feed. Pickup pairs are managed separately (SAL-6). | Added |

---

## 8. My listings and fulfill sales (Epic 5)

| ID | Rule | PRD |
|---|---|---|
| SAL-1 | My Listings has three tabs: Active ("Activos"), Pending ("En proceso") and Completed ("Completados"). | PRD |
| SAL-2 | Pending listings show a bell marker, because they need action. | PRD |
| SAL-3 | A Pending listing shows the buyer's name and WhatsApp, the chosen pickup pair and the Maps link. | PRD |
| SAL-4 | "Confirm handover" asks for confirmation in a modal. It can be done only once, moves the listing to Completed, and doesn't depend on the buyer. It never blocks the buyer: they can still confirm reception and rate afterwards. | PRD, Added |
| SAL-5 | Completed listings keep the sale record: buyer, pickup pair, reservation date and handover date. | PRD |
| SAL-6 | "Set my pickup times" on an Active listing adds or removes pickup pairs. A listing always has 1 to 3 pairs. Existing pairs are not edited in place: remove one and add a new one (C2). | Resolved |

---

## 9. Out of R1

- Deleting a listing.
- Cancelling a reservation.
- In-app chat.
- Payments.
- Wishlist.
- Disputes or refunds.
- Editing the profile or uploading an avatar.
- Requesting verification.
- Notifications.
- Multiple currencies or timezones.
- Private addresses or map coordinates.

**Accepted in R1:**
- Photos that are uploaded but never published, or that are replaced while editing, stay in storage. There is no cleanup job.
- If the buyer confirms reception but the seller never confirms the handover, the listing stays Pending on the seller side. The seller can still confirm it.

---

## 10. Metrics definitions

| Metric | Definition |
|---|---|
| North Star: completed transactions per week | Reservations where at least one side confirmed the exchange in the week: the seller confirmed the handover (`seller_handed_over_at`) or the buyer confirmed reception (`buyer_received_at`), whichever came first. Each reservation counts once. |
| Dispute rate | Confirmed receptions with at least one "no" answer or a non-empty report, divided by all confirmed receptions. |
