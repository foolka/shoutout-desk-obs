# Shoutout Desk OBS

[Українська](README.uk.md) · [Русский](README.ru.md) · **English**

A local Twitch auto-shoutout plugin with a compact, dark OBS Studio dock. Add streamers to a list; their first chat message after your cooldown queues an official Twitch shoutout. No Streamer.bot, cloud account, or moderator mode.

## Requirements

- Windows 10/11 x64, OBS Studio 32.x with Qt 6.8 or newer. Other platforms are not supported yet.
- Your own Twitch broadcaster account. Internet access to Twitch is required.
- Only **one** auto-shoutout instance per channel: disable the desktop/cloud version before enabling this plugin.

## Install

1. Download the Windows x64 ZIP from [Releases](https://github.com/foolka/shoutout-desk-obs/releases) and extract the entire archive.
2. Close OBS completely. Run `Install.cmd`; run it as administrator if Windows denies access to ProgramData.
3. Open OBS → **Docks → Shoutout Desk**. Dock or float the panel wherever you prefer.

The panel icon next to Reconnect docks Shoutout Desk on the right of OBS, even when dock dragging is locked. To drag panels manually, turn off **Docks → Lock Docks**. Other docks are not unlocked by the plugin.

The installer checks package SHA-256 hashes and installs only `C:\ProgramData\obs-studio\plugins\shoutout-desk-obs`. It does not replace OBS/Qt DLLs, scenes, sources, profiles, or stream settings. This preview installer targets a standard OBS installation, not portable mode.

## Setup

1. Open **Settings → Sign in with Twitch**. Enter the displayed code at the official Twitch activation page and authorize **your broadcaster account**.
2. Add Twitch names or channel links in **People** and set the per-person cooldown (1–168 hours). Auto-shoutouts are enabled on every OBS launch and after a new sign-in. Unchecking **Enabled** pauses them for the current session; the next launch enables them again without resetting cooldowns.
3. The plugin listens while OBS is open. Shoutouts are sent only while Twitch reports your channel live. Hiding the dock does not stop the worker; closing OBS does.

The public build includes a shared **Public Client ID**. No client secret is needed. Fork maintainers must register their own application in [Twitch Developer Console](https://dev.twitch.tv/console/apps), select **Public / Chat Bot**, add `http://localhost` as the required redirect placeholder (device login does not use it), and replace `data/twitch-client.json`. Do not share one client ID between different applications.

Permissions: `user:read:chat` and `moderator:manage:shoutouts`. The latter is Twitch's permission name; the plugin only operates on the signed-in broadcaster's own channel. It cannot select a moderated channel. Twitch's stream-key, email, subscription and financial permissions are not requested.

## Updates And Data

**Reset after closing OBS** is off by default. When enabled, the next launch resets personal plugin cooldowns only if OBS was closed for more than 60 minutes. A running OBS does not count as time closed. After an abnormal exit, the last heartbeat plus a 30-second grace period is used. The first launch has no previous session to reset.

**Reset all cooldowns** asks for confirmation (No by default). Both resets preserve people and history, cancel pending requests and require a new chat message. Twitch's own rate limits and the global safety gap remain. Neither reset starts a broadcast or immediately sends shoutouts.

- Click **Settings → Check for updates**, download and extract the new full ZIP, close OBS and run the new `Install.cmd`. Never replace just the DLL.
- Data lives separately in `%LOCALAPPDATA%\Shoutout Desk OBS`. Updating or reinstalling plugin files does not erase it.
- Before opening an existing database with a new plugin version, a consistent SQLite backup (including WAL) and encrypted sign-in backup are saved under `backups`. If backup fails, startup stops.
- Previous installed plugin files are kept under `%PROGRAMDATA%\ShoutoutDeskOBS-install-backups`. Use the matching data backup when rolling back across a future database migration.
- **Import / Export** transfers lists, history and cooldowns, never OAuth tokens. Import can read a Shoutout Desk desktop `shoutouts.sqlite` from the same account, including history previously imported from Voice. It creates a backup, merges rather than deletes, and pauses automation until you enable it or restart OBS. Close the desktop app first.
- **Sign out** forgets the active local sign-in. To invalidate all copies (including backups), disconnect the application in [Twitch Connections](https://www.twitch.tv/settings/connections).

## Reliability And Privacy

Twitch tokens are protected with Windows DPAPI for the current Windows user. There is no website backend, telemetry, listening TCP port or Streamer.bot connection. The dock starts a bundled Node.js worker over private process pipes; the worker exits when OBS closes. Chat message text is not stored. Lists/history are ordinary local SQLite data, not encrypted. Protect your Windows account and private backups.

The queue respects a 125-second global gap, your per-person cooldown, external official shoutouts, a 10-second settling window and duplicate chat events. Old pending messages are cancelled after restart; an unconfirmed send is not blindly retried. Lost Twitch events or simultaneous independent bots mean absolute prevention of duplicates cannot be guaranteed. A plain bot chat link is not an official shoutout event.

No updates are installed automatically. Update checks contact GitHub only when clicked and do not include Twitch tokens. Archives are not Authenticode-signed; SHA-256 checks detect corruption, not publisher identity. Obtain releases only from this repository.

## Development

Node.js 24.14+, Visual Studio C++ Build Tools (2019 16.7+ or 2022), Windows SDK and CMake 3.20+ are required.

```powershell
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

The build script downloads a pinned SHA-256-verified official OBS Qt SDK. `QT_SDK` and `CMAKE_EXE` can override local tool paths. Packaging includes a checksum-verified Node 24.14.0 runtime and production dependencies. `shoutout-preview.exe <packaged-plugin-data-directory> <screenshots-directory>` runs an offline preview using temporary data, never sends a Twitch request, and exits after screenshots. Point `PATH`/`QT_PLUGIN_PATH` to your OBS Qt runtime to launch it.

The native dock uses the public OBS frontend C ABI and Qt Widgets; the worker uses Twurple and SQLite. See [SECURITY.md](SECURITY.md), [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), and [third-party notices](THIRD_PARTY_NOTICES.md). GPL-2.0-or-later. Not affiliated with Twitch or OBS Project.

### Release Status

Initial public preview. Native loading and the dock were checked in OBS 32.2.2 with Qt 6.11.1. Automated tests use fake Twitch responses and isolated databases; a real OAuth and live-channel shoutout acceptance test must be completed before calling a release production-tested. No test starts a broadcast.
