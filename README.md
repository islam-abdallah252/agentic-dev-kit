# Agentic Dev Kit

Portable engineering instructions for AI coding tools. Core version: **1.2.0**.

This repository is the standalone source of the `ai/` system. It is not an application. Consumer projects keep their own `ai/project/profile.json` and must never receive this kit’s (nonexistent) product configuration, because the kit ships no populated profile.

## What it is

Canonical rules, agent roles, technology profiles, and thin tool adapters live under `ai/`. Cursor, Codex, ChatGPT, and a generic tool contract are documented. A Node.js installer copies the portable files into another repository without overwriting differing destination files and without copying a project profile.

Current adapters:

- Cursor (`.cursor/` files are generated from `ai/templates/cursor/`)
- Codex (`AGENTS.md` and `.codex/agents/`)
- ChatGPT (manual Project instructions)
- Generic tool contract

Claude Code is not implemented in this version.

## Install into another repository

From this repository:

```bash
node ai/install/bootstrap.mjs --target /path/to/other-repo
```

Then in the other repository:

```bash
node ai/discovery/discover.mjs --cli --root . --write-draft ai/project/discovery-report.json
node ai/validate.mjs
```

`node ai/validate.mjs` validates the repository that contains that script, not the current working directory. From another directory, invoke the consumer’s `ai/validate.mjs` by absolute path, or pass `--root /path/to/repo`.

Review the discovery draft. Fill `ai/project/profile.json` and `ai/project/profile.md`. Leave unknown facts as `unknown`, including `branch.base` until the consumer’s base branch is verified. Do not guess `main` or `dev`. List a technology profile in `activeProfiles` only when the evidence supports it. Run bootstrap again after adding `angular-typescript`, `angular-html`, or `angular-scss` if you want the matching Cursor rule written from `ai/templates/cursor/`.

Optional Cursor branch-guard hook (separate from install):

```bash
node ai/install/bootstrap.mjs --materialize-cursor
```

That command is opt-in. It merges fail-closed hook entries and does not delete other hook commands.

Full installer contract: `ai/install/README.md` and `ai/install/QUICKSTART.md`.

## Conflicts

If a destination file already exists and its bytes differ, bootstrap leaves it unchanged, writes `ai/install/conflict-report.json`, and exits **3**. It never overwrites or auto-merges a user-owned file, including `AGENTS.md`.

Validation requires `AGENTS.md` to point at `ai/README.md`, `ai/core/lifecycle.md`, and Single-agent fallback. If bootstrap reports an `AGENTS.md` conflict, merge that file by hand before `node ai/validate.mjs` can pass.

Exit **4** means a copy failed or `ai/CORE_VERSION` could not be read. Earlier files stay; there is no rollback.

## How to validate this kit

In this repository (no consumer profile):

```bash
node ai/validate.mjs
node ai/validate.mjs --self-test
```

`--self-test` writes fixtures under the system temp directory and deletes them when finished.

## Consumer layout (unchanged)

The installer writes:

- `ai/` canonical files
- `AGENTS.md`
- `rules/ticket-branch.md`
- `.codex/agents/`
- `.cursor/rules/` and `.cursor/agents/` generated from templates. Angular rules are written only when the matching **target** profile is active: `angular-typescript` → `angular-typescript.mdc`, `angular-html` → `ui-html.mdc`, `angular-scss` → `ui-scss.mdc`
- a skeleton `ai/project/profile.json` only if that file is missing

It does not overwrite differing files, does not delete user files, does not copy a source profile, and does not commit.

## Current limitations

- No Claude Code adapter.
- No dedicated update CLI; re-run bootstrap, then bump `profile.coreVersion` by hand after accepting an update.
- Cursor file-scoped globs assume `src/**` for Angular templates.
- The branch guard is Cursor-hook specific (`CURSOR_PROJECT_DIR` or cwd) and must be materialized separately with `--materialize-cursor`.
- Commit and push approval remain agent policy, not Git hooks.
- There is no license file yet.
- An existing `AGENTS.md` that differs is left in place (exit 3). Validation fails until it is merged by hand.

## Authority

Standards live in `ai/core/` and `ai/rules/`. Adapters point at those files. If an adapter disagrees with the canonical file, follow the canonical file.
