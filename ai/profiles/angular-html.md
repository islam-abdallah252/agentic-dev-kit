# Angular HTML templates

Apply this profile only when `activeProfiles` includes `angular-html`.

HTMLHint (`.htmlhintrc`) is the checker inside the project profile lint command when that command runs HTMLHint.

- Use the HTML5 doctype on full documents. Keep attribute values in double quotes.
- Do not use inline styles or inline scripts. `style-disabled` and `inline-style-disabled` are on.
- IDs and classes that HTMLHint checks use dash-case (`id-class-value: dash`). Angular bindings, directives, and events stay camelCase.
- IDs must be unique. Do not duplicate attributes. Do not leave `src` empty.
- Escape special characters. Keep paired tags paired. Only void elements are self-closing.
- Keep behavior in the component class. Do not put logic in the template beyond bindings.
- Translate visible text with the project profile's translation mechanism. Add each new key to every locale file the profile lists.
- Follow the existing direction switch for bidirectional layout. Do not hardcode a physical direction for every language.
