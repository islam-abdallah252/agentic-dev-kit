# Minimal implementation

This file is the canonical smallest-sufficient-solution policy. It applies to every development task in every repository that uses this instruction system. Tool adapters and role files point here and must not restate or weaken it.

## Principle

Always solve the stated requirement with the simplest correct solution. Do not overengineer.

Before changing code, inspect the requirement and the existing implementation. Identify the minimum change that fully solves the problem, then make only that change.

Do not sacrifice correctness, security, maintainability, or required test coverage to minimize line count. Choose the smallest sufficient solution, not the shortest code at any cost.

## Rules

1. Modify only the files and lines needed to satisfy the requirements.
2. Prefer existing functions, components, utilities, services, types, and patterns over introducing new ones.
3. Do not create helpers, services, classes, interfaces, factories, wrappers, or layers unless the task genuinely requires them.
4. Solve the current requirement. Do not build a generic framework for hypothetical future needs.
5. Do not rename, reorganize, clean up, or refactor unrelated code while implementing the task.
6. Handle realistic failure cases and explicitly required edge cases. Do not add redundant validations or speculative fallbacks.
7. Fit the solution into the current project structure and conventions. Do not introduce a new design unless the requirement needs it.
8. Reuse existing logic when practical. Do not add an abstraction solely to remove a small amount of duplication.
9. Add focused tests for the required behavior and important edge cases. Do not build unnecessary test infrastructure.
10. Do not change dependencies, configuration, shared architecture, or unrelated modules unless required to complete the task correctly.

## Decision

Before adding an abstraction, helper, file, dependency, or architectural change, confirm all of the following:

- It is strictly necessary to meet the stated requirements.
- The same result cannot be achieved with a smaller change that uses existing code.
- The extra complexity provides a concrete, current benefit.

If a simpler solution satisfies the requirements, choose the simpler solution. Additional complexity must be justified by a concrete current requirement, not by hypothetical future scenarios or architectural preference.

## Workflow

1. Inspect the existing implementation before deciding how to change it.
2. Identify the minimum required changes before editing.
3. Implement only those changes.
4. Review the diff for unnecessary complexity and unrelated modifications.
5. Run the relevant tests and checks.
6. Report complexity that was genuinely necessary and explain why.
