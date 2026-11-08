# Changelog

## 0.6.0 - 2026-11-08

- Add a seventh badge mode: custom HTML/CSS with a live preview, variable reference, starter template and copyable AI brief.
- Support common and per-streamer templates, inline style blocks and optional empty-field hiding. Keep all six preset designs and their palettes.
- Sanitize HTML with DOMPurify and render in a sandbox without scripts or same-origin access. External resources are blocked; validated Twitch avatars are embedded by the trusted renderer.
- Add source-build checks. Keep custom badges queued until a compatible source connects and reload outdated version-aware pages before display.
- Preserve the separate plugin profile, people, descriptions, source URL, history, cooldowns and authorization. No database migration.
- Fully restart OBS after updating from 0.5.0 or older so its legacy browser page loads the new version-aware renderer.

## 0.5.0 - 2026-11-03

- Give incoming raids priority over queued chat shoutouts, including when the guest message arrives first. Recheck priority before direct Twitch delivery.
- Allow a new raid to bypass the app's personal timeout. Keep Twitch's two-minute channel gap and sixty-minute target cooldown, including observed cooldown timestamps and after a local timeout reset.
- Keep a raid waiting for Twitch for up to two hours instead of dropping it after three rate-limit responses or thirty minutes. A new confirmed shoutout can satisfy that raid without a duplicate.
- Add Terminal, Ticket and Portrait alongside Air, Pass and Sticker, each with its own editable palette.
- Add badge width, background/shadow opacity, shadow blur/offset, border style, avatar shape/outline, text weights, captions, label switches and stamp X/Y/opacity controls.
- Preserve existing people, history, descriptions, palettes, source URLs, authorization and installation identity. New style defaults are applied on read without rewriting old settings; no database schema migration.
- Verify legacy profiles, queue races, long names, all six themes, mobile editors and source reconnection using isolated data. Close OBS before replacing the plugin so its browser source starts with the updated renderer.

## 0.4.0 - 2026-10-15

- Add local OBS shoutout badges with a centered avatar, a one-line nickname and an optional personal description.
- Open the badge editor from the dock or a person's row; test a badge without sending a real Twitch shoutout.
- Include three designs (Air, Pass and Sticker), each with independent editable colors and common or per-streamer themes.
- Add global/per-streamer display switches, a copyable persistent source URL and the default 560 x 560 source size.
- Customize padding, border, corners, gradients, fonts, text sizes, avatar size, spacing and display duration.
- Choose entrance and exit animations independently from ten effects each, with reduced-motion support.
- Add a floating textured stamp with editable text, color, corner, angle and size, without shifting other badge content.
- Fit long nicknames on one line, enlarge and wrap descriptions, and refine Sticker's overlapping header and stamp. Sticker no longer shows a redundant address label.
- Coalesce duplicate Twitch confirmations and ignore failed, uncertain and stale events. Test badges leave history and cooldowns unchanged.
- Preserve badge descriptions, themes and the source token in the same local profile across restarts and in-place upgrades. No database migration is introduced.

## 0.3.4 - 2026-10-06

- Optional diagnostic reports: last hour, 24 hours or 7 days, sent only after confirmation.
- A separate diagnostic helper can prepare a report even when the main worker is unavailable.
- Reports are private to the fermionaplay.win owner and automatically expire after 30 days.
- Allowlisted connection/queue events and per-report pseudonyms; no tokens, chat text or people database.
- Existing profiles, history, cooldowns and authorization are preserved.

## 0.3.3 - 2026-10-06

- Include previously stored Twitch-confirmed events in visible history, including shoutouts made by other tools. Do not label them as sent by this plugin.
- Hide duplicate Twitch confirmation rows for a locally confirmed successful attempt. Keep exports and the underlying database schema unchanged.
- Checkpoint committed SQLite WAL data into the main database on each heartbeat and clean shutdown, without blocking active readers.
- Includes the queue and worker recovery improvements from 0.3.2.

## 0.3.2 - 2026-10-06

- Preserve pending shoutouts across temporary disconnects within the same broadcast; discard them when the broadcast or account changes.
- Retry temporary failures before a shoutout request is sent, without consuming a personal cooldown. Never blindly resend an uncertain request.
- Bound Twitch preflight and reconnect waits; stop cancelled retries from delaying unrelated people.
- Show the next person and minimum waiting time in the dock, with outcome reasons visible in history.
- Recover a crashed or unresponsive local worker with bounded retries, preserving the current pause state and queue.
- Diagnose missing runtime files and profile access/database errors, with small local logs that contain no tokens or raw server responses.
- Back up malformed version metadata instead of letting it prevent startup. Keep database schema 3 and existing people, history and authorization.

## 0.3.1 - 2026-09-30

- Recover automatically from temporary network, rate-limit and Twitch server errors without requesting login.
- Persist rotated single-use tokens before validation and serialize concurrent refreshes.
- Distinguish saved identity from verified authorization and expose the sign-in button when authorization is invalid.
- Show a non-blocking OBS warning for confirmed invalid authorization even with the dock hidden; open settings or dismiss until next launch.
- Keep people, history, cooldowns and the existing database schema unchanged.

## 0.3.0 - 2026-09-30

- Optional incoming-raid shoutouts after at least 20 seconds, including raiders outside the saved list.
- Observed Twitch shoutouts from other bots cancel queued duplicates; personal cooldowns and Twitch limits still apply.
- Automatic, non-blocking update checks with a visible release banner. No automatic downloads or installation.
- Import and migrate the earliest local SQLite databases, preserving people, history and cooldowns.
- Prominent English, Ukrainian and Russian legacy-import instructions; refreshed localized screenshots.
- Database schema 3: version backups are created before migration. Use a backup when downgrading.

## 0.2.0 - 2026-09-28

- Add direct Twitch / Streamer.bot connection selection and one-button local bridge setup.
- Keep the desktop bridge separate and protect bot connection secrets with Windows DPAPI.
- Add a ZIP installer for portable OBS with a separate profile under its config directory.
- Expand all three READMEs with control-by-control instructions and offline UI screenshots.
- Preserve people, history, sign-in and cooldowns during updates.

## 0.1.4 - 2026-09-28

- Add a self-contained Windows EXE installer in English, Ukrainian and Russian.
- Detect OBS, check OBS/Qt compatibility, and block installation/removal while OBS is running without closing it automatically.
- Support in-place upgrades and Windows uninstallation while retaining local people, history, cooldowns and encrypted sign-in.
- Verify the complete package manifest before compiling the installer and publish separate SHA-256 checksums.
- Document EXE installation, updates and removal in all three READMEs; keep ZIP installation available.

## 0.1.3 - 2026-09-28

- Toggle the panel between docked and floating instead of only docking it.
- Update the button icon and localized tooltip when the dock state changes.
- Preserve the previous dock area when reattaching, without unlocking other OBS docks.

## 0.1.2 - 2026-09-28

- Accept legacy Voice history IDs when importing a desktop database, without losing records or cooldowns.
- Preserve cooldown reset markers when importing SQLite as well as JSON.
- Enable auto-shoutouts on every OBS launch and after sign-in; manual pause lasts until the next launch.
- Keep cooldowns and require fresh chat messages after launch; imports still pause the current session.

## 0.1.1 - 2026-09-28

- Show sign-in restoration during startup instead of briefly offering a new login.
- Resume unfinished device authorization from a Windows DPAPI-protected pending login.
- Add a Dock in OBS button without unlocking unrelated docks.
- Add opt-in cooldown reset after OBS has been closed for more than 60 minutes.
- Add manual cooldown reset with a default-No confirmation; preserve people and history.
- Keep Twitch rate limits, cancel queued requests after reset, require fresh chat messages.
- Preserve reset state across restarts and data export/import.

## 0.1.0 - 2026-09-28

Initial public preview.

- Native OBS dock with compact people chips, history, filters and local settings.
- Direct Twitch device login for the broadcaster's own channel only.
- Local SQLite, Windows DPAPI, consistent migration/import backups.
- Per-person cooldowns, serialized queue and observation of external official shoutouts.
- Token-free export and merge import from Shoutout Desk desktop.
- English, Ukrainian and Russian interface and README files.
- Versioned installer packages, checksums and on-demand GitHub update checks.

Known limits: Windows x64 only; no cloud sync; no guarantees across independent bot instances; real OAuth/live shoutout acceptance pending for the initial preview. Desktop and cloud auto-shoutouts must not run on the same channel simultaneously.
