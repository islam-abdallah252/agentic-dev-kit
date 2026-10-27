# Canonical core

Universal engineering policy lives here and in the two core files that keep their historical paths:

| Concern | Authority |
| Lifecycle, gaps, status, delegation honesty | `ai/core/lifecycle.md` |
| Story input and branch procedure | `ai/core/issue-tracker.md` |
| Check evidence, `UNVERIFIED`, missing tools | `ai/core/evidence.md` |
| Commit approval | `ai/rules/git-and-delivery.md` |
| Smallest sufficient solution | `ai/rules/minimal-implementation.md` |

`ai/rules/git-and-delivery.md` stays on that path so existing adapters and validators keep a stable pointer. It is core policy. It does not contain a repository name, ticket prefix, or package manager.

Project facts live only in `ai/project/profile.json` and `ai/project/profile.md`. Technology rules live in `ai/profiles/` and apply only when `activeProfiles` lists them.

The core version is `ai/CORE_VERSION`.
