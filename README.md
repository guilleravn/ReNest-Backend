# ReNest Backend

NestJS + Prisma + PostgreSQL API.

## Docs

Single source of truth for data and endpoints. Update them in the same PR as the code that changes them.

- [`docs/api-contract.md`](docs/api-contract.md): endpoints, shapes and error codes.
- [`docs/erd.dbml`](docs/erd.dbml): data model (paste into dbdiagram.io to render).
- [`docs/business-rules.md`](docs/business-rules.md): rule IDs (`RES-5`, `C1`…) referenced by tickets.

## Requirements

- Node.js 22 (see `.nvmrc`)
- Docker

## Setup

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run start:dev
```

- Health check: `GET http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs`
- API routes live under `/api/v1`.

## Scripts

| Script | What it does |
|---|---|
| `npm run lint` | oxlint (type-aware) over `src/` and `test/`. |
| `npm test` | Unit tests (`*.spec.ts`). |
| `npm run test:e2e` | e2e tests (`test/*.e2e-spec.ts`) against `DATABASE_URL_TEST`. The database is created if missing and migrations are applied before the run. Needs `npm run db:up`. |

## Errors

Every error response has the shape from the API contract:

```json
{ "statusCode": 409, "code": "LISTING_NOT_AVAILABLE", "message": "…", "details": null }
```

Throw `AppException` with a code from `src/common/errors/error-code.ts` when the frontend needs a specific `code`. Plain Nest exceptions get a generic code by status (`NOT_FOUND`, `CONFLICT`…). Validation errors are `400 VALIDATION_ERROR` with per-field `details`.
