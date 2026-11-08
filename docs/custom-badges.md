# Custom HTML/CSS Badges

Open Badges, select the common theme or a person with their own theme enabled, then choose **Свой HTML / CSS**. The left column contains the preview and copyable variables. The right column accepts HTML and CSS and provides a copyable AI brief with an optional design description. Editing does not save automatically: use Save. Use the person's test button to display the saved badge in OBS without sending a Twitch shoutout.

The seventh design is independent of the six built-in palettes. Switching designs does not erase code or colors. The existing entrance, exit and duration controls still apply; preset color/size controls do not modify custom CSS. The application and OBS plugin keep their independent profiles.

## Template Contract

- Fixed transparent canvas: 560 x 560 CSS pixels. Content outside it is clipped. Allow room for shadows and rotation.
- Supply an HTML fragment and a separate CSS stylesheet, or include a style block in the HTML. Each field accepts at most 32768 characters.
- Place variables in HTML text, alt/title, or `src="{{avatar}}"` on an image. Variables are not evaluated in CSS, classes, IDs or scripts.
- `{{name}}`: Twitch display name, up to 40 characters; falls back to login.
- `{{login}}`: Twitch login without @.
- `{{avatar}}`: Twitch avatar, embedded as a raster image; can be empty. Put `{{initial}}` beneath it as a fallback.
- `{{initial}}`: first display-name character.
- `{{description}}`: saved personal description, up to 140 characters; can be empty.
- `{{url}}`: channel URL as text, not a clickable link.
- `{{stamp}}`: saved stamp text, empty when the stamp is disabled. Style the stamp in your CSS.
- `data-hide-empty="description"`, `avatar` or `stamp` removes an element when that value is empty.
- Values are inserted as plain text, not markup. Unknown variable names remain visible and are reported in the editor.
- Use system fonts and CSS. Embedded PNG, JPEG, WebP and GIF data URLs are supported. SVG, external images/fonts, imports, JavaScript, forms, embeds and network calls are not supported.
- CSS animations may be used, but must not hide the badge permanently; the app owns display timing. Respect reduced-motion preferences.

Test a long name, a 140-character description, missing avatar and empty description. Use sensible wrapping, `min-width: 0` and padding. The starter template is available through the example button, with confirmation before replacing code.

## Isolation and Updates

HTML is sanitized with DOMPurify, then displayed in a sandboxed iframe without scripts or same-origin access. A restrictive content policy blocks external resources and network access from the template. The trusted renderer may fetch only a validated Twitch CDN avatar, without credentials, with time and size limits; the sandbox receives the resulting data image. Failure leaves the initial-letter fallback.

Existing settings get new defaults on read; there is no database migration. Saving code leaves people, descriptions, history, cooldowns and the persistent source URL unchanged. Templates are stored per account and may be overridden per person.

Version-aware OBS pages reload after renderer updates. The plugin retains custom badges until a compatible source connects, within the normal fresh-event queue lifetime. After upgrading the OBS plugin from 0.5.0 or older, fully restart OBS to replace its old browser page. Inactive/unloaded sources still need to be active in OBS.

Run `npm test` and `npm run test:badge-custom` for persistence, isolation, responsive layout and already-open source update checks. Tests use temporary profiles and never change installed user data.
