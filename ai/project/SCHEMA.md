# Project profile schema

`ai/project/profile.json` is the machine-readable project configuration. `ai/project/profile.md` is the human explanation and must match it. The schema file is portable. A filled profile is not.

## Required

| Field | Meaning |
| `coreVersion` | Must match `ai/CORE_VERSION` after an intentional upgrade. |
| `project.name` | Repository or package name, or `unknown`. |
| `project.type` | Short kind such as `frontend-web` or `library`, or `unknown`. |
| `packageManager` | `npm`, `pnpm`, `yarn`, `poetry`, `pip`, `go`, `cargo`, `bundler`, `none`, or `unknown`. |
| `tickets.provider` | `jira`, another provider name, `none`, or `unknown`. |
| `tickets.required` | `true`, `false`, or `unknown`. |
| `commits.convention` | Convention name, or `unknown`. |
| `commits.ticketRequired` | `true`, `false`, or `unknown`. |
| `commits.headerPattern` | Regular expression string, or empty when the convention is `unknown`. |
| `branch.base` | The only base-branch setting. A verified branch name, `none` when branching is not used, or `unknown`. |
| `activeProfiles` | Array of profile ids from `ai/profiles/`. Empty when none apply. |

Use the string `unknown` for a required fact that has not been verified. Do not guess.

## Optional

`languages`, `frameworks`, `commands`, `branch.bug`, `branch.feature`, `branch.ticketlessBug`, `branch.ticketlessFeature`, `branch.ticketlessRefactor`, `branch.ticketlessDocs`, `branch.updateBaseFromRemote`, `branch.conflict`, `tickets.idPattern`, `tickets.includeWhenPresent`, `commits.types`, `commits.header`, `commits.ticketlessHeader`, `commits.ticketlessHeaderPattern`, `hooks`, `ci`, and technology-specific objects such as `angular`.

Omit an optional field, or set it to `unknown`, when there is no evidence.

## Rules

- `tickets.provider` `none` means the repository does not use a tracker. Do not require a ticket.
- `tickets.required` `true` means a tracker-linked task must use a real ticket id. It does not block a complete pasted story that has no ticket. Never invent a ticket id.
- `branch.base` is the only base-branch field. Do not add a second field for the same decision. `unknown` means unresolved. The core never substitutes `dev`, `develop`, `main`, or `master`. A configured name still has to be checked against Git before use. When the installer creates a missing profile, it may write the target of `refs/remotes/origin/HEAD`; if that ref is missing, the value stays `unknown`. Discovery and re-install must not replace an explicit value.
- `branch.ticketlessFeature` and `branch.ticketlessBug` are the names to use when the story has no ticket. If they are missing, the core fallback is `feat/<project-name>/<short-description>` or `fix/<project-name>/<short-description>`, using separate path segments. `<project-name>` comes from `project.name`. If that name is unknown, stop. Do not invent `task` or another placeholder. Do not use `feat/<short-description>` or `feat/<project-name>-<short-description>` as that fallback.
- `branch.ticketlessRefactor` and `branch.ticketlessDocs` are optional templates for refactor and docs stories that have no ticket. `ai/lib/task-input.mjs` reads them. Omit a template when that branch shape is not verified.
- An explicit profile template takes precedence over the core fallback. A verified ticket-based template stays in force when a real ticket id is present.
- `commits.ticketlessHeader` and `commits.ticketlessHeaderPattern` are the commit header to use when the story has no ticket. A missing ticket must not skip grouping, bodies, approval, or separate push authorization.
- Commands in `commands` are the only test, lint, and build commands agents may run.
- `activeProfiles` is an explicit list. Discovery may recommend a profile. It must not add one by itself.
- A conflict between this file and repository evidence is reported, not silently repaired.
