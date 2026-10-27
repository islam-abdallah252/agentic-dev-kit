# Git and delivery

This file is the canonical commit and delivery policy. Tool adapters point here and must not restate or weaken it.

## Commit grouping

- Inspect staged, unstaged, and untracked files before preparing groups. Preserve unrelated and pre-existing user work; if ownership is unclear, stop and ask.
- Group by logical purpose first and folder second. Keep implementation, tests, configuration, documentation, and validation together when they form one coherent change or depend on each other.
- Split unrelated work, even when it shares a ticket or folder. A self-contained folder may be its own group when that reflects the logical change.
- Avoid per-file fragmentation. Choose the scope from the primary component or responsibility, not merely its directory.

## Commit messages

Every proposed and created commit must follow the convention in `ai/project/profile.json` under `commits`. If `commits.convention` is missing or `unknown`, stop and ask. Do not invent a ticket identifier, a scope rule, or a header shape.

When a real ticket is associated with the change, include that actual ticket associated with the change using `commits.header`. Never invent a ticket. If several tickets are named and it is unclear which one applies, stop and ask.

When no ticket URL or ID was supplied, use `commits.ticketlessHeader` and `commits.ticketlessHeaderPattern`. If those fields are missing and the convention is Conventional Commits, use `<type>(<scope>): <title>`. When `tickets.provider` is `none`, do not require a tracker id.

A missing ticket ID must not disable logical commit grouping, a required commit body, staged-diff inspection, explicit group-specific approval, or the prohibition on pushing without separate authorization.

- Allowed types are the profile `commits.types` list. When the convention is Conventional Commits and the profile does not override types, the allowed types are `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `style`, `chore`, and `revert`.
- When the profile requires a scope, the scope names the primary file or concise logical component.
- The title is concise and accurately describes the included change. The body begins after exactly one blank-line separator when the profile requires a body, and accurately states what changed, why, the relevant components or files, actual verification results, and significant limitations or exclusions when useful.
- Do not invent verification. Distinguish successful execution from assumptions, skipped checks, pending QA, and translation or data assertions that do not verify rendered UI.
- A breaking change uses `!` immediately before `:` in the header or an uppercase `BREAKING CHANGE:` footer when the profile uses Conventional Commits. Types other than `feat` and `fix` remain valid when they match the change.
- Do not add `Co-authored-by: Cursor <cursoragent@cursor.com>`.

Do not claim a Git hook enforces this format unless the project profile records a verified hook. Validate messages against the profile and this rule. This file does not hard-lock commits.

## Approval gate

After implementation, independent review, testing and any fix/retest cycle, and gap analysis, prepare proposals only. For every proposed group, show:

- **Group:** logical purpose.
- **Files:** exact file paths.
- **Title:** complete validated header.
- **Description:** complete body specific to those files.
- **Verification:** checks actually executed and their results.

Then ask exactly: **Do you approve these commit groups and messages?** Wait for explicit approval before staging or committing. Preparing a proposal, task completion, or a general request to finish does not authorize a commit. Approval is group-specific and non-transferable: commit only explicitly approved groups, clarify ambiguous responses, revise rejected proposals and ask again, and do not carry approval to later commits or pushes. If the user explicitly excludes commits from a task, do not prepare or execute a commit proposal; record that exclusion in the final report.

## Approved commit execution

After explicit approval for one or more groups:

1. Recheck staged, unstaged, and untracked files and confirm the approved files have not unexpectedly changed.
2. Stage only the exact approved paths. Never use `git add .` or `git add -A`.
3. Inspect the staged diff and verify it contains only the approved group.
4. Commit with the approved title and body separated by one blank line, then record the resulting hash.
5. Repeat for each approved group. Stop on any staging or commit failure and report the actual error.
6. Verify Git status and report successful commits, failed commits, skipped groups, hashes, and remaining changes.

Never amend, reset, discard, overwrite, rewrite history, or force-push as part of this workflow. Push only after separate explicit approval; commit approval never authorizes a push.

## Repository delivery facts

Delivery facts, hooks, CI, and deploy restrictions live in the project profile. Do not copy hosts, ports, or deploy commands into this rule. Do not commit `.env` files or secrets. Do not skip a hook the profile says is active.

If the profile does not mention a hook, do not invent one and do not claim one ran.
