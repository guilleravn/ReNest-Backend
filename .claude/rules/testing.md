---
paths:
  - "src/**/*.spec.ts"
  - "test/**"
---

# Backend testing standards

Tests prove the business rules hold. A test that can't fail when a rule breaks is worthless.

## What to test where

- **e2e (`test/*.e2e-spec.ts`, supertest):** the default for anything with a business rule. Hit the real HTTP endpoint against a real Postgres. Never mock Prisma here.
- **Unit (`src/**/*.spec.ts`, Vitest):** only pure logic with no I/O, such as a price or date helper. Don't unit-test controllers or services that only call Prisma.
- Don't test the framework: Nest wiring, `class-validator` itself, or Prisma itself.

## Rules

- Build the app under test with `setupApp` (`src/app.setup.ts`), so the prefix, validation and error format match production.
- Write one test per branch of the rule: the happy path plus each rejection. Each test asserts:
  - the status code;
  - the response body, including the error `code` from the API contract on rejections;
  - the database state, when the action writes something.
- Name tests after behavior and cite the rule ID:
  `describe('POST /reservations (RES-1..8)')` → `it('returns 409 LISTING_NOT_AVAILABLE when the listing was just reserved (RES-5)')`.
- Use Arrange / Act / Assert. One behavior per test.
- Create the data each test needs with small factory helpers in `test/factories/`. Never rely on the demo seed or on another test's data.
- Isolation: truncate the tables in `beforeEach`, as `test/schema.e2e-spec.ts` does. Tests must pass in any order.
- e2e tests run against `DATABASE_URL_TEST`; `vitest.config.e2e.ts` refuses to run if it is missing or equals `DATABASE_URL`. Never work around that check.
- Authenticated requests: get a real token through the auth helper, so the guards are exercised.
- Concurrency rules (RES-5): fire the competing requests with `Promise.all`, then assert that exactly one succeeded, the rest got `409`, and the database holds exactly one reservation.
- Write the tests for a rule before the implementation when possible, and see them fail first.
- No snapshots. No `it.skip` or `it.only` committed. No arbitrary timeouts or sleeps.
