# Node.js

Apply this profile only when `activeProfiles` includes `node`.

- Read scripts and the package manager from the project profile. Do not assume npm, pnpm, or yarn.
- Do not run a script that is not listed in the profile.
- Prefer the existing test, lint, and build scripts over ad-hoc tool invocations.
- A missing runtime or an unknown script is `NOT RUN` or `BLOCKED`, never `PASSED`.
