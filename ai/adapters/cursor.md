# Cursor adapter

Cursor loads `.cursor/rules/*.mdc` and `.cursor/agents/*.md`. Those files are compatibility layers. The standards live in `ai/`.

## Rules

Each `.mdc` file keeps Cursor metadata (`description`, `alwaysApply`, `globs`) and points at one canonical file. Cursor injects the adapter, not the canonical file. Before applying a rule, read the canonical path named in that adapter.

| Adapter                                              | Canonical file                          | Scope           |
| ---------------------------------------------------- | --------------------------------------- | --------------- |
| `.cursor/rules/project-context.mdc`                  | `ai/rules/project-context.md`           | Every task      |
| `.cursor/rules/angular-typescript.mdc`               | `ai/profiles/angular-typescript.md`     | `src/**/*.ts`   |
| `.cursor/rules/ui-html.mdc`                          | `ai/profiles/angular-html.md`           | `src/**/*.html` |
| `.cursor/rules/ui-scss.mdc`                          | `ai/profiles/angular-scss.md`           | `src/**/*.scss` |
| `.cursor/rules/testing-and-quality.mdc`              | `ai/rules/testing-and-quality.md`       | `**/*.spec.ts`  |
| `.cursor/rules/jira-and-branch-workflow.mdc`         | `ai/core/issue-tracker.md`              | Every task      |
| `.cursor/rules/git-and-delivery.mdc`                 | `ai/rules/git-and-delivery.md`          | Every task      |
| `.cursor/rules/minimal-implementation.mdc`           | `ai/rules/minimal-implementation.md`    | Every task      |
| `.cursor/rules/multi-agent-development-workflow.mdc` | `ai/core/lifecycle.md`                  | Every task      |

File-scoped rules apply when a matching file is in context. They are not a second copy of the standard.

The shared definitions are `ai/templates/cursor/`. `ai/install/bootstrap.mjs` writes those definitions into `.cursor/rules/` and `.cursor/agents/`. It does not read a source `.cursor/` directory. Machine-local files that are not in the template set stay only on the machine where they were created.

## Jira tools in Cursor

Use this section only when the project profile sets `tickets.provider` to `jira` and the user supplied a Jira URL or issue key. Do not call these tools for a pasted story that has no ticket, or for a profile whose provider is `none`, `unknown`, or a different tracker. A pasted story is a valid task source without Jira.

When the Atlassian connector is available:

1. Call `getAccessibleAtlassianResources` once for the cloud ID.
2. Call `getJiraIssue` for the summary, description, and acceptance criteria.
3. `getJiraIssue` does not return comment bodies. Load them with the issue-comments read operation from `discover`, or open the ticket in the browser.

If those tools fail, stop and ask. Do not invent the ticket.

## Delegation

Follow `ai/core/lifecycle.md`. Read `ai/project/profile.json` before the first application edit.

Launch each phase with the Task tool. Set `subagent_type` to `implementer`, `code-reviewer`, or `test-engineer`. Leave `run_in_background` false. Set `model` only when the user requests one; otherwise omit it so the agent uses `inherit`.

The subagent does not see the parent conversation. Put the user story, acceptance criteria, ticket ID when one exists, branch name, retrieved ticket text when retrieval ran, constraints, paths, and the prior verdict in the prompt.

Manual invocation also works: `/implementer`, `/code-reviewer`, `/test-engineer`.

`code-reviewer` is `readonly: true`, which blocks that subagent from editing. It does not stop the parent or another subagent from editing. Cursor does not hard-lock the sequence. If a separate subagent was not launched, label the report **Single-agent fallback**.

## Git approval

Read and follow `ai/rules/git-and-delivery.md`. Cursor has no platform hard-lock that guarantees approval before staging or committing, so the agent must enforce the canonical approval gate and must not duplicate it here.

## What stays Cursor-specific

YAML frontmatter, `alwaysApply`, `globs`, the Task tool, and `/name` invocation. None of those belong in `ai/rules/` or `ai/agents/`.
