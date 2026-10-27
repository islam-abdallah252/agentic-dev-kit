# AI instruction system

`ai/` is the portable engineering system for this repository. Tool folders do not define a second set of standards.

Core version: see `ai/CORE_VERSION`. The kit release version is the kit `package.json` `version`; those two values must match in this repository.

## Authority

| Path | Role |
| `ai/core/lifecycle.md` | Canonical task sequence, gap analysis, and final report |
| `ai/core/issue-tracker.md` | Canonical story input and branch procedure |
| `ai/core/evidence.md` | Canonical check-evidence rules |
| `ai/rules/git-and-delivery.md` | Canonical commit approval policy |
| `ai/rules/minimal-implementation.md` | Canonical smallest-sufficient-solution policy |
| `ai/project/profile.json` | This repository's configuration |
| `ai/project/profile.md` | Human-readable copy of that configuration |
| `ai/profiles/` | Optional technology profiles |
| `ai/agents/` | Canonical role specifications |
| `ai/adapters/` | How a tool loads the canonical files |
| `ai/discovery/README.md` | How to inspect a new repository |
| `ai/install/QUICKSTART.md` | How to install this system somewhere else |

Compatibility pointers, not authorities:

| Path | Role |
| `ai/workflows/development-lifecycle.md` | Pointer to `ai/core/lifecycle.md` |
| `ai/rules/jira-and-branch.md` | Pointer to the issue-tracker rule and the project profile |
| `ai/rules/project-context.md` | Pointer to the project profile |
| `ai/rules/angular-typescript.md`, `ai/rules/ui-html.md`, `ai/rules/ui-scss.md` | Pointers to technology profiles |
| `ai/templates/cursor/` | Shared Cursor adapter definitions. Local `.cursor/` files are generated from these and are not copied from another machine. |
| `AGENTS.md` | Codex entry pointer |
| `.codex/agents/*.toml` | Codex custom-agent spawn config |
| `rules/ticket-branch.md` | Pointer kept for older references |

If an adapter disagrees with `ai/core/` or `ai/rules/git-and-delivery.md`, follow the canonical file and report the drift.

## Boundaries

- Core rules do not name a company, ticket prefix, branch, package manager, or framework.
- The project profile holds those facts. Unknown values stay `unknown`.
- A technology profile applies only when `activeProfiles` lists it.
- Adapters point at the core. They do not copy the commit-approval policy.
- No adapter hard-locks commit approval. The agent follows `ai/rules/git-and-delivery.md`.

## How to change a rule

1. Edit the canonical file.
2. Do not copy that text into an adapter.
3. If a project fact changes, edit `ai/project/profile.json` and `ai/project/profile.md` together.
4. Run `node ai/validate.mjs`.
5. During ordinary feature work, do not edit `ai/`, `.cursor/rules/`, `.cursor/agents/`, `.codex/agents/`, or `AGENTS.md` unless the user explicitly authorizes rule maintenance.

## What to read for a task

Before the first application edit, read:

1. `ai/core/lifecycle.md`
2. `ai/project/profile.json` and `ai/project/profile.md`
3. `ai/core/issue-tracker.md` for story input and branch preparation
4. `ai/rules/git-and-delivery.md`
5. `ai/rules/minimal-implementation.md`
6. `ai/core/evidence.md` and `ai/rules/testing-and-quality.md` when changing behavior
7. Each active technology profile named by the profile
8. The role file for the phase you are performing

Tool-specific loading is in `ai/adapters/`.

## Install and discovery

New repository: `ai/install/QUICKSTART.md`.

First inspection: `ai/discovery/README.md`. After install, `node ai/discovery/generate-profile.mjs --root .` writes an initial editable profile from verified evidence only. Review it before use.

## Known limits

- Commit approval is an agent policy. It is not a Git hook.
- Discovery does not choose a tracker, a base branch, or a commit convention.
- A copied README must not be treated as the project profile. Repository facts belong in `ai/project/profile.md`.
- ChatGPT does not see the working tree unless files are attached. See `ai/adapters/chatgpt.md`.
