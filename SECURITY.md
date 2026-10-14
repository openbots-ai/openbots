# Security

## Where your data lives

OpenBots has three parts, and message content exists in only one of them.

| Part | Runs on | Holds |
| --- | --- | --- |
| **Engine** (`runner/`) | A machine the workspace owner chooses | Contacts, conversations, message text (encrypted at rest with a local key), AI keys, Twilio / Sendblue / BlueBubbles / Resend logins. |
| **Backend** (`convex/`) | A Convex deployment | Each user's workspace: settings, agents, model choices, knowledge, their numbers, engine token hashes, keys entered in the dashboard (stored locked for your engine, unreadable without its private key), daily counts, and what each engine reports as set up (which services, which model ids its keys can use, which addresses it texts from). |
| **Dashboard** (`src/`) | The browser | Nothing beyond what the backend holds. It never receives messages. Keys you enter pass through it only to be locked (see below). |

So whoever runs the backend or hosts the dashboard (including the OpenBots developers, Convex, or anyone with a
database backup) cannot read messages, because they never receive them, not even encrypted.

## What each party can see

| Who | Message text | Contact names and numbers | When people text | Settings, prompts, knowledge |
| --- | --- | --- | --- | --- |
| The person texting, and the engine's machine | Yes | Yes | Yes | Yes |
| The model provider the owner picked | Yes, for each reply (none with a local model) | The prompt includes the contact's name, number and notes | No | The assistant's prompt and knowledge |
| The OpenBots backend / developers / Convex | **No** | **No** | Daily counts only | Yes, plus the owner's own numbers and which models their keys can use |
| Another OpenBots user | No | No | No | No: every function checks the signed-in user's workspace |
| Someone holding the engine's database file but not its key | No | No | No | n/a |
| Someone holding an engine token | No | No | No | That workspace's, read-only; can add to counts and answer its Twilio requests |
| Twilio, Sendblue, BlueBubbles (whichever the owner uses) | Yes, they carry the texts | Yes | Yes | No |

Keys entered in the dashboard: stored in Convex locked for your engine; only the engine can open them.

Between the engine's machine and the person texting, iMessage provides Apple's end-to-end encryption.

## Design choices

- **Keys can be entered in the dashboard or set on the engine.** Keys entered in Connections are locked in the browser
  with the engine's public key before they're sent, so Convex stores only locked values that just that engine can open.
  Keys set as environment variables on the engine never leave that machine. A key entered in the dashboard wins over the
  same environment variable. Things that need keys, like listing the models a key can use or buying a Twilio number, run
  on the engine; the dashboard queues the request and sees only the result (model ids, phone numbers).
- **Webhooks** from Twilio, Sendblue and BlueBubbles go to the engine's own web server, on paths with a random secret.
  Twilio's requests are checked against their signature.
- **Engine tokens** are generated in the owner's browser with Web Crypto. Convex stores only their SHA-256 hash, so a
  database leak doesn't reveal working tokens. Revoking one in Connections cuts the engine off on its next call.
- **Local encryption:** AES-256-GCM with a fresh random nonce per value. Each value is bound to its row, so values
  can't be swapped between rows. Contacts are looked up by HMAC, never by the stored number.
- **Handoff alerts** to the owner name the contact but never quote message text.
- **The engine never logs message text.**
- **Releases** of the engine are built by GitHub Actions: npm with provenance, Docker signed with cosign plus a build
  attestation. The engine never updates itself. See [runner/README.md](runner/README.md) for how to verify.
- **The dashboard** requires the workspace owner's sign-in (Convex Auth) for every function.

## Known limits

- **The model provider sees conversations** when the owner chooses a cloud model. That's the owner's choice;
  **Local model** keeps everything on their machines.
- **One machine holds the history.** If the engine's data directory and key are lost, so is the history.
- **The texting services see texts.** Twilio, Sendblue and BlueBubbles' own servers (where used) carry them. Messages on
  the engine's Mac avoids any third party besides Apple's end-to-end encrypted iMessage.
- **The engine's web server** must be reachable by the services that post to it. Use HTTPS (a tunnel is fine) or a
  private network.
- **macOS's own Messages database** on the engine's Mac is not encrypted by OpenBots; use FileVault.
- **Dashboard code served by the developer.** The dashboard never sees your messages. Keys you type into Connections do pass through the page: it locks them with your engine's public key before sending, so Convex, its operator and database backups can't read them, but a malicious dashboard update could read a key as you type it, or show a public key that isn't your engine's. Check that the key fingerprint Connections shows matches the one your engine prints when it starts. If you'd rather not trust the dashboard with keys at all, set them as environment variables on the engine instead; they never leave that machine.
- **Counts reveal volume:** the backend knows how many conversations, texts and handoffs each agent had per day.
- This design hasn't had an external security review yet.

## Reporting a vulnerability

Please email security reports to hello@opendots.com with "Security" in the subject, rather than opening a public
issue. We'll reply within a few days.
