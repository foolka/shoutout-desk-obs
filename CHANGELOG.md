# Changelog

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
