# Development lifecycle

Use this sequence for every task that changes application code or behavior. Questions and read-only explanations are out of scope. Edits limited to this instruction system are out of scope unless the user is changing the workflow itself.

Read `ai/project/profile.json` before the first application edit. Apply a file under `ai/profiles/` only when `activeProfiles` lists it. Do not assume a company, product, language, framework, package manager, ticket provider, or branch pattern that the profile does not state. Unknown profile values stay unknown until discovery evidence or the user confirms them.

Gap analysis is an additional quality-control step. It does not replace implementation, review, or testing, and it does not widen the task to unrelated debt.

How a tool launches the three roles is defined in `ai/adapters/`. The role behavior is defined in `ai/agents/`.

## Sequence

1. Read the project profile. Classify the story input as a tracker URL, a ticket ID, or a pasted description. Follow `ai/core/issue-tracker.md`. Retrieve a remote ticket only when a URL or ID is present and a working connector exists. A pasted story is a valid primary source. A missing story URL or ticket ID is not, by itself, a reason to skip branch preparation or the rest of this sequence. Do not invent requirements, ticket IDs, or acceptance criteria. Do not assume a tracker.
2. Inspect the working tree and existing changes before modifying files. Do not discard user changes.
3. Prepare a dedicated task branch with `ai/core/issue-tracker.md` and the branch fields in the project profile before application edits, using the same procedure for URL, ID, and pasted stories. Read `branch.base` from the profile. If it is unknown, missing, conflicting, or not verified in Git, stop and ask. Do not substitute `dev`, `develop`, `main`, or `master`. If the profile says branching is not required, stay on the current branch and record that. Do not commit or push during branch preparation.
4. Identify blocking requirement and dependency gaps. Search the codebase and documentation before treating an omission as unknown. If a missing field, behavior, validation, permission, API contract, or expected outcome would change the result, ask the user and wait. Record non-blocking assumptions.
5. Implement with the Implementer role, using `ai/rules/`, including `ai/rules/minimal-implementation.md`, the active technology profiles, and the surrounding code. Do not start review while implementation is unfinished, and do not implement while a task blocker is unresolved.
6. Independently review the completed diff with the Code Reviewer role. Do not treat the implementer's summary as proof.
7. On `FAIL`, send every confirmed category B defect back to the Implementer, then review the changed implementation again before testing. On `BLOCKED`, stop and report every open category A finding or missing review input. Severity does not excuse an open category B defect.
8. After review returns `PASS`, validate with the Test Engineer role. Run the checks in `ai/rules/testing-and-quality.md` and `ai/core/evidence.md`, using only commands the project profile lists.
9. On a failed check, send it to the Implementer. If production code changes, review again, then rerun the affected checks.
10. Consolidate findings from the initial analysis, implementation, review, and testing. Deduplicate them. Produce the gap analysis in the final report.
11. Propose reusable rule or role improvements for approval. Do not edit `ai/`, `.cursor/`, `.codex/`, or `AGENTS.md` during ordinary feature work unless the user explicitly authorizes rule maintenance.
12. Follow `ai/rules/git-and-delivery.md`: inspect all Git states, prepare logically coherent commit groups, validate complete commit titles and descriptions against the project profile, present exact files and actual verification evidence, and wait for explicit group-specific approval before staging or committing. If the user explicitly excluded commits for this task, record that exclusion and skip the proposal.
13. After approval, commit only approved groups with explicit-path staging, verify Git state after every commit, stop on failure, and never infer push approval from commit approval.
14. Provide the final report and status. Continue this workflow for subsequent requested work until the user says it is finished or asks to stop.

## Execution modes

When the tool can launch separate agents, delegate each of implementation, review, and testing, wait for it to finish, and check the evidence before the next stage. Pass the ticket text, acceptance criteria, branch name, relevant paths, assumptions, and the prior verdict. A subagent does not see the parent conversation.

Distinguish the instruction to launch an independent agent from runtime evidence that the launch occurred and from the result the agent returned. Never claim that an independent agent was launched or returned a result without actual launch and result evidence from the tool. Static instruction validation can reject an explicit contradictory policy, but it cannot prove that runtime delegation occurred.

When the tool cannot launch separate agents, perform the same three phases in this order inside the one session. Label the report **Single-agent fallback**. Do not claim that separate agents were used. Keep review and testing as their own labeled sections, and do not let the implementation summary replace them.

Do not run two writers on the same files at the same time. The Implementer and Test Engineer both write files, so keep them sequential. Independent read-only lookups may run in parallel. The Code Reviewer must not edit production code.

A completion message is not proof. Implementation evidence is the diff. Review evidence is file and line findings. Test evidence is the exact executed command, exit code, and concise relevant output, including concise evidence for every relevant failure.

## Gap classification

Classify every finding as one of:

- **A. Task Blocker** — a missing requirement or dependency that prevents safe or correct implementation. Ask for clarification.
- **B. Task Defect** — a confirmed problem in this implementation. Fix it before the task is complete.
- **C. Project Rule Candidate** — a recurring convention, testing requirement, or workflow improvement that may become a permanent rule.
- **D. Agent Improvement Candidate** — a gap in a role, checklist, or workflow instruction.
- **E. Informational / Future Improvement** — non-blocking, outside this task's implementation scope, or not justified as a code change.

For every finding include a short description, evidence (file and line, failed test, or requirement), impact and severity, recommended action, and whether the user must approve it.

Validate findings against the code and the requirements. Do not treat an unusual established pattern as a defect. Do not invent rule gaps.

## Rule improvement loop

At the end of every task, decide whether a discovered gap shows a missing or ineffective rule.

When a reusable improvement is justified, include:

1. Why the current rules did not prevent or detect it.
2. The exact canonical file to update (`ai/core/`, `ai/rules/`, `ai/profiles/`, `ai/project/`, or `ai/agents/`).
3. The exact instruction to add or revise.
4. How that change prevents the same problem on a later task.
5. Priority: `required`, `recommended`, or `optional`.

If none are justified, write exactly: **No new agent or rule improvements identified for this task.**

## Final report

Include every section. When a section has no findings, say so. When a ticket is linked, include the ticket ID, the verified branch name, the acceptance criteria taken from the ticket, the test results, and the gap analysis. When the source was a pasted story, include the story summary and the verified branch name instead of a ticket ID. State whether the run used delegated agents or **Single-agent fallback**.

1. **Implementation Summary** — when a ticket is linked, start with the ticket ID and branch name. When the source was a pasted story, start with the story summary and branch name.
2. **Code Review Results**
3. **Testing Results**
4. **Acceptance Criteria Status**
5. **Gap Analysis** — requirement gaps; implementation and regression gaps; testing gaps; architecture or documentation gaps where relevant.
6. **Agent / Rule Improvement Proposals** — canonical file to update, proposed instruction, reason and expected benefit, and that approval is required.
7. **Remaining Risks and Blockers**
8. **Final Status:** `READY FOR QA`, `BLOCKED`, or `NOT READY`.

For every executed check in the final report, include the exact command, exit code, and concise relevant output. For each relevant failure, include concise evidence from the output. Translation or data assertions verify values, not rendered UI; report rendered UI and RTL verification separately, and do not imply that value assertions prove visual rendering.

The parent assigns the status from this section. An adapter must not use a weaker gate.

### READY FOR QA

Allowed only when all of these are true:

- Every required acceptance criterion has been assessed.
- No category A or B finding remains open.
- The latest review returned `PASS`. `PASS` means no category A or B finding remains open and the defined review criteria are satisfied. `FAIL` means any confirmed category B defect remains unresolved. `BLOCKED` means any category A finding remains open or required review input is unavailable.
- Every mandatory check that applies to the task was executed and passed.
- A check that does not apply to this task is `NOT APPLICABLE`; record why it does not apply.

### BLOCKED

Use when an external dependency, access restriction, missing required information, or environment problem prevents a mandatory stage or check from being completed.

### NOT READY

Use when a mandatory check fails, a confirmed category B defect remains unresolved, the review has not passed, an acceptance criterion has not passed, or required verification is still incomplete for a reason that is not a genuine external blocker.

`NOT APPLICABLE` requires a documented reason and may be used only when the check genuinely does not apply. It is neither `PASSED` nor `FAILED`, does not satisfy a mandatory applicable check, and does not block `READY FOR QA`. Keep it distinct from `NOT RUN`, which means an applicable check was not executed, and `BLOCKED`, which means an external dependency prevented execution.

`NOT RUN` and `BLOCKED` checks are never `PASSED`. For every check that did not run, list the command, the actual result, and the reason. A mandatory check left `NOT RUN` without an external blocker makes the task `NOT READY`. A mandatory check left `BLOCKED` by an external dependency makes the task `BLOCKED`.

Unresolved C, D, and E items still appear in the report. They do not by themselves prevent `READY FOR QA`.

No tool hard-locks this sequence. The agent follows it because this file says to.
