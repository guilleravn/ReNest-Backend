# ReNest — API Contract · MVP R1

Data model: [`erd.dbml`](erd.dbml). 18 endpoints.

---

## 1. Conventions

| Topic | Rule |
|---|---|
| Base URL | `/api/v1` |
| Format | JSON, `Content-Type: application/json` (except the photo upload: `multipart/form-data`). Fields are **camelCase** (DB stays snake_case; Prisma `@map`). |
| IDs | UUID v7 strings. |
| Auth | `Authorization: Bearer <accessToken>`. Single JWT, no refresh token. Endpoints marked `(public)` need no token; everything else → `401` without a valid token. |
| Money | `priceCents`: **always an integer in cents**, no currency code. The frontend always shows "$" as a generic price sign, for every city (GEN-2). `$1.800,00` → `180000`. Min `100` ($1). The frontend divides by 100 only to display. |
| Pickup times | `"HH:mm"` 24h, **local time of the meetup city**, no timezone. |
| System timestamps | ISO 8601 UTC: `"2026-10-07T15:04:05.000Z"`. |
| Enums | UPPER_SNAKE, same values as the DB. Spanish/display labels live only in the frontend. `city`: `COCHABAMBA_BO`, `AREQUIPA_PE`, `SAN_SALVADOR_SV`, `UTAH_US` ("Cochabamba, BO"…). |
| Photos | The API never returns `storageKey` outside the upload flow; responses carry a ready-to-use `url`. |
| Phone | `phoneE164` appears to the user themself (`/me`, auth), as `seller.phoneE164` on the listing detail for logged-in users, and to the other party inside a reservation. |
| Pagination | Only the feed: `?limit=20&cursor=<opaque>` → `{ "data": [...], "nextCursor": "..." \| null }`. `limit` 1–50. Other lists return plain arrays (a user has few items). |

### 1.1 Error shape

```json
{
  "statusCode": 409,
  "code": "LISTING_NOT_AVAILABLE",
  "message": "This listing was already reserved.",
  "details": null
}
```

- Every error has this shape, including unknown routes and unexpected failures.
- The frontend switches on `code` (stable). `message` is for humans and may change.
- `details` is `null` except on `400 VALIDATION_ERROR`, which lists per-field problems: `[{ "field": "pickupOptions[0].weekdays", "message": "…" }]`. Nested fields use dots and array indexes.
- Unexpected errors are `500 INTERNAL_ERROR` with a generic message; the real error is only logged.

| Status | When | Generic `code` |
|---|---|---|
| `400` | DTO validation failed, or malformed JSON. | `VALIDATION_ERROR` |
| `401` | Missing/invalid/expired token, or wrong credentials. | `UNAUTHORIZED` |
| `403` | Authenticated but wrong role on a resource you can see (e.g. editing someone else's listing). | `FORBIDDEN` |
| `404` | Does not exist **or** the caller must not know it exists (other people's reservations). Also unknown routes. | `NOT_FOUND` |
| `409` | Valid request that conflicts with the current state. | `CONFLICT` |
| `422` | Input refers to something invalid (pickup option from another listing, photo not yours…). | `UNPROCESSABLE_ENTITY` |
| `429` | Too many attempts from the same IP on a rate-limited endpoint (`/auth/login`, `/auth/register`). Carries a `Retry-After` header (seconds). | `RATE_LIMITED` |
| `500` | Unexpected failure. | `INTERNAL_ERROR` |
| `503` | A dependency is down (`GET /health` when the database is unreachable). | `SERVICE_UNAVAILABLE` |

The generic `code` is used only when no domain code applies. Endpoints answer with the domain codes listed in their own section (§3–§6).

### 1.2 Conflicts (`409`)

| Case | Rule | Endpoint | `code` |
|---|---|---|---|
| Two buyers reserve the same item at the same time; the loser gets this. | RES-5 | `POST /reservations` | `LISTING_NOT_AVAILABLE` |
| Seller confirms the handover twice. | SAL-4 | `POST /reservations/:id/handover` | `HANDOVER_ALREADY_CONFIRMED` |
| Buyer confirms reception twice. | PUR-7 | `POST /reservations/:id/reception` | `RECEPTION_ALREADY_CONFIRMED` |
| Buyer rates twice. | PUR-8 | `POST /reservations/:id/rating` | `ALREADY_RATED` |
| Buyer rates before confirming reception. | PUR-8 | `POST /reservations/:id/rating` | `RECEPTION_NOT_CONFIRMED` |
| Adding a 4th pickup option. | SAL-6 | `POST /listings/:id/pickup-options` | `PICKUP_OPTION_LIMIT` |
| Removing the last pickup option. | SAL-6 | `DELETE /listings/:id/pickup-options/:pickupOptionId` | `LAST_PICKUP_OPTION` |
| Editing a listing (details or pickup options) that is Pending or Completed. | C3, LST-11 | `PATCH /listings/:id`, pickup-option endpoints | `LISTING_NOT_EDITABLE` |
| Signing up with an email already in use (any letter case). | AUTH-2 | `POST /auth/register` | `EMAIL_TAKEN` |

---

## 2. Shared objects

**`SellerPublic`** — the seller card
```json
{
  "id": "0192…",
  "fullName": "Laura Gómez",
  "avatarUrl": null,
  "city": "COCHABAMBA_BO",
  "isVerified": true,
  "rating": { "average": 4.9, "count": 63 }
}
```
`avatarUrl = null` → initials. `rating.average` rounded to 1 decimal, `null` when `count = 0`.

**`Photo`** — `{ "id": "0192…", "url": "https://…", "position": 0 }` (`0` = cover, sorted by position)

**`PickupOption`** — all public
```json
{
  "id": "0192…",
  "locationLabel": "Café Toscano, Av. Álvaro Obregón",
  "weekdays": ["SATURDAY"],
  "startTime": "10:00",
  "endTime": "13:00"
}
```
Google Maps link (frontend): `https://www.google.com/maps/search/?api=1&query=<encodeURIComponent(locationLabel)>`.

**`ListingCard`** — feed, seller tabs, purchases
```json
{
  "id": "0192…",
  "title": "Silla de comedor en roble",
  "priceCents": 18000000,
  "condition": "GENTLY_USED",
  "category": { "id": "0192…", "name": "Muebles", "slug": "muebles" },
  "status": "ACTIVE",
  "coverPhotoUrl": "https://…",
  "city": "COCHABAMBA_BO",
  "sellerIsVerified": true,
  "publishedAt": "2026-10-07T15:04:05.000Z"
}
```
`city` = seller's `users.city`.

**`ReservationDetail`** — returned by `POST /reservations`, `GET /reservations/:id`, `POST …/handover` and `POST …/reception`

```json
{
  "id": "0192…",
  "viewerRole": "BUYER",
  "reservedAt": "…",
  "sellerHandedOverAt": null,
  "buyerReceivedAt": null,
  "listing": { /* ListingCard */ },
  "pickupOption": { /* PickupOption */ },
  "counterpart": {
    "id": "0192…",
    "fullName": "Laura Gómez",
    "avatarUrl": null,
    "phoneE164": "+59171234567",
    "isVerified": true
  },
  "receptionChecklist": null,
  "rating": null,
  "actions": {
    "canConfirmHandover": false,
    "canConfirmReception": true,
    "canRate": false
  }
}
```
- `counterpart` = seller for the buyer, buyer for the seller. WhatsApp: `https://wa.me/<phoneE164 without +>`.
- `receptionChecklist`: `null` or `{ matchesListing, worksNoUndisclosedDamage, allPartsIncluded, issueReport, createdAt }`.
- `rating`: `null` or `{ stars, createdAt }`.
- `actions` (server-side, so the UI never re-implements rules):
  - `canConfirmHandover = SELLER && sellerHandedOverAt = null`
  - `canConfirmReception = BUYER && buyerReceivedAt = null`
  - `canRate = BUYER && buyerReceivedAt != null && rating = null`
- `sellerHandedOverAt` set does **not** change any buyer action: the buyer can still confirm reception and then rate.

**`Me`** — the logged-in user
```json
{
  "id": "0192…",
  "email": "laura@example.com",
  "fullName": "Laura Gómez",
  "phoneE164": "+59171234567",
  "city": "COCHABAMBA_BO",
  "avatarUrl": null,
  "isVerified": false
}
```

---

## 3. Auth

### `POST /auth/register` (public)
```json
{
  "email": "laura@example.com",
  "password": "min 8 chars",
  "fullName": "Laura Gómez",
  "phoneE164": "+59171234567",
  "city": "COCHABAMBA_BO"
}
```
| Field | Rule |
|---|---|
| `email` | valid email, ≤ 255, stored lowercased. |
| `password` | 8–72 chars. |
| `fullName` | 2–120 chars. |
| `phoneE164` | **required**, E.164 mobile number of a supported country (AUTH-4): `+591` + `[67]\d{7}`, `+51` + `9\d{8}`, `+503` + `[67]\d{7}`, `+1` + `[2-9]\d{2}[2-9]\d{6}`. Any other prefix or length → `400 VALIDATION_ERROR` on `phoneE164`. The calling code must also match `city` (`COCHABAMBA_BO` → `+591`, `AREQUIPA_PE` → `+51`, `SAN_SALVADOR_SV` → `+503`, `UTAH_US` → `+1`); a mismatch is the same `400 VALIDATION_ERROR` on `phoneE164`. |
| `city` | **required**, one of `COCHABAMBA_BO`, `AREQUIPA_PE`, `SAN_SALVADOR_SV`, `UTAH_US`. |

`201 Created` → same body as login.
Errors: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`, `429 RATE_LIMITED` (default 10 requests per hour per IP).

### `POST /auth/login` (public)
```json
{ "email": "laura@example.com", "password": "…" }
```
`200 OK`
```json
{ "accessToken": "eyJ…", "tokenType": "Bearer", "expiresIn": 86400, "user": { /* Me */ } }
```
JWT payload: `{ sub: userId, iat, exp }`. No logout endpoint: the client discards the token.
Errors: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (same for unknown email and wrong password), `429 RATE_LIMITED` (default 5 requests per minute per IP, counting failed and successful attempts).

### `GET /me`
`200 OK` → `Me`.

---

## 4. Catalog

### `GET /categories` (public)
`200 OK` → `[{ "id", "name", "slug" }]` sorted by `name`.

### `GET /listings` (public) — feed, search, category filter
Only `status = ACTIVE`. Order: `publishedAt DESC, id DESC`.

| Query | Rule |
|---|---|
| `q` | optional, 2–60 chars. `title ILIKE '%q%'` (`%`, `_`, `\` escaped). |
| `category` | optional slug. Unknown slug → empty `data`. |
| `limit`, `cursor` | §1. A malformed `cursor` → `400 VALIDATION_ERROR` (field `cursor`). A cursor stays valid after its listing leaves the feed. |

`200 OK` → `{ "data": ListingCard[], "nextCursor": "…" | null }`

### `GET /listings/:listingId` (public, token optional)
```json
{
  "id": "0192…",
  "title": "Silla de comedor en roble",
  "description": "…",
  "condition": "GENTLY_USED",
  "priceCents": 18000000,
  "status": "ACTIVE",
  "publishedAt": "…",
  "category": { "id": "0192…", "name": "Muebles", "slug": "muebles" },
  "photos": [ /* Photo, 1–3 */ ],
  "pickupOptions": [ /* PickupOption, 1–3 */ ],
  "seller": { /* SellerPublic */, "phoneE164": "+59171234567" },
  "viewer": { "isSeller": false, "canReserve": true, "canEdit": false }
}
```
- `seller` = `SellerPublic` + `phoneE164` (C1). `seller.phoneE164` powers "Doubts about this product?" (WhatsApp). Optional auth: it is **only filled with a valid token**; anonymous → `null` (the app sends the user to login). An invalid or expired token is treated as anonymous, not `401`.
- Non-`ACTIVE` listings still return `200` with their `status` (a shared link shows "Ya no está disponible", BRW-8); `pickupOptions` is `[]` then.
- `canEdit = ACTIVE && isSeller` (edit listing + manage pickup pairs).
- `viewer` with no token: `{ "isSeller": false, "canReserve": false, "canEdit": false }`. `canReserve = ACTIVE && !isSeller`.

Errors: `404 LISTING_NOT_FOUND`.

---

## 5. Selling

### `POST /uploads/photos` — upload one photo
`multipart/form-data`, field `file`. JPEG/PNG/WebP, ≤ 5 MB. The API stores it in the bucket under `uploads/<userId>/<uuid>.<ext>`.

`201 Created`
```json
{ "storageKey": "uploads/0192…/0192….jpg", "url": "https://…" }
```
The frontend calls this once per photo (shows `url` as preview) and sends the `storageKey`s in `POST /listings`.
Uploads that are never published (or photos replaced while editing) stay in the bucket: **accepted in R1**, no cleanup job.
Errors: `400 VALIDATION_ERROR` (missing file), `400 INVALID_FILE` (type/size).

### `POST /listings` — publish (one transaction, no drafts)
```json
{
  "categoryId": "0192…",
  "title": "Silla de comedor en roble",
  "description": "…",
  "condition": "GENTLY_USED",
  "priceCents": 18000000,
  "photoKeys": ["uploads/0192…/a.jpg", "uploads/0192…/b.jpg"],
  "pickupOptions": [
    {
      "locationLabel": "Café Toscano, Av. Álvaro Obregón",
      "weekdays": ["SATURDAY"],
      "startTime": "10:00",
      "endTime": "13:00"
    }
  ]
}
```
| Field | Rule |
|---|---|
| `categoryId` | UUID of an existing category → else `422 CATEGORY_NOT_FOUND`. |
| `title` | 3–120 chars, trimmed. |
| `description` | 1–2000 chars. |
| `condition` | `LIKE_NEW \| GENTLY_USED \| HEAVILY_USED`. |
| `priceCents` | integer, **100 – 2 000 000 000** ($1 minimum). |
| `photoKeys` | **1–3**, unique. Order = `position` (first = cover). Each must start with `uploads/<callerId>/` → else `422 INVALID_PHOTO_KEY`. |
| `pickupOptions` | **1–3**. |
| `locationLabel` | 3–120 chars. |
| `weekdays` | 1–7, no duplicates, `MONDAY…SUNDAY`. |
| `startTime` / `endTime` | `HH:mm`, `endTime > startTime`. |

`201 Created` → listing detail (same shape as `GET /listings/:listingId`).

### `GET /me/listings?status=ACTIVE|PENDING|COMPLETED` — seller tabs
`ACTIVE` = "Activos", `PENDING` = "En proceso", `COMPLETED` = "Completados". `status` is required. Order: `publishedAt DESC`.

`200 OK`
```json
[
  {
    "listing": { /* ListingCard */ },
    "reservation": {
      "id": "0192…",
      "reservedAt": "…",
      "sellerHandedOverAt": null,
      "buyer": { "id": "0192…", "fullName": "Andrés Pérez" },
      "pickupOption": { /* PickupOption */ }
    }
  }
]
```
`reservation` is `null` on `ACTIVE`. The seller opens `GET /reservations/:id` to see the buyer's WhatsApp and confirm the handover.

### Editing an Active listing
Seller only, listing must be `ACTIVE`. The status check and the write run in one transaction with `SELECT … FOR UPDATE` on the listing row, so an edit can't race a reservation.

Errors for the three endpoints below: `400 VALIDATION_ERROR`, `403 NOT_LISTING_OWNER`, `404 LISTING_NOT_FOUND` / `PICKUP_OPTION_NOT_FOUND`, `409 LISTING_NOT_EDITABLE` (Pending or Completed).

#### `PATCH /listings/:listingId` — edit details
Any subset of: `categoryId`, `title`, `description`, `condition`, `priceCents`, `photos`. Same rules as `POST /listings`. Empty body → `400`.

```json
{
  "priceCents": 15000000,
  "photos": [
    { "photoId": "0192…" },
    { "storageKey": "uploads/0192…/new.jpg" }
  ]
}
```
- `photos` **replaces the whole set** (1–3, order = position, first = cover). Each item is either an existing photo (`photoId`, from the listing detail) or a new upload (`storageKey`, from `POST /uploads/photos`). Existing photos left out are deleted.
- `publishedAt` does not change (the listing doesn't jump to the top of the feed).

`200 OK` → listing detail. Extra errors: `422 CATEGORY_NOT_FOUND`, `422 INVALID_PHOTO_KEY` (unknown `photoId` for this listing, or `storageKey` not yours).

#### `POST /listings/:listingId/pickup-options` — add a pair
Body: one pickup option (same fields and rules as in `POST /listings`). `201 Created` → `PickupOption`.
Extra error: `409 PICKUP_OPTION_LIMIT` (would exceed 3).

#### `DELETE /listings/:listingId/pickup-options/:pickupOptionId` — remove a pair
`204 No Content`. Pairs are not edited in place: remove + add.
Extra error: `409 LAST_PICKUP_OPTION` (would leave 0).

---

## 6. Buying

### `POST /reservations` — "Agendar recogida"
```json
{ "listingId": "0192…", "pickupOptionId": "0192…" }
```
One transaction, in this order (the listing row is locked **before** checking the option):
1. Listing missing → `404 LISTING_NOT_FOUND`. Caller is the seller → `403 CANNOT_RESERVE_OWN_LISTING`.
2. `UPDATE listings SET status='PENDING' WHERE id=? AND status='ACTIVE'` → 0 rows → `409 LISTING_NOT_AVAILABLE`. This also locks the row.
3. Option not of this listing → `422 INVALID_PICKUP_OPTION` (the transaction rolls back, the listing goes back to `ACTIVE`).
4. `INSERT reservations`. Prisma errors mapped as a safety net:
   - `P2002` (unique `listing_id`) → `409 LISTING_NOT_AVAILABLE`.
   - `P2003` (composite FK: option deleted or from another listing) → `422 INVALID_PICKUP_OPTION`.

Why this order: removing a pickup option also locks the listing row (`SELECT … FOR UPDATE`) and requires `ACTIVE`. Once step 2 holds the lock, a concurrent `DELETE …/pickup-options/:id` waits, then sees `PENDING` and gets `409 LISTING_NOT_EDITABLE`. So the option can't disappear between the check and the insert.

`201 Created` → `ReservationDetail`. No cancel in R1.

### `GET /me/purchases?status=IN_PROGRESS|COMPLETED`
`status` is required. `IN_PROGRESS` = tab **"Agendados"**, `COMPLETED` = tab **"Completados"**.
Derived (no status column): `COMPLETED` = `buyerReceivedAt` is set; `IN_PROGRESS` = `buyerReceivedAt` is null. **Only the buyer's reception moves a purchase**; the seller's handover doesn't (the card can show "Seller confirmed the handover" from `sellerHandedOverAt`). Order: `reservedAt DESC`.

`200 OK`
```json
[
  {
    "id": "0192…",
    "reservedAt": "…",
    "sellerHandedOverAt": null,
    "buyerReceivedAt": null,
    "listing": { /* ListingCard */ },
    "pickupOption": { /* PickupOption */ }
  }
]
```

### `GET /reservations/:reservationId` — "Resumen de la recogida"
Buyer and seller only; anyone else → `404 RESERVATION_NOT_FOUND`.
`200 OK` → `ReservationDetail` (§2).

### `POST /reservations/:reservationId/handover` — seller: "Confirmar entrega"
No body. One transaction: `UPDATE reservations SET seller_handed_over_at = now() WHERE id=? AND seller_handed_over_at IS NULL` + `listings.status = 'COMPLETED'`.

`200 OK` → `ReservationDetail`.
Errors: `403 NOT_RESERVATION_SELLER`, `404 RESERVATION_NOT_FOUND`, `409 HANDOVER_ALREADY_CONFIRMED`.

### `POST /reservations/:reservationId/reception` — buyer: "Marcar como recogido" + "Lista de recepción"
Optional for the buyer; independent of the seller's handover (works before or after it).

```json
{
  "matchesListing": true,
  "worksNoUndisclosedDamage": true,
  "allPartsIncluded": true,
  "hasItemNow": true,
  "issueReport": "La pantalla tiene un rayón que no estaba en las fotos."
}
```
| Field | Screen | Rule |
|---|---|---|
| `matchesListing` | El artículo coincide con las fotos y la descripción | required boolean |
| `worksNoUndisclosedDamage` | Funciona / sin daños no informados | required boolean |
| `allPartsIncluded` | Incluye todas las partes y accesorios | required boolean |
| `hasItemNow` | Tengo el artículo conmigo ahora | **must be `true`** (button disabled until checked). Not stored. |
| `issueReport` | ¿Algo que quieras reportar? (opcional) | `string \| null`, trimmed, ≤ 1000; `""` → `null` |

Unchecked boxes are sent as `false`. A `false` does not block the confirmation, it is recorded.

One transaction: `UPDATE reservations SET buyer_received_at = now() WHERE id=? AND buyer_received_at IS NULL` + `INSERT reception_checklists`.

`200 OK` → `ReservationDetail` (`actions.canRate = true`).
Errors: `400 VALIDATION_ERROR`, `403 NOT_RESERVATION_BUYER`, `404 RESERVATION_NOT_FOUND`, `409 RECEPTION_ALREADY_CONFIRMED`.

### `POST /reservations/:reservationId/rating` — buyer rates the seller
```json
{ "stars": 5 }
```
`stars`: integer 1–5. `seller_id` comes from `reservation → listing.seller_id`, never from the body.

`201 Created` → `{ "stars": 5, "createdAt": "…" }`
Errors: `400 VALIDATION_ERROR`, `403 NOT_RESERVATION_BUYER`, `404 RESERVATION_NOT_FOUND`, `409 RECEPTION_NOT_CONFIRMED`, `409 ALREADY_RATED`.

---

## 7. Endpoint index

Auth column:
- `Public`: no token needed.
- `Required`: any logged-in user.
- `Seller`, `Buyer`, `Party`: a logged-in user who is, respectively, the seller, the buyer, or either side of that listing or reservation.

| Method | Path | Auth | Screen |
|---|---|---|---|
| POST | `/auth/register` | Public | Registro |
| POST | `/auth/login` | Public | Login |
| GET | `/me` | Required | |
| GET | `/categories` | Public | Feed filter, Nuevo artículo |
| GET | `/listings` | Public | Feed |
| GET | `/listings/:listingId` | Public | Detalle del artículo |
| POST | `/uploads/photos` | Required | Nuevo artículo |
| POST | `/listings` | Required | Nuevo artículo → Continuar → lugares |
| GET | `/me/listings` | Required | Vendedor: Activos / En proceso / Completados |
| PATCH | `/listings/:listingId` | Seller | Editar artículo (Active only) |
| POST | `/listings/:listingId/pickup-options` | Seller | Set my pickup times: agregar |
| DELETE | `/listings/:listingId/pickup-options/:pickupOptionId` | Seller | Set my pickup times: quitar |
| POST | `/reservations` | Required | Agendar recogida |
| GET | `/me/purchases` | Required | Mis compras |
| GET | `/reservations/:reservationId` | Party | Resumen de la recogida |
| POST | `/reservations/:reservationId/handover` | Seller | Confirmar entrega |
| POST | `/reservations/:reservationId/reception` | Buyer | Lista de recepción |
| POST | `/reservations/:reservationId/rating` | Buyer | Calificar vendedor |

## 8. Error codes

**Generic** (one per status, see §1.1): `VALIDATION_ERROR`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `UNPROCESSABLE_ENTITY`, `HTTP_ERROR` (any other 4xx), `SERVICE_UNAVAILABLE`, `INTERNAL_ERROR`.

**Domain:** `INVALID_FILE`, `INVALID_CREDENTIALS`, `EMAIL_TAKEN`, `LISTING_NOT_FOUND`, `CATEGORY_NOT_FOUND`, `INVALID_PHOTO_KEY`, `NOT_LISTING_OWNER`, `LISTING_NOT_EDITABLE`, `PICKUP_OPTION_NOT_FOUND`, `PICKUP_OPTION_LIMIT`, `LAST_PICKUP_OPTION`, `CANNOT_RESERVE_OWN_LISTING`, `INVALID_PICKUP_OPTION`, `LISTING_NOT_AVAILABLE`, `RESERVATION_NOT_FOUND`, `NOT_RESERVATION_SELLER`, `NOT_RESERVATION_BUYER`, `HANDOVER_ALREADY_CONFIRMED`, `RECEPTION_ALREADY_CONFIRMED`, `RECEPTION_NOT_CONFIRMED`, `ALREADY_RATED`, `RATE_LIMITED`.

Backend source: `src/common/errors/error-code.ts`. Keep the frontend copy in sync.

## 9. Out of scope for R1

Deleting a listing · editing a listing once reserved · editing a pickup pair in place · cancelling a reservation · editing the profile or uploading an avatar (seed only) · verifying sellers via API (manual) · private addresses (only public `locationLabel`) · multiple currencies or timezones.
