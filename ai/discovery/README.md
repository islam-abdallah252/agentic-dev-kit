# Project discovery

Run this before the first task in a repository that does not yet have a reviewed profile:

```bash
node ai/discovery/discover.mjs --cli --root .
```

Add `--write-draft ai/project/discovery-report.json` to save the report. The command refuses to overwrite an existing draft.

To write an initial editable profile from **verified** discovery evidence:

```bash
node ai/discovery/generate-profile.mjs --root .
```

That command replaces only a missing profile or the installer stub. If `ai/project/profile.json` or `profile.md` was already reviewed or edited, it prints the proposal and exits 2. Use `--preview` to inspect without writing, or `--overwrite` to replace the files.

## What it inspects

- `README.md`, `AGENTS.md`, and whether `ai/project/profile.json` exists
- `package.json` name, dependency names, and scripts
- Lockfiles and language manifests: npm, pnpm, yarn, Poetry, uv, Go, Cargo, Bundler
- `angular.json` when present
- `git branch --show-current`, `git status --short`, and `git remote -v`

It does not run install, test, lint, or build scripts. It does not stash, reset, or commit.

## How to read the report

- `verified` — a file or command output states the fact. Profile generation may copy these fields.
- `inferred` — a weak signal, such as a README line. Do not copy it into the profile without review. Generation does not copy inferred fields.
- `unknown` — no evidence
- `conflicts` — two evidence sources disagree. Generation leaves that field unresolved.

## What discovery and generation will not infer

- That the tracker is Jira, or that any tracker is required. A pasted story is a valid task source even when this field stays unknown.
- A ticket prefix from branch names or from strings in source code
- A base branch, even when `origin/HEAD` exists. That value is only a Git fact inside `git.remotes` or the current branch. It must not replace an explicit `branch.base`.
- A commit message convention
- Which technology profile to activate. Generation may **propose** an id in `profile.md`. It never writes `activeProfiles`.
- That a missing command passed

Review the generated `ai/project/profile.json` and `ai/project/profile.md`. Discovery never activates Angular, Node, or Python rules by itself.
