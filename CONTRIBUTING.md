# Contributing

Use an isolated Windows profile and test Twitch responses. Do not develop against another person's live channel or launch a stream as a test.

1. Fork, create a branch, install Node.js 24 and C++ Build Tools.
2. Run `npm ci --ignore-scripts`, `npm run build`, `npm test` and `npm run audit:source`.
3. Keep Qt work on the UI thread and Twitch/SQLite work in the child worker. Never block the OBS render path with network or database calls.
4. Preserve the on-disk profile path, migration backups, uncertain-send protection and per-channel identity checks. Add tests for new behavior.
5. Update all three README files for user-facing changes. Keep UI translation keys aligned.
6. Never add `release`, build artifacts, database files or credentials to git.

Forks must register their own Twitch Public client. The upstream Client ID identifies the official Shoutout Desk OBS application only.

## Release Checklist

- Run tests, native build, offline wide/narrow UI preview and source audit.
- Test loading/unloading in OBS, local OAuth, an authorized live-channel shoutout, and external-shoutout cooldowns. Do not start a broadcast without explicit permission.
- Test a full installer update with OBS closed and verify data/history remain.
- Update versions in package.json, CMakeLists.txt and CHANGELOG.md.
- Tag `vX.Y.Z`, use the GitHub Actions build artifact or a verified local package. Attach the full ZIP and SHA256 file to the release.
- Mark previews as prereleases until live acceptance is complete. The in-plugin updater offers stable releases only.
- Signing certificates are not in this repository. Never imply an unsigned release is signed.
