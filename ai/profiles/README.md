# Technology profiles

A profile applies only when `ai/project/profile.json` lists its id in `activeProfiles`.

| Id | File | When |
| `angular-typescript` | `ai/profiles/angular-typescript.md` | Angular TypeScript sources |
| `angular-html` | `ai/profiles/angular-html.md` | Angular HTML templates |
| `angular-scss` | `ai/profiles/angular-scss.md` | Angular SCSS |
| `node` | `ai/profiles/node.md` | Node.js services or libraries |
| `python` | `ai/profiles/python.md` | Python projects |

Commands stay in the project profile. A profile must not tell an agent to run npm in a project whose package manager is not npm.

To add a profile, add a markdown file here, document its id in this table, and list that id in the project profile only after repository evidence supports it. Discovery may recommend an id. It must not activate it.
