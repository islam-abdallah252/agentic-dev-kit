# Project discovery

Run this before the first task in a repository that does not yet have a reviewed profile:

```bash
node ai/discovery/discover.mjs --cli --root .
```

Add `--write-draft ai/project/discovery-report.json` to save the report. The command refuses to overwrite an existing draft.

## What it inspects

- `README.md`, `AGENTS.md`, and whether `ai/project/profile.json` exists
- `package.json` name, dependency names, and scripts
- Lockfiles and language manifests: npm, pnpm, yarn, Poetry, uv, Go, Cargo, Bundler
- `angular.json` when present
- `git branch --show-current`, `git status --short`, and `git remote -v`

It does not run install, test, lint, or build scripts. It does not stash, reset, or commit.

## How to read the report

- `verified` — a file or command output states the fact
- `inferred` — a weak signal, such as a README line. Do not copy it into the profile without review
- `unknown` — no evidence
- `conflicts` — two evidence sources disagree

## What discovery will not infer

- That the tracker is Jira, or that any tracker is required. A pasted story is a valid task source even when this field stays unknown.
- A ticket prefix from branch names or from strings in source code
- A base branch, even when `origin/HEAD` exists. That value is only a Git fact inside `git.remotes` or the current branch. It must not replace an explicit `branch.base`.
- A commit message convention
- Which technology profile to activate
- That a missing command passed

Review the report, then edit `ai/project/profile.json` by hand. Discovery never writes the profile.
