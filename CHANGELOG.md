# Changelog

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
