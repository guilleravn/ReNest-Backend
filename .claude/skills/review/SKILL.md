---
name: review
description: Review the PRs of a Linear ticket in both repos against the AC, business rules, contract and team conventions.
argument-hint: REN-xx
disable-model-invocation: true
---

# Review $ARGUMENTS

Review one ticket per session. You report findings; the developer decides what to post and whether to approve. Never approve, merge or push.

## 1. Context

1. Fetch `$ARGUMENTS` with the Linear MCP: AC, cited rule IDs and its git branch name.
2. In each repo (this one and `../ReNest-Frontend`), run `git fetch --prune`. Then find the PR with `gh pr list --head <branch> --state open` and read it with `gh pr view <n>` and `gh pr checks <n>`. Add `-R guilleravn/ReNest-Frontend` for the frontend. A ticket may have one PR or two.
3. Read only the cited rules in `docs/business-rules.md` and the touched endpoints in `docs/api-contract.md`.

Don't check out the branch. Read the code from the remote with `git log -p origin/develop..origin/<branch>`, and read whole files with `git show origin/<branch>:<path>`.

## 2. Review commit by commit

Go through the commits in order; each one is a slice. Check:

- **Spec:** every AC is met. Every cited rule is enforced in the backend, not only in the UI, and has a test for the happy path and for each rejection.
- **Contract:** routes, payloads, status codes and error `code`s match `docs/api-contract.md`. A contract change must be in the same PR.
- **Correctness:**
  - authorization (`403` vs `404`, ownership);
  - races (RES-5, edits vs reservations);
  - validation and edge cases;
  - error handling;
  - nothing that breaks existing behavior.
- **Conventions:** both `CLAUDE.md` files. Backend: `AppException` and `ErrorCode`, ESM imports, no edited migrations. Frontend: design tokens, components from the catalog, the API client, loading/empty/error states, 375px, Spanish UI copy.
- **Tests:** they follow each repo's `.claude/rules/testing.md` and would fail if the rule broke.
- **Docs:** rules, contract, decisions or the component catalog are updated when behavior changed.
- **Commits:**
  - small coherent slices in Conventional Commits format, each with a `Refs: $ARGUMENTS` trailer;
  - no `fixup!` or wip commits left;
  - the branch is up to date with `origin/develop`.

## 3. Verify every finding

Before reporting a finding, confirm it against the code and against `origin/develop`, not against stale branches or memory. Drop anything you can't point to in the diff. If something is unclear, report it as a question, not as a finding.

## 4. Report (checkpoint)

Report in this order:

1. **Verdict:** ready to merge, or changes needed.
2. **AC checklist:** each AC marked met or not met, with the evidence.
3. **Findings:** grouped as **Blocking**, **Should fix** and **Nit**. Each one gives `repo/path:line`, the problem, why it matters (cite the rule or convention) and a suggested fix.
4. **CI status:** the result for each PR.

Then **wait**. Ask which findings to post, and whether to comment or request changes.

## 5. Post (only with approval)

Post the approved findings with `gh pr review <n> --comment` or `--request-changes`, adding a `-b` body with the findings in the same format, one review per PR. Never use `--approve`: approving is the developer's call.
