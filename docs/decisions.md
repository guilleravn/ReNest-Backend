# Decisions

Short record of the technical and process decisions behind the MVP. Add an entry when a decision affects more than one ticket; update the entry if it changes. Product rules and PRD deviations live in [`business-rules.md`](business-rules.md).

---

## D-1. Two repos, contract-first, vertical slices

- **Context:** three devs, three days, a separate frontend and backend.
- **Decision:** the API contract ([`api-contract.md`](api-contract.md)) is agreed before feature work starts. Each ticket is a vertical slice (backend, frontend and tests) with a single owner. Owners are split by domain (buyer discovery, seller, account and purchases).
- **Consequences:** frontend and backend of a slice never wait on each other, and merge conflicts stay low. Contract changes must be agreed and documented before code.

## D-2. Frontend: React + Vite SPA

- **Context:** the PRD said "cross-platform". The app has no SEO or SSR needs and consumes a separate API.
- **Decision:** a React + Vite single-page app with React Router, Tailwind and shadcn. Not Next.js.
- **Consequences:** simpler build and mental model. Vercel needs a rewrite to `index.html` so client-side routes don't 404.

## D-3. Backend: NestJS + Prisma + PostgreSQL

- **Decision:** NestJS with Prisma 7 (PostgreSQL adapter). Postgres runs in Docker locally and on Railway in production.
- **Consequences:** business rules are enforced in services and covered by e2e tests against a real database (D-8).

## D-4. Deploy: Vercel + Railway

- **Decision:** the frontend is on Vercel. The API, Postgres and photo storage are on Railway (one project).
- **Consequences:** a single platform for everything stateful. The walking skeleton is deployed on Day 1 to catch deployment issues early.

## D-5. Photo storage: S3 API, no MinIO in production

- **Context:** MinIO Community is unmaintained (no images since Oct 2025, repository archived in Apr 2026).
- **Decision:** a `StorageService` built on the AWS S3 SDK, configured only by env. Locally it uses an S3-compatible container; in production, a Railway Bucket. Buckets are private, so the API returns presigned GET URLs.
- **Consequences:** switching environments changes env vars, not code. Photo URLs expire, so the API generates them per response.

## D-6. Auth: a single JWT, 1 day, no refresh

- **Decision:** see AUTH-6. The value lives in `JWT_EXPIRES_IN` (`1d`) and is returned as `expiresIn` by the login endpoint. Logout only discards the token on the client.
- **Consequences:** simple, and enough for an MVP demo. Tokens can't be revoked server-side.

## D-7. Language

- **Decision:** code, docs, tickets, commits and API values (enums) are in English. UI copy is in Spanish (LatAm audience). No i18n library; Spanish labels for enums live in one place in the frontend.

## D-8. Testing strategy

- **Decision:**
  - **Backend:** every business rule has e2e tests (happy path and each rejection) against a real Postgres test database (`DATABASE_URL_TEST`, never the dev one). Unit tests are only for pure logic.
  - **Frontend:** Playwright only. One spec per flow, with the API mocked; plus the full happy path end to end at release.
  - No frontend unit tests in R1.
- **Consequences:** rules are verified where they are enforced. Standards live in each repo's `.claude/rules/testing.md`.

## D-9. Git: small-slice commits, merge commits

- **Context:** AI-assisted development relies on readable history (`git log -p`, `git blame`, `git bisect`) to understand and review changes.
- **Decision:**
  - Each commit is one small, coherent, green slice with its tests.
  - Commits use Conventional Commits with a `Refs: REN-xx` trailer.
  - Before merging, the branch is rebased on `origin/develop`, using `--autosquash` to fold in the review fixes (`git commit --fixup`). Each PR then lands as a clean block on top of `develop`.
  - Feature PRs are merged into `develop` with a **merge commit** ("Create a merge commit"). In GitHub, merge commits are the only merge method enabled:
    - never squash, because it collapses the slices into one commit;
    - never "Rebase and merge", because GitHub rewrites every commit hash. That breaks branches built on top of the PR and local branch cleanup.
- **Consequences:**
  - Every slice keeps its diff, its intent and its hash after review.
  - The merge commit groups the PR and names it. `git log --first-parent develop` shows one line per PR.
  - A whole PR can be reverted with `git revert -m 1 <merge>`.
  - Ticket grouping is also available with `git log --grep REN-xx`.

## D-10. Branches: `develop` for integration, `main` for production

- **Decision:**
  - Every feature branch starts from `develop` and its PR targets `develop`.
  - `main` is production. It only receives a PR from `develop` when the team decides a version is stable, merged with a **merge commit**. Rebasing would rewrite the hashes and make `main` and `develop` diverge.
  - No direct pushes to `develop` or `main`. GitHub branch protection enforces it; local Claude permissions are only a convenience.

## D-11. The deployed environment is a demo

- **Context:** the deployed app is the demo our tutors review, so it needs realistic data from day one.
- **Decision:** the demo seed (`npm run seed`) also runs in the deployed environment, with the public credentials from the README. `tsx` is a devDependency and may not be installed on Railway, so run the seed from a local machine with `DATABASE_URL` and `S3_*` pointing at the deployed database and bucket.
- **Consequences:**
  - Anyone who reads the README can log in as the demo users.
  - If someone signs up with a real phone and reserves a demo seller's listing, anyone with the public password can see that number (GEN-7). Use made-up phone numbers when testing the deployed environment.

## D-12. Rate limiting: in-memory, per IP

- **Context:** login and register are public, so they need a brake against brute force and mass sign-ups (AUTH-9).
- **Decision:** use `@nestjs/throttler` with its default in-memory store, keyed by client IP, on `/auth/login` and `/auth/register` only.
- **Why it is acceptable now:**
  - R1 runs a single API instance, so one process sees every request and the counters are exact.
  - It adds no infrastructure (no Redis) to a demo-scale deployment.
- **Consequences:**
  - Counters reset when the process restarts, and are not shared if we ever run more than one instance. Then we would move to a shared store such as Redis.
  - Pending before relying on it in the deployed environment: behind the Railway proxy every request looks like it comes from the proxy's IP, so all users would share one counter. Set `trust proxy` on the Express app so `req.ip` comes from `X-Forwarded-For`, and check the proxy hop count so clients cannot spoof the header.
