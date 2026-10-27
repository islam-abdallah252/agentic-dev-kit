# Installation and updates

The portable unit is this `ai/` tree plus the thin platform adapters. There is no runtime dependency beyond Node.js, which is already required to run `ai/validate.mjs`.

`ai/install/bootstrap.mjs` copies the portable paths and writes `ai/project/profile.json` only when that file is absent. The new profile is all `unknown` values plus the core version. It does not copy `ai/project/profile.json` or `ai/project/profile.md` from the source repository.

See `ai/install/QUICKSTART.md` for the command sequence.

## What is copied

- Canonical core, agents, adapters, technology profiles, templates, discovery, install, validator, and schema
- `AGENTS.md`, `rules/ticket-branch.md`, and `.codex/` when those files differ from the destination
- Cursor rules and agents are written from `ai/templates/cursor/` into the target `.cursor/` directory. The installer does not read or copy a source `.cursor/` directory or `.cursorrules`.
- Angular Cursor rules are written only when the matching target profile is active: `angular-typescript` → `.cursor/rules/angular-typescript.mdc`, `angular-html` → `ui-html.mdc`, `angular-scss` → `ui-scss.mdc`
- Not copied: the source project profile, its base branch, its project name, the discovery report, and any machine-local Cursor files

## What a human still does

- Run discovery, then `node ai/discovery/generate-profile.mjs --root .` to fill verified fields
- Review and edit the generated `ai/project/profile.json` and `ai/project/profile.md`
- Choose `activeProfiles` only when evidence confirms a technology profile
- Approve commits and pushes
- Resolve conflicts listed in the install conflict report

## Adding a profile or adapter

- Add `ai/profiles/<id>.md` and one row in `ai/profiles/README.md`. Activate it only in the project profile.
- Add `ai/adapters/<tool>.md` that points at `ai/core/lifecycle.md` and `ai/rules/git-and-delivery.md`, states that the tool cannot hard-lock commit approval, and does not define a second final-status gate.

A fresh target has no profile, so its `branch.base` stays `unknown` and the Angular Cursor rules are not written. A TypeScript file in the target does not activate those rules. Set the exact Angular ids in `activeProfiles` and run the installer again to write only the matching rules from `ai/templates/cursor/`. Cursor applies a written rule by its glob. This installer does not claim a lock beyond which files it writes. Writing the Angular rules by hand still activates them.

If a copy throws, the installer records the failed path in `errors`, leaves earlier files in place, and does not roll back. Exit code 4 means a copy failed or `ai/CORE_VERSION` could not be read. Exit code 3 means at least one existing file differed and was left unchanged. Bootstrap never overwrites or auto-merges a user-owned file. An `AGENTS.md` conflict must be merged by hand so the file still points at `ai/README.md`, `ai/core/lifecycle.md`, and Single-agent fallback; `node ai/validate.mjs` cannot pass until that merge is done.

## Validation

`node ai/validate.mjs` checks this repository's policy text, profile, and adapters. It validates the repository that contains the script, not the current working directory. Pass `--root /path/to/repo` to select a different tree.

`node ai/validate.mjs --self-test` also runs policy regressions and isolated fixtures for other repository shapes. Those fixtures live in a temporary directory and are deleted at the end.
