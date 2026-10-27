# Install into another repository

From a repository that already contains this system:

```bash
node ai/install/bootstrap.mjs --target /path/to/other-repo
```

Then, in the other repository:

```bash
node ai/discovery/discover.mjs --cli --root . --write-draft ai/project/discovery-report.json
node ai/discovery/generate-profile.mjs --root .
node ai/validate.mjs
```

`node ai/validate.mjs` validates the repository that contains that script, not the current working directory. From another directory, invoke the consumer’s `ai/validate.mjs` by absolute path, or pass `--root /path/to/repo`.

Review and edit `ai/project/profile.json` and `ai/project/profile.md`. Generation copies only verified evidence. The installer may already have set `branch.base` from the target `refs/remotes/origin/HEAD`. If that ref is missing, leave `branch.base` as `unknown` until you confirm it. Do not guess `main` or `dev`, and do not copy the source kit's base. Proposed technology profiles appear in `profile.md`; add an id to `activeProfiles` only when the evidence supports it. Run bootstrap again after adding `angular-typescript`, `angular-html`, or `angular-scss` if you want the matching Cursor rule written from `ai/templates/cursor/`. Re-running generation without `--overwrite` will not replace a reviewed profile.

`ai/validate.mjs` in a fresh install checks the portable structure and the filled profile. It does not require Jira, Angular, or this repository's branch names. A profile that is still `unknown` fails closed on commit-message validation until you set `commits.headerPattern`.

Optional Cursor branch-guard hook (separate from install):

```bash
node ai/install/bootstrap.mjs --materialize-cursor
```

That command is opt-in. It merges fail-closed hook entries and does not delete other hook commands.

## Conflicts

If a destination file already exists and its bytes differ, bootstrap leaves it in place and writes `ai/install/conflict-report.json`. Exit code 3 means at least one conflict. Bootstrap never overwrites or auto-merges a user-owned file, including `AGENTS.md`.

Validation requires `AGENTS.md` to point at `ai/README.md`, `ai/core/lifecycle.md`, and Single-agent fallback. If bootstrap reports an `AGENTS.md` conflict, merge that file by hand before `node ai/validate.mjs` can pass.

Exit code 4 means a copy failed or `ai/CORE_VERSION` could not be read. Earlier files stay, and the installer does not roll them back. Resolve the file by hand, then run bootstrap again. Matching files are skipped. Nothing is deleted. A second run with no differences reports no new conflicts.

## Updates

Run the same command. It copies portable files that are missing or identical, and it will not replace a project profile. Compare `ai/CORE_VERSION` with `profile.coreVersion` after you accept an update, then set `profile.coreVersion` yourself when you want the profile to declare that version.

Commit approval, push approval, and profile edits stay manual. Bootstrap does not commit.

## Current limitations

- No Claude Code adapter.
- No dedicated update CLI; re-run bootstrap, then bump `profile.coreVersion` by hand after accepting an update.
- Cursor file-scoped globs assume `src/**` for Angular templates.
- The branch guard is Cursor-hook specific (`CURSOR_PROJECT_DIR` or cwd) and must be materialized separately with `--materialize-cursor`.
- Commit and push approval remain agent policy, not Git hooks.
- There is no license file yet.
- An existing `AGENTS.md` that differs is left in place (exit 3). Validation fails until it is merged by hand.
