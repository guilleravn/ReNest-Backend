---
name: ticket
description: Implement a Linear ticket end to end (plan, branch, tests, code, commits, PRs).
argument-hint: REN-xx
disable-model-invocation: true
---

# Implement $ARGUMENTS

Work on one ticket per session. The developer must understand and approve what is built, so stop at the checkpoints.

## 1. Understand

1. Fetch `$ARGUMENTS` with the Linear MCP: description, AC, labels and "blocked by" relations. If a blocker isn't Done, tell the developer and ask whether to continue.
2. Read only what the ticket references:
   - the cited rule IDs in `docs/business-rules.md`;
   - the related endpoints in `docs/api-contract.md`;
   - the existing code in the affected modules (backend `src/<domain>/`, frontend `../ReNest-Frontend/src/`).
3. Note any gap or contradiction between the ticket, the rules and the contract. Don't guess: ask.

## 2. Plan (checkpoint)

Present a short plan and **wait for approval**:
- An ordered list of commits (small slices). For each one: the repo, what it does, and its tests. Typical order:
  - backend: schema and migration → rule tests and service → endpoint;
  - frontend: API client → components → page wiring → Playwright spec.
- Which tests cover each AC and each rule ID.
- Any doc that must change (rules, contract, decisions).

## 3. Set up

1. Move the issue to In Progress in Linear.
2. In each repo the plan touches: `git fetch`, then create the branch Linear provides for the issue from `origin/develop`.

## 4. Build, one slice at a time

For each planned commit:
1. Read `.claude/rules/testing.md` of that repo before writing its tests.
2. Write the tests first for rule logic, and see them fail.
3. Implement the minimum that makes them pass. Follow `CLAUDE.md` conventions.
4. Run that repo's checks (lint, tests). Fix until green.
5. Commit following the git workflow in `CLAUDE.md` (Conventional Commit + `Refs: $ARGUMENTS`).

If the plan has to change mid-way (new slice, different approach), say so before doing it.

## 5. Verify (checkpoint)

1. Self-review the full diff of each repo against `origin/develop`:
   - every AC covered;
   - every cited rule enforced in the backend and tested (happy path + each rejection);
   - frontend has loading, empty and error states, works at 375px, and has its UI copy in Spanish;
   - docs updated if behavior changed;
   - no debug code or unrelated changes.
2. Report: what was built, the commits, how to test it manually, and anything left out. **Wait for approval to push.**

## 6. Ship

1. Push the branches. Open one PR per repo with `gh pr create --base develop`, using `.github/pull_request_template.md`:
   - title: `REN-xx: <ticket title>`;
   - body: `Closes $ARGUMENTS`, with a link to the PR in the other repo.
2. Move the issue to In Review and add the PR links as a comment on the issue.
