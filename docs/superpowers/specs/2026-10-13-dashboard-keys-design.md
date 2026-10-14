# Keys in the dashboard, readable only by your engine

Date: 2026-10-13. Status: approved in conversation, spec awaiting review.

## Goal

Someone who has never opened a `.env` file can paste their AI keys and account logins (BlueBubbles, Sendblue, Twilio,
Resend) into the dashboard and have their assistants use them, without Convex or the OpenBots developers being able
to read them. Environment variables on the engine keep working for people who prefer them.

## Decisions

- **Keys belong to the account, not to an assistant.** One Anthropic key, entered once, is used by Honey, Waffles and
  every other assistant in the workspace.
- **Only your engine can read them.** The browser locks each key with your engine's public key before it's sent.
  Convex stores the locked value and can't open it. If you run engines on several machines, the browser locks a copy
  for each one when you save; you still enter it once.
- **The dashboard wins over environment variables.** If a service is set in both places, the dashboard value is used,
  so Replace always does what it says. An environment variable is the fallback.
- **Write-only fields.** Connections shows whether each service is set, whether it works ("12 models", "rejected
  this key") and when it was saved; never the key.
- **Changes apply live.** The engine picks up a saved, replaced or removed key within seconds, without a restart.
- **The program is called "engine" in the UI.** "Agent" means only the assistants (Honey, Waffles…). Code names
  (`runner/`, `runners` table) and environment variable names stay as they are.
- **New machine:** a newly added engine can't open keys locked for another engine; Connections says which services
  need entering again for it. Handing keys over automatically between engines is out of scope.

## What's covered

| Service | Fields |
| --- | --- |
| OpenAI, Anthropic, Google Gemini, xAI | API key |
| Local model server | URL, optional key |
| Twilio | Account SID, auth token |
| Sendblue | API key ID, API secret |
| BlueBubbles | Server URL, password |
| Resend | API key, from address |
| Engine (not secret) | Public URL, where Twilio, Sendblue or BlueBubbles reach the engine. Stored in plain text on the engine's row. |

Messages on a Mac and the relay stay environment-only for now: the Mac channel has no credentials, and the relay is
for people already comfortable running their own server.

## How it works

**Engine key pair.** On first run the engine makes an RSA-OAEP (SHA-256, 3072-bit) key pair and keeps the private
key in its data directory next to the existing `key` file (mode 0600). It sends the public key with its heartbeat;
Convex stores it on the engine's `runners` row. The engine prints the key's short fingerprint at startup, and
Connections shows the same fingerprint, so a careful user can check they match. The first public key is pinned: a
heartbeat with a different one is refused (so a stolen token can't swap in its own key), and only the owner's
**Reset key** in Connections clears the saved key and that engine's locked values, after which its next heartbeat
registers the new key.

**Locking (browser, Web Crypto).** Saving a service: for each engine in the workspace that has a public key, make a
random AES-256-GCM key, encrypt the service's fields as JSON with it, using `workspaceId:runnerId:service` as
additional data so a locked value can't be moved to another engine or service, and wrap the AES key with that
engine's RSA public key. If no engine has reported a public key yet, the form says to add and start an engine first.

**Storage (Convex).** New table `secrets`: `workspaceId`, `runnerId`, `service`, `sealed` (string), `updatedAt`,
indexed by runner and by workspace + service. `secrets.set` (workspace owner) replaces all rows for that service
with the ones sent and checks every `runnerId` belongs to the workspace. `secrets.remove` deletes them.
`secrets.list` returns, per service, which engines have it and when it was saved; never `sealed`. The engine's own
API (`runner.secrets`, token-checked like the rest of `convex/runner.ts`) returns only that engine's rows.

**Engine.** It subscribes to `runner.secrets`, opens each value with its private key, and merges it over the
environment settings (dashboard first). It now starts with nothing set up and waits; when the merged settings change
it stops the affected services, starts them with the new settings, runs the existing checks and sends a heartbeat,
so Connections updates. A value it can't open (wrong engine, damaged) is reported as an error for that service, not
a crash. Keys opened from the dashboard are held in memory only, never written to disk.

## Security changes

SECURITY.md's first risk changes: until now the dashboard never saw a key. Keys typed into it now pass through the
dashboard page, so a malicious dashboard deploy could read them as they're typed, or show a public key that isn't
your engine's. The fingerprint check is the defence against the second. People who don't want to trust the dashboard
code with keys keep using environment variables. SECURITY.md is updated to say all of this plainly. Convex, a
database backup or a Convex operator still can't read a stored key.

## Testing

- Lock in Web Crypto (Node's `globalThis.crypto.subtle`, as in the browser), open with the engine's Node crypto:
  round trip per service; a value locked for another engine, another service or another workspace fails to open.
- convex-test: only the workspace owner can set, list or remove; `set` refuses an engine from another workspace;
  `list` never returns `sealed`; `runner.secrets` refuses a bad token and returns only that engine's rows.
- Engine settings merge: the dashboard value beats the environment; removing it falls back to the environment;
  starting with nothing set up waits instead of exiting.
- Run it: enter a key in Connections against a local engine and see the status turn to working.
