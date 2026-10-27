# Angular SCSS

Apply this profile only when `activeProfiles` includes `angular-scss`.

Stylelint config is `.stylelintrc` when the repository has one. Match the repository Prettier quote style for SCSS. An older Sass guide's quote rule does not override the repository formatter.

- Use SCSS, not the indented Sass syntax, when the project profile sets `angular.style` to `scss`. File names and class names are kebab-case (`selector-class-pattern`).
- Do not use `!important` (`declaration-no-important`).
- Do not use ID selectors (`selector-max-id: 0`). Prefer classes over element selectors (`selector-no-qualifying-type`).
- Nest at most 3 levels (`max-nesting-depth`) and keep compound selectors within the stylelint limit.
- Do not write vendor prefixes. Use the repository browserslist file when it exists.
- Allowed units include `px`, `%`, `em`, `rem`, `vw`, `vh`, `deg`, and `s`.
- Keep component styles on the component. Global styles belong in the directory the project profile names, not in a feature component.
- Do not add inline styles in HTML to bypass this file.
