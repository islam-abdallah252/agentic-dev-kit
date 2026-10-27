# Task source and branch workflow

Use this file for every implementation task. Story retrieval and branch preparation are separate steps. A missing story URL or ticket ID is not, by itself, a reason to skip branch preparation or the rest of the lifecycle.

`ai/rules/jira-and-branch.md` is a compatibility pointer. Do not keep a second procedure there.

## Story input

Accept any one of these as the task source:

1. A tracker URL.
2. A ticket ID.
3. A complete story description pasted into the prompt, with or without acceptance criteria and reproduction steps.

Do not invent ticket details. Do not invent a ticket ID, story URL, or acceptance criterion. Do not require a tracker when the pasted description is enough to implement the task safely.

When a URL or ticket ID is present and the current tool has a working connector for the provider in `ai/project/profile.json`, retrieve the summary, description, acceptance criteria, and comments. User clarifications in the conversation override retrieved text when they conflict. If retrieval fails, stop and ask for the missing text.

When the user pasted the story, treat that text as the source of requirements. Extract the objective, scope, acceptance criteria, technical constraints, and expected behavior. Inspect the repository for the current implementation and conventions. Ask only when an unresolved gap would change the implementation or make it unsafe. Record non-blocking assumptions.

If there is no URL, no ticket ID, and no usable pasted story, ask for a story. Do not ask only for Jira.

## Inspect Git before changing branches

Inspect the current branch, `git status`, staged changes, untracked files, and the existing diff. Do not stash, reset, clean, or discard existing user changes. Do not switch away from a branch that has unrelated or uncommitted user work. If ownership of local changes is unclear, stop and ask.

Do not fetch, pull, or otherwise use a remote unless the project profile says to update the base from the remote, the working tree is clean, and that step is safe. Do not commit or push as part of branch preparation.

## Base branch

`branch.base` is the only base-branch setting. Read it from the project profile.

- If the value is missing or `unknown`, stop and ask. Do not assume `dev`, `develop`, `main`, `master`, or any other name. Do not invent a fallback because another branch exists.
- If the value is `none`, stay on the current branch and record that branching is not required.
- Check the configured name with `git check-ref-format --branch` before creating or switching a branch. If Git cannot run, the name is not verified. Stop and say so.
- A configured name is not verified until that branch is present locally or can be resolved under the profile's remote policy. If it is missing, stop. Do not switch to a different branch that happens to exist.
- If discovery, `origin/HEAD`, or another Git fact disagrees with `branch.base`, keep the profile value, report the discrepancy, and ask before changing the task base. Do not rewrite the profile.
- If `branch.conflict` is set, follow that note. Do not switch bases on your own.
- Never reset, overwrite, or delete a branch to make the configured base usable.

## Branch name

Use this precedence. Do not invent a ticket token.

1. An explicit template in the project profile.
2. A verified project convention that matches that profile and the user's instruction.
3. The core fallback below, only when the profile has no applicable template.

Apply the template this way:

- Bug or sub-bug: `branch.bug` when a ticket ID exists, otherwise `branch.ticketlessBug`.
- Story, task, or feature: `branch.feature` when a ticket ID exists, otherwise `branch.ticketlessFeature`.
- Other kinds use the matching ticketed or ticketless template when the profile defines one. Do not force every task into `feat/`.

Substitute the real ticket ID, when one exists, and a short lowercase kebab summary taken from the story. One task per branch. If the supplied id does not match `tickets.idPattern`, stop. Do not fabricate an id so the template can be filled.

When no ticket ID was supplied, do not fill a ticket-shaped template. Use the profile's ticketless template. If that template is missing, use `<type>/<project-name>/<short-description>`. A feature is `feat/<project-name>/<short-description>`. A bug fix is `fix/<project-name>/<short-description>`. Take `<project-name>` from `project.name`. If `project.name` is unknown, stop and ask. Do not substitute a placeholder name.

Do not use `feat/<short-description>` or `feat/<project-name>-<short-description>` as the core fallback. An explicit profile template that uses a different verified shape is still honored for that project.

Reject a candidate that fails `git check-ref-format --branch`, including names that contain `..`, `@{`, a space, an empty path segment, or a segment ending in `.lock`. If that command cannot run, do not treat the name as valid.

## Existing branches

Before creating a branch, check whether the intended name already exists locally or remotely.

- If the current branch already is the task branch, stay on it.
- If an existing branch clearly belongs to this task, inspect its state and resume it when safe. Never reset it merely to match the base.
- If the name is taken and ownership is unclear, stop and ask. That is a collision. Never overwrite or delete a branch without explicit authorization.
- Do not create the task branch from another feature or fix branch. Start from the profile base when creating a new branch, and only from a clean working tree.

Do not edit application source until the current branch is the task branch, or until the profile says branching is not required.

Do not claim that a branch was created or checked out unless the Git command ran, exited 0, and `git branch --show-current` matches the intended name.
