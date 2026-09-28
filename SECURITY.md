# Security

## Supported Version

Only the latest release receives fixes. The initial 0.1.x release is a public preview, not an audited security product.

## Reporting

Report suspected credential disclosure privately using this repository's GitHub Security Advisories when enabled. Otherwise contact the maintainer through their GitHub profile to arrange private disclosure. Never include real Twitch tokens, Client Secrets, stream keys, SQLite profiles, logs containing credentials, or DPAPI backups in a public issue.

## Boundaries

- The shared Twitch Client ID is public, not a credential. No client secret is present or required.
- Tokens remain in the local worker and Windows DPAPI vault. They are not returned in UI state, export files or update requests. The native panel receives only a device-login user code and the official activation URL.
- Private stdin/stdout pipes connect the plugin and bundled worker. No localhost HTTP/WebSocket listener is opened.
- Network destinations are Twitch APIs/EventSub for functionality; GitHub for explicit update checks. Browser navigation is restricted to the official activation page and this repository.
- Refresh-token rotation is persisted before further use; vault failures disable sending. Unknown POST results are not automatically replayed.
- A per-Windows-user lock prevents multiple OBS plugin instances sharing one profile. It does not coordinate with other PCs or the independent desktop/cloud product.
- Data/profile backups are outside plugin files and releases. SQLite list/history are not encrypted. DPAPI does not defend against malware already running as the same Windows user or a compromised administrator.
- Local sign-out deletes the active token file, not private backups. Revoke the application in Twitch Connections to invalidate retained copies.
- Public distribution uses a source allowlist, pinned dependencies and archive checksums. Unsigned ZIP/script releases do not offer publisher authentication; obtain them from the official GitHub repository.
- Tests never start an OBS stream or post real Twitch shoutouts. Offline preview never loads a real profile.

For public distribution, keep signing/build accounts protected, review dependencies and test first installation and updates on a clean Windows user profile.
