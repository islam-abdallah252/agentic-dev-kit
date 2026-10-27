# ChatGPT adapter

ChatGPT does not automatically read this repository, run Git, or execute Jest. A chat on chatgpt.com sees only the conversation, account custom instructions, and files or connectors attached to that chat or Project.

## What can be loaded

1. Create a ChatGPT Project for this repository.
2. In Project settings, set the instructions to the block below. Project instructions override the account's global custom instructions for chats inside that Project.
3. Upload `ai/README.md`, `ai/core/lifecycle.md`, `ai/project/profile.json`, `ai/agents/`, and the active files under `ai/profiles/` as Project files. ChatGPT can use uploaded files as reference material. Uploading them does not connect them to future edits in the Git repository.
4. A pasted story in the chat is a valid task source. When a ticket URL or ID is present and is not in an uploaded file, paste the ticket text. Do not expect ChatGPT to open a tracker unless a connector in that chat can read the issue and the profile names that tracker.

Project instructions to paste:

```text
Follow the uploaded ai/README.md and ai/core/lifecycle.md. Use the uploaded project profile for commands, tickets, and branches. A pasted story is a valid task source without a ticket URL or ID.
Standards live in the uploaded ai/rules files. Role behavior lives in the uploaded ai/agents files.
Do not invent a second set of coding rules in this Project.
If you cannot run Git, Jest, lint, or a build in this chat, mark those checks NOT RUN or BLOCKED.
If you cannot launch separate agents, use Single-agent fallback and say so.
Do not invent ticket text or test results.
```

## What is not automatic

- ChatGPT does not clone the repo or see the working tree unless the user pastes a diff or uses a coding product that has the checkout.
- Uploaded Project files can go stale. After a canonical change, upload the changed files again.
- There is no ChatGPT equivalent of `.cursor/agents/` or `.codex/agents/` in a normal Project chat. Review and testing are separate labeled phases, not separate agents, unless the user is actually in Codex or another agent runner.
- Codex inside ChatGPT or the Codex CLI is the path that reads `AGENTS.md`. That path is `ai/adapters/codex.md`, not this file.

## Coding from ChatGPT

If the chat cannot run commands, that is a tool limitation. Mark each required check `NOT RUN` or `BLOCKED`, and include the command, the actual result, and the reason. Do not mark those checks passed. The final status comes only from `ai/core/lifecycle.md`. This adapter does not define a looser gate.

Commit grouping, message, and approval requirements come only from `ai/rules/git-and-delivery.md`. A normal ChatGPT chat cannot hard-lock approval or stage and commit repository files; it may prepare proposals from supplied evidence but must not claim Git execution.
