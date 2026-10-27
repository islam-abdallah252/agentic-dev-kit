# ChatGPT adapter

A ChatGPT Project sees the Project instructions, the files uploaded to that Project, and what the operator attaches to the current chat. It does not read the consumer checkout, run Git, or execute the profile's test, lint, or build commands.

Codex inside ChatGPT, and the Codex CLI, read `AGENTS.md`. That path is `ai/adapters/codex.md`. This file is the Project path. It does not add a Custom GPT, a connector, or an API client.

## Project instructions

In Project settings, paste this block. Project instructions apply only inside that Project and override the account's global custom instructions there. OpenAI publishes a character cap for global custom instructions and does not publish one for Project instructions. Keep this block a pointer.

```text
Follow the uploaded ai/README.md and ai/core/lifecycle.md. Read the uploaded ai/project/profile.json and ai/project/profile.md before proposing edits. A pasted story is a valid task source without a ticket URL or ID.
Read the uploaded ai/core/issue-tracker.md, ai/rules/git-and-delivery.md, ai/rules/minimal-implementation.md, ai/core/evidence.md, and ai/rules/testing-and-quality.md. Role behavior lives in the uploaded ai/agents files. Apply an uploaded ai/profiles file only when activeProfiles lists it.
Do not invent a second set of coding rules in this Project.
A normal Project chat cannot launch separate agents. Use Single-agent fallback and say so.
If you cannot run Git, tests, lint, or a build in this chat, mark those checks NOT RUN or BLOCKED.
Do not invent ticket text, diffs, or test results.
```

## Reference files

Upload these files into the Project. ChatGPT stores a snapshot. Uploading a file does not track later Git edits. Preserve each basename, and skip a second file that uses the same basename. Do not upload pointer stubs, Cursor templates, Codex config, or the validator.

| Upload | Role |
| --- | --- |
| `ai/README.md` | Index of the instruction system |
| `ai/core/lifecycle.md` | Task sequence and status gate |
| `ai/core/issue-tracker.md` | Story input and branch procedure |
| `ai/core/evidence.md` | Check-evidence rules |
| `ai/project/SCHEMA.md` | Profile field meanings |
| `ai/project/profile.json` | Machine-readable project configuration |
| `ai/project/profile.md` | Human-readable project configuration |
| `ai/rules/git-and-delivery.md` | Commit approval |
| `ai/rules/minimal-implementation.md` | Smallest sufficient change |
| `ai/rules/testing-and-quality.md` | Checks |
| `ai/agents/implementer.md` | Implementer role |
| `ai/agents/code-reviewer.md` | Code Reviewer role |
| `ai/agents/test-engineer.md` | Test Engineer role |
| each active `ai/profiles/` file | Only profiles named in `activeProfiles` |

Create the Project from a consumer repository that already has `ai/project/profile.json` and `ai/project/profile.md`. If either file is missing, stop and ask. Do not invent project facts.

OpenAI's Projects help lists these file caps: 5 on Free, 25 on Go and Plus, and 40 on Edu, Pro, Business, and Enterprise. Only 10 files upload at a time. Caps can change; confirm them in the product before uploading.

On Free, upload these five first:

1. `ai/core/lifecycle.md`
2. `ai/project/profile.json`
3. `ai/project/profile.md`
4. `ai/rules/git-and-delivery.md`
5. `ai/core/issue-tracker.md`

Attach the remaining canonical files to the task chat. On Go, Plus, and larger plans, upload the full table. When the first batch reaches 10 files, upload the rest, including active profiles, in a later batch.

After a canonical file changes, delete the old Project source and upload the replacement.

## Per-task workflow

The operator supplies the story and the checkout evidence. The same chat runs the lifecycle phases and labels the report **Single-agent fallback**. Project memory and an earlier chat are not the current diff or the current command output.

1. The operator pastes the story, or the ticket text when a URL or ID is present. The chat does not open a tracker.
2. The chat reads the profile. When `branch.base` is unknown, it stops and asks.
3. The chat proposes the branch name from `ai/core/issue-tracker.md`. The operator creates it and pastes the output of `git branch --show-current` and `git status -sb`. The chat does not claim the branch exists until that output is in the chat.
4. The operator attaches the source files for the task. The Implementer phase proposes the edit. The operator applies it and pastes the diff.
5. The Code Reviewer phase reviews that pasted diff.
6. The Test Engineer phase names the commands listed in the profile. The operator runs them in the consumer checkout and pastes each command, its exit code, and the relevant output.
7. The chat writes the report required by `ai/core/lifecycle.md`, then prepares a commit proposal from `ai/rules/git-and-delivery.md`. The operator stages and commits after approval. The chat does not claim that Git ran.

## Limitations

- Uploaded Project files can go stale.
- Project memory is not current Git state. It is not the current branch, working tree, diff, or command output.
- A Project chat does not execute commands against the consumer checkout. Canvas, code execution, and agent mode are not that checkout.
- A Project chat has no equivalent of `.cursor/agents/` or `.codex/agents/`. Review and testing are labeled phases in the same chat.
- A check that did not run in the consumer checkout is `NOT RUN` or `BLOCKED`, with the command, the actual result, and the reason. Do not mark that check passed. The final status comes only from `ai/core/lifecycle.md`. This adapter does not define a looser gate.
- Commit grouping, message, and approval requirements come only from `ai/rules/git-and-delivery.md`. A normal ChatGPT chat cannot hard-lock approval or stage and commit repository files. It may prepare proposals from supplied evidence and must not claim Git execution.
