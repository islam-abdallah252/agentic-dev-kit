# Testing and quality

Commands, the test runner, and locale expectations come from `ai/project/profile.json` and `ai/project/profile.md`. Do not run a command the profile does not list. Do not run a technology profile that `activeProfiles` does not include.

- Run the profile's targeted test command for the affected spec.
- Run the profile's full test command only when the change is wide.
- Run the profile's lint command when the change affects linted files.
- Run the profile's build command when types, templates, or module wiring change.
- Test the changed behavior, including the edge case that failed, not only the happy path. Mock external services. Keep each test independent.
- Colocate new tests with the source file using the repository's existing naming.

Never report a check as passed unless that command was executed and its exit status was successful. Use `PASSED`, `FAILED`, `NOT RUN`, `BLOCKED`, or `NOT APPLICABLE`. For every executed check, include the exact command, exit code, and concise relevant output. For a check that did not run, list the command, the actual result, and the reason.

`NOT APPLICABLE` requires a documented reason and may be used only when the check genuinely does not apply. It is neither `PASSED` nor `FAILED`, does not satisfy a mandatory applicable check, and does not block `READY FOR QA`. Keep it distinct from `NOT RUN`, which means an applicable check was not executed, and `BLOCKED`, which means an external dependency prevented execution. `NOT RUN` and `BLOCKED` are never `PASSED`. The effect of those results on the final status is defined in `ai/core/lifecycle.md`.

A missing tool or an unknown command is not `PASSED`. Follow `ai/core/evidence.md`.

Translation or data assertions verify values, not rendered UI. Report rendered UI and RTL verification separately, and do not imply that value assertions prove visual rendering.
