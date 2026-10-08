# ReNest Backend

REST API for ReNest, a secondhand marketplace for LatAm, built with NestJS 12, Prisma 7 and PostgreSQL. The frontend (React + Vite) lives in `../ReNest-Frontend`. Fullstack tickets run in one session started here with `--add-dir ../ReNest-Frontend`.

## Commands

- `npm run db:up` / `npm run db:down`: start or stop Postgres and the local S3 storage, RustFS (Docker).
- `npm run start:dev`: API on `http://localhost:3000`, with routes under `/api/v1` and Swagger at `/docs`.
- `npm run db:migrate -- --name <change>`: create and apply a migration.
- `npm run seed`: load the demo data (idempotent; users in the README).
- `npm run lint` · `npm test` (unit) · `npm run test:e2e` (uses `DATABASE_URL_TEST` and `S3_BUCKET_TEST`; needs `db:up`).
- Before every commit: `npm run lint && npm test && npm run test:e2e`.

## Architecture

- There is one Nest module per domain in `src/<domain>/`.
  - The controller handles HTTP, DTO validation, auth guards and Swagger decorators.
  - The service holds business rules and queries Prisma directly. There is no repository layer.
- `src/app.setup.ts` holds the global prefix, validation pipe, error filter and Swagger. `main.ts` and the e2e tests both use it, so register global behavior there.
- Prisma: the schema is in `prisma/schema.prisma`; the client is generated into `src/generated/prisma`, which you never edit.
  - Never edit a migration that has already been applied. Create a new one.
- Env vars are validated with zod in `src/config/env.validation.ts`. A new variable goes there and in `.env.example`.
- ESM project: relative imports end in `.js` (`import { X } from './x.js'`).

## Conventions

- Business rules are enforced here, not in the frontend. Rules have IDs (`RES-5`); cite them in test names, not in code comments.
- Errors follow `docs/api-contract.md` section 1.1 (statuses) and each endpoint's listed codes:
  - when the endpoint defines a domain code, throw `AppException` with the code from `src/common/errors/error-code.ts` (`throw new AppException(409, ErrorCode.LISTING_NOT_AVAILABLE, '...')`);
  - a new code goes in `error-code.ts` and in the contract;
  - plain Nest exceptions are fine when only the generic code applies.
- Money is an integer in cents. Timestamps are stored in UTC. Enum values are in English, in UPPER_SNAKE (`COCHABAMBA_BO`); Spanish labels belong to the frontend.
- State changes that must not race use a single conditional update or a row lock inside a transaction, as the contract describes for each endpoint (RES-5, LST-11).

## Docs: read on demand, only the part you need

- `docs/business-rules.md`: product rules by ID. Read the section for the domain you touch.
- `docs/api-contract.md`: endpoints, shapes and error codes. Read the section of the endpoint you implement.
- `docs/erd.dbml`: data model. Any change to the contract or the model needs the team's agreement.
- `docs/decisions.md`: why the stack and process are the way they are.
- `.claude/rules/testing.md`: testing standards. Read it before writing tests.

**Keep docs in sync:** if a change alters a rule, an endpoint, the data model or a decision, update the matching doc in the same commit.

## Git workflow

The same block is in both repos; keep them identical.

- `develop` is the integration branch. `main` is production and only receives PRs from `develop`.
- Branch from `origin/develop`, using the name Linear gives the issue (`<user>/ren-45-...`). Use the same name in both repos.
- Commit in small slices. Each commit:
  - does one coherent thing;
  - builds, passes lint and tests, and includes its own tests;
  - never mixes a refactor with a feature.
- Message format: Conventional Commits with a scope, in English and in the imperative mood. A subject of 72 characters or less. Add a `Refs: REN-xx` trailer.

  ```
  feat(reservations): reject reserving your own listing

  Refs: REN-50
  ```
- Review fixes: `git commit --fixup <sha>`. Before merging, rebase on the latest develop with `git rebase --autosquash origin/develop` (Git 2.44+), then `git push --force-with-lease`. Commits like "fix review" or "wip" never reach `develop`.
- PRs target `develop` and are merged with **"Create a merge commit"**. Never squash, which loses the slices, and never "Rebase and merge", which rewrites every hash. Use one PR per repo per ticket, link the two PRs to each other, and put `Closes REN-xx` in the body.
- Never: `--no-verify`, pushing directly to `develop` or `main`, or committing `.env` files.
