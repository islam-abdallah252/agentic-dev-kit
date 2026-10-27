# Codex adapter

Codex reads the root `AGENTS.md` before work. It does not automatically read `ai/`. `AGENTS.md` is a pointer that tells Codex to read `ai/README.md`, `ai/core/lifecycle.md`, and `ai/project/profile.json` before the first application edit.

Codex concatenates `AGENTS.md` files from the repo root down to the working directory and stops at `project_doc_max_bytes` (32 KiB by default). Keep `AGENTS.md` short so the pointer is not truncated. Do not paste `ai/rules/` into `AGENTS.md`.

Nested `AGENTS.override.md` replaces `AGENTS.md` for that directory. Do not add an empty override; Codex still treats the file as present and then drops empty content, which can hide the root instructions for that directory.

## Custom agents

Project agents are `.codex/agents/*.toml`. Codex requires `name`, `description`, and `developer_instructions`. The instructions point at `ai/agents/` and do not restate the engineering standards.

| Agent           | File                               | Extra setting                                 |
| --------------- | ---------------------------------- | --------------------------------------------- |
| `implementer`   | `.codex/agents/implementer.toml`   | Can edit, because no read-only sandbox is set |
| `code-reviewer` | `.codex/agents/code-reviewer.toml` | `sandbox_mode = "read-only"`                  |
| `test-engineer` | `.codex/agents/test-engineer.toml` | Can edit test files                           |

Spawn them only in the order in `ai/core/lifecycle.md`. `agents.enabled` defaults to true. If the user or the Codex config disables subagents, or the spawn fails, run **Single-agent fallback** and say so.

`sandbox_mode` is the documented per-agent setting. The parent approval mode can still override it. The reviewer role also forbids edits, which remains in force when the sandbox does not.

Codex does not provide Cursor's Task tool or `/implementer` slash names. Use the custom agent `name` when asking Codex to delegate.

## Git approval

Read and follow `ai/rules/git-and-delivery.md`. Codex has no platform hard-lock that guarantees approval before staging or committing, so the agent must enforce the canonical approval gate and must not duplicate it here.

## Jira

Use a tracker connector only when the project profile sets `tickets.provider` to `jira` and the user supplied a URL or issue key. A pasted story is a valid task source without Jira. This adapter does not list Cursor's Atlassian tool calls. Those calls are in `ai/adapters/cursor.md` and have not been verified for Codex.

If this Codex session has an Atlassian connector configured, use that connector to read the ticket summary, description, acceptance criteria, and comments. Cloud Codex uses the MCP servers from its own environment, not the servers from a local Cursor session. If this session has no Jira connector, stop and ask for the ticket text. Do not invent a tool name or the ticket.

## What Codex will not do by itself

- It will not load `.cursor/rules/` as Cursor rules.
- It will not open every file under `ai/` unless `AGENTS.md` or the user asks it to.
- It will not guarantee a separate agent for review and testing when subagents are disabled.
