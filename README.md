# ReNest Backend

REST API for ReNest, a secondhand marketplace for LatAm where buyers reserve an item together with a pickup slot and both sides confirm the exchange. Built with NestJS, Prisma and PostgreSQL.

Frontend: [ReNest-Frontend](https://github.com/guilleravn/ReNest-Frontend). Work tracking: Linear project "ReNest MVP R1".

## Documentation

These docs are the single source of truth. Update them in the same PR as the code that changes them.

| Doc | What it holds |
|---|---|
| [docs/business-rules.md](docs/business-rules.md) | Product rules by ID (`RES-5`), PRD deviations, metrics |
| [docs/api-contract.md](docs/api-contract.md) | Endpoints, shapes and error codes |
| [docs/erd.dbml](docs/erd.dbml) | Data model (paste into dbdiagram.io to render) |
| [docs/decisions.md](docs/decisions.md) | Technical and process decisions, with their reasons |
| [CLAUDE.md](CLAUDE.md) | Conventions and git workflow (read by humans and Claude) |

## Requirements

- Node.js 22 (see `.nvmrc`)
- Docker

## Setup

```bash
cp .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run seed
npm run start:dev
```

- Health check: `GET http://localhost:3000/health`
- Swagger: `http://localhost:3000/docs`
- API routes live under `/api/v1`.

## Scripts

| Script | What it does |
|---|---|
| `npm run start:dev` | Runs the API in watch mode. |
| `npm run db:up` / `db:down` | Starts or stops Postgres and the local S3 storage (RustFS, console on `http://localhost:9001`) in Docker. |
| `npm run db:migrate` | Creates and applies a migration (`-- --name <change>`). |
| `npm run seed` | Loads the demo data (see [Demo data](#demo-data)). Safe to run again. |
| `npm run db:studio` | Opens a browser for the database. |
| `npm run lint` | Runs oxlint (type-aware) over `src/`, `test/` and `prisma/`. |
| `npm test` | Runs the unit tests (`*.spec.ts`). |
| `npm run test:e2e` | Runs the e2e tests (`test/*.e2e-spec.ts`) against `DATABASE_URL_TEST`. The database is created if missing, and migrations are applied before the run. Needs `npm run db:up`. |

## Demo data

`npm run seed` creates the categories (BRW-3) and the demo users. It only creates what is missing, so running it again changes nothing and keeps data you created by hand. It runs against whatever `DATABASE_URL` and `S3_*` point to, the deployed environment included (see D-11 in [decisions](docs/decisions.md)).

Every demo user's password is `renest-demo`.

| Email | Who |
|---|---|
| `vendedora.verificada@renest.app` | Laura Gómez, verified seller, Cochabamba |
| `vendedor@renest.app` | Diego Quispe, unverified seller, Arequipa |
| `comprador1@renest.app` | Ana Rojas, buyer, Cochabamba |
| `comprador2@renest.app` | Carlos Méndez, buyer, Arequipa |

## Errors

Every error response has the shape from the API contract:

```json
{ "statusCode": 409, "code": "LISTING_NOT_AVAILABLE", "message": "…", "details": null }
```

- Throw `AppException` with a code from `src/common/errors/error-code.ts` when the frontend needs a specific `code`.
- Plain Nest exceptions get a generic code by status (`NOT_FOUND`, `CONFLICT`, ...).
- Validation errors are `400 VALIDATION_ERROR`, with per-field `details`.

## Contributing

- Branches start from `develop`, and PRs target `develop`. `main` is production and only receives PRs from `develop` (see D-10 in [decisions](docs/decisions.md)).
- One Linear ticket per branch, using the branch name Linear provides.
- Commits are small slices in Conventional Commits format, with a `Refs: REN-xx` trailer. Full workflow in [CLAUDE.md](CLAUDE.md#git-workflow).
- PRs use the template and are merged with **"Create a merge commit"**, never squash or rebase (see D-9 in the backend [decisions](docs/decisions.md)).

## Working with Claude Code

One-time setup per developer:

1. Clone both repos side by side: `ReNest-Backend/` and `ReNest-Frontend/` in the same folder.
2. In `~/.claude/settings.json`, add the setting below, so that the frontend's `CLAUDE.md` and rules load when you add that repo to a session:

   ```json
   { "env": { "CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD": "1" } }
   ```
3. Install the [GitHub CLI](https://cli.github.com/) and run `gh auth login`. `/ticket` uses it to open PRs.
4. Start an interactive session in this repo and **accept the trust dialog**. Until you do, the shared `allow` permissions are ignored, so you get more prompts.
5. Approve the `linear` MCP server and run `/mcp` to sign in. If you already use the Linear connector from claude.ai, decline the project server instead: two Linear servers duplicate tools and waste context.
6. Check: `/memory` lists both CLAUDE.md files, and `/ticket` shows up when you type `/`.

Daily use:

- Fullstack work: run `claude --add-dir ../ReNest-Frontend` from this repo.
- `/ticket REN-xx` runs the team workflow: plan (with your approval), branch, tests first, small commits, self-review, PRs.
- `/review REN-xx` reviews the ticket's PRs in both repos against the AC, rules, contract and conventions. It reports verified findings and posts them to GitHub only with your approval. It never approves or merges.
- One ticket or review per session. Run `/clear` before starting the next one.

What's configured, and where:

| File | Purpose | Loaded |
|---|---|---|
| `CLAUDE.md` | Commands, architecture, conventions, git workflow | Every session |
| `.claude/rules/testing.md` | Testing standards | Only when test files are touched |
| `.claude/skills/ticket/` | `/ticket` workflow | Only when invoked |
| `.claude/skills/review/` | `/review` workflow | Only when invoked |
| `.claude/settings.json` | Shared permissions | Every session |
| `.mcp.json` | Linear MCP server | Every session |

The shared permissions are a convenience, not a security boundary. They:
- stop Claude's Read tool from opening `.env`;
- ask before resets and force pushes;
- refuse explicit pushes to `develop` or `main`.

They can be bypassed, for example through shell commands. The real protection for `develop` and `main` is GitHub branch protection.
