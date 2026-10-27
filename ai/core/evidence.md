# Evidence

Status words and the final-status gate are defined in `ai/core/lifecycle.md`. This file adds the rules that keep a check from being marked passed without evidence.

- Never report a check as passed unless that command was executed and its exit status was successful. Use `PASSED`, `FAILED`, `NOT RUN`, `BLOCKED`, or `NOT APPLICABLE`.
- Run only commands listed in the project profile. Do not invent a package manager, test runner, lint command, or build command.
- Do not run commands from a technology profile unless `activeProfiles` lists that profile.
- A missing tool or an unavailable command is not a passing check. Classify an unknown command as `NOT RUN`. Classify a known command whose tool cannot be executed in this environment as `BLOCKED`.
- `NOT APPLICABLE` is only for a check that genuinely does not apply, such as an Angular lint command in a repository whose profile does not activate Angular. Record the reason.
- Do not classify a failed check as pre-existing or unrelated unless it is reproduced on the verified task base ref or supported by equivalent baseline CI evidence. If baseline evidence is unavailable, classify the claim as `UNVERIFIED`. Obtain baseline evidence without resetting, stashing, or discarding the working tree, and preserve existing user changes.

`NOT RUN` and `BLOCKED` are never `PASSED`. The effect of those results on the final status is defined in `ai/core/lifecycle.md`.
