# Angular and TypeScript

Apply this profile only when `activeProfiles` includes `angular-typescript`.

The component prefix and TypeScript path aliases come from the project profile (`angular.prefix`, `angular.pathAliases`). Do not assume `app` or `@app/*` when the profile sets different values. When the profile leaves them `unknown`, stop and ask.

Follow the surrounding feature. Match its service, form, and permission pattern.

- Keep selectors prefixed with the profile prefix and file names in kebab-case.
- Put a template in its own `.html` file when it is more than three lines.
- Type function parameters and return values when `noImplicitAny` is on. Do not add new globals.
- Import shared code with the profile path aliases when the file already uses those aliases.
- Use strict equality (`===`, `!==`). `==` is only for a null or undefined check.
- Prefer `[]` and `{}` literals over `Array` and `Object` constructors.
- Do not prefix interfaces with `I`. Do not prefix private fields with `_` unless the field backs a getter.
- User-visible strings use the translation mechanism recorded in the project profile. Do not add a second i18n stack.
- HTTP goes through the client the surrounding feature already uses. Do not add a parallel client or a hardcoded product host.
- Forms use the validators the feature already uses.

Lint authority is the linter named by the project profile's lint command. Unused variables may start with `_` when that linter allows it.

Match the repository Prettier settings. Do not fight that format.
