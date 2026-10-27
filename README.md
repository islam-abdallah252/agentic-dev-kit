# Agentic Dev Kit

Portable engineering instructions for AI coding tools. Core version: **1.3.0**.

This repository is the standalone source of the `ai/` system. It is not an application. Consumer projects keep their own `ai/project/profile.json` and must never receive this kit’s (nonexistent) product configuration, because the kit ships no populated profile.

## Prerequisites

- Node.js **18 or later** (`node -v`)
- `npx` from npm 7 or later (included with current Node.js installers)
- A consumer application directory you can write to

No npm publication is required.

Tested on **macOS (Darwin arm64)** with **Node.js v20.19.3** and **npm 10.8.2**. Other OS/Node combinations were not tested.

## Install

`--target` is required. `.` means the current working directory. Do not pass `--source` to the `npx` entry point.

### From a local clone (tested)

From the consumer application directory, with this repository checked out at `/path/to/agentic-dev-kit`:

```bash
npx --yes /path/to/agentic-dev-kit --target .
```

Equivalent installer, from the kit clone:

```bash
node ai/install/bootstrap.mjs --target /path/to/your-app
```

Update an existing install (overwrites kit-owned files only):

```bash
npx --yes /path/to/agentic-dev-kit --target . --update
```

or `node ai/install/bootstrap.mjs --target /path/to/your-app --update`. `--update` without `--target` exits **1**.

### From GitHub (not yet available on origin)

The intended command after `package.json` and `ai/install/cli.mjs` are on GitHub `main`:

```bash
npx --yes github:islam-abdallah252/agentic-dev-kit --target .
```

That live `github:` command was **not** successful against current origin `main`. Those package files are still local-only. Do not use it until they are pushed.

`--yes` skips the npx confirmation prompt. `--target` is passed to the installer, not to npm.

### First-time example (tested local path)

```bash
cd /path/to/your-app
npx --yes /path/to/agentic-dev-kit --target .
node ai/discovery/discover.mjs --cli --root . --write-draft ai/project/discovery-report.json
node ai/discovery/generate-profile.mjs --root .
node ai/validate.mjs
```

Then review and edit `ai/project/profile.json` and `ai/project/profile.md`. Those files are owned by the consumer project. Generation copies verified repository evidence only; it does not guess a tracker, commit convention, or technology profile. `branch.base` comes from the target `origin/HEAD` at install time, or stays `unknown`. Reinstall fills `unknown` from `origin/HEAD` when that ref exists; any other value is left unchanged.

## What it is

Canonical rules, agent roles, technology profiles, and thin tool adapters live under `ai/`. Cursor, Codex, ChatGPT, and a generic tool contract are documented. The installer copies the portable files into another repository without overwriting differing destination files and without copying a project profile.

Current adapters:

- Cursor (`.cursor/` files are generated from `ai/templates/cursor/`)
- Codex (`AGENTS.md` and `.codex/agents/`)
- ChatGPT (manual Project instructions; see `ai/adapters/chatgpt.md`)
- Generic tool contract

Claude Code is not implemented in this version.

## What the installer writes

- `ai/` canonical files, including discovery, validation, and the installer
- `AGENTS.md`
- `rules/ticket-branch.md`
- `.codex/agents/`
- `.cursor/rules/` and `.cursor/agents/` generated from templates. Angular rules are written only when the matching **target** profile is active: `angular-typescript` → `angular-typescript.mdc`, `angular-html` → `ui-html.mdc`, `angular-scss` → `ui-scss.mdc`
- a skeleton `ai/project/profile.json` only if that file is missing. `branch.base` is the target of `refs/remotes/origin/HEAD` when that ref exists; otherwise it is `unknown`. On reinstall, that field is updated only when it is exactly `unknown` and `origin/HEAD` now resolves. The current checkout is not used, and `main` is not a fallback.
- a stub `ai/project/profile.md` only if that file is missing
- `ai/install/conflict-report.json`

Without `--update`, it does not overwrite differing files. With `--update`, it overwrites kit-owned `ai/**` files (except profile/report paths), `rules/ticket-branch.md`, and `.codex/agents/**`. It never overwrites `AGENTS.md`, `.cursor/**`, `ai/project/profile.json`, `ai/project/profile.md`, application source, or the consumer `package.json`. Extra target files are never deleted; they may be listed as `obsolete`. It does not copy a source profile and does not commit. The kit `package.json` is not copied into the consumer application.

The kit release version is `package.json` `version`. First install writes that value to `ai/CORE_VERSION` (copied) and to a new profile's `coreVersion`. `--update` sets `profile.coreVersion` only after a conflict-free successful update.

## Discovery, profile generation, and validation

After install, in the consumer repository:

```bash
node ai/discovery/discover.mjs --cli --root . --write-draft ai/project/discovery-report.json
node ai/discovery/generate-profile.mjs --root .
node ai/validate.mjs
```

`node ai/validate.mjs` validates the repository that contains that script, not the current working directory. From another directory, invoke the consumer’s `ai/validate.mjs` by absolute path, or pass `--root /path/to/repo`.

What is automatic:

- Discovery reads manifests, lockfiles, and Git facts. It does not write the profile.
- `generate-profile.mjs` copies **verified** fields into `ai/project/profile.json` and a matching `ai/project/profile.md`. It replaces a missing profile or the installer stub. It keeps an installer-detected `branch.base`. It never writes `activeProfiles`, ticket settings, or a commit convention, and it does not invent a base branch from the current checkout.

What requires review:

- Edit the generated profile before using it as project truth.
- Leave unknown facts as `unknown`. If `branch.base` is still `unknown`, do not guess `main` or `dev`. Review an installer-detected value before treating it as project truth.
- Proposed technology profiles appear in `profile.md`. Add an id to `activeProfiles` only when you confirm it applies.
- Inferred README signals (such as an issue tracker line) are listed in `profile.md` and are not copied into the JSON.

To inspect a proposal without writing:

```bash
node ai/discovery/generate-profile.mjs --root . --preview
```

Re-running generation after you edit the profile exits **2** and leaves the files unchanged. Replace them only with an explicit `--overwrite`.

Run the installer again after adding `angular-typescript`, `angular-html`, or `angular-scss` if you want the matching Cursor rule written from `ai/templates/cursor/`.

Optional Cursor branch-guard hook (separate from install), from the consumer repository after the kit is present:

```bash
node ai/install/bootstrap.mjs --materialize-cursor
```

That command is opt-in. It merges fail-closed hook entries and does not delete other hook commands.

Full installer contract: `ai/install/README.md` and `ai/install/QUICKSTART.md`. ChatGPT Projects setup: `ai/adapters/chatgpt.md`.

## Conflicts

If a destination file already exists and its bytes differ, a normal install leaves it unchanged, writes `ai/install/conflict-report.json`, and exits **3**. It never overwrites or auto-merges a user-owned file, including `AGENTS.md`.

With `--update`, kit-owned differing files are replaced and listed in `updated` even if the run later hits a user-owned conflict or a copy error. `profile.coreVersion` is not bumped in that case. There is no rollback. Retrying `--update` after you merge conflicts is safe for user-owned files.

Validation requires `AGENTS.md` to point at `ai/README.md`, `ai/core/lifecycle.md`, and Single-agent fallback. If the installer reports an `AGENTS.md` conflict, merge that file by hand before `node ai/validate.mjs` can pass.

Exit **4** means a copy failed or `ai/CORE_VERSION` could not be read. Kit-owned files already listed in `updated` stay replaced; there is no rollback.

Exit **1** means the command was invoked without `--target` (or `--materialize-cursor`), with `--update` and no `--target`, with `--source`, or on Node.js older than 18.

## How to validate this kit

In this repository (no consumer profile):

```bash
node ai/validate.mjs
node ai/validate.mjs --self-test
```

`--self-test` writes fixtures under the system temp directory and deletes them when finished.

## Current limitations

- No Claude Code adapter.
- `--update` does not auto-delete files removed upstream; review `report.obsolete`.
- Cursor file-scoped globs assume `src/**` for Angular templates.
- The branch guard is Cursor-hook specific (`CURSOR_PROJECT_DIR` or cwd) and must be materialized separately with `--materialize-cursor`.
- Commit and push approval remain agent policy, not Git hooks.
- There is no license file yet.
- An existing `AGENTS.md` that differs is left in place (exit 3). Validation fails until it is merged by hand.
- Live `npx --yes github:islam-abdallah252/agentic-dev-kit` is not usable until `package.json` and `ai/install/cli.mjs` are on origin `main`. Use a local clone until then.

## Authority

Standards live in `ai/core/` and `ai/rules/`. Adapters point at those files. If an adapter disagrees with the canonical file, follow the canonical file.
