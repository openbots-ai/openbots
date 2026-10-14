# Security

## Where your data lives

OpenBots has three parts, and message content exists in only one of them.

| Part | Runs on | Holds |
| --- | --- | --- |
| **Engine** (`runner/`) | A machine the workspace owner chooses | Contacts, conversations, message text (encrypted at rest with a local key), AI keys, Twilio / Sendblue / BlueBubbles / Resend logins. |
| **Backend** (`convex/`) | A Convex deployment | Each user's workspace: settings, agents, model choices, knowledge, their numbers, engine token hashes, keys saved in Connections (encrypted with the server's `ENCRYPTION_KEY`), daily counts, and what each engine reports as set up (which services, which model ids its keys can use, which addresses it texts from). |
| **Dashboard** (`src/`) | The browser | Nothing beyond what the backend holds. It never receives messages, and never receives a saved key back. |

So whoever runs the backend or hosts the dashboard (including the OpenBots developers, Convex, or anyone with a
database backup) cannot read messages, because they never receive them, not even encrypted.

## What each party can see

| Who | Message text | Contact names and numbers | When people text | Settings, prompts, knowledge |
| --- | --- | --- | --- | --- |
| The person texting, and the engine's machine | Yes | Yes | Yes | Yes |
| The model provider the owner picked | Yes, for each reply (none with a local model) | The prompt includes the contact's name, number and notes | No | The assistant's prompt and knowledge |
| The OpenBots backend / developers / Convex | **No** | **No** | Daily counts only | Yes, plus the owner's own numbers, which models their keys can use, and the keys saved in Connections (stored encrypted; whoever holds the server's `ENCRYPTION_KEY` can decrypt them) |
| Another OpenBots user | No | No | No | No: every function checks the signed-in user's workspace |
| Someone holding the engine's database file but not its key | No | No | No | n/a |
| Someone holding an engine token | No | No | No | That workspace's, read-only, **including the keys saved in Connections**; can add to counts and answer its Twilio requests. Revoke a token you think was leaked |
| Twilio, Sendblue, BlueBubbles (whichever the owner uses) | Yes, they carry the texts | Yes | Yes | No |
| Orgo, when the owner's computer runs there | Yes, it hosts the computer and its disk | Yes | Yes | The engine's settings file and token |
| Cloudflare, for an Orgo computer's tunnel | Yes, incoming texts pass through it | Yes | Yes | No |

Reminders and watches you set by texting your agent stay on the engine, sealed like messages; Convex sees only how
many each agent has. Check-ins (days, time and what to send) are agent settings, stored in Convex like the agent's
prompt.

Between the engine's machine and the person texting, iMessage provides Apple's end-to-end encryption.

## Design choices

- **Keys can be saved in the dashboard or set on the engine.** Keys saved in Connections belong to the account, so they
  can be saved before any engine exists. The backend encrypts them (AES-256-GCM, bound to the workspace and service)
  with the server's `ENCRYPTION_KEY`, never sends them back to the dashboard, and decrypts them only to hand them to the
  account's engines over their token-checked connection. Keys set as environment variables on the engine never leave
  that machine. A key entered in the dashboard wins over the
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
- **Orgo computers** are created on the owner's own Orgo account with the Orgo key saved in Connections. That key is
  used only by the backend to create, start, stop and delete computers; it's never sent to engines. Orgo hosts the
  computer, so it can read what's on it, and incoming texts reach it through Cloudflare's quick tunnel, which ends HTTPS
  at Cloudflare. Run the engine on your own computer to avoid both.
- **The engine's web server** must be reachable by the services that post to it. Use HTTPS (a tunnel is fine) or a
  private network.
- **macOS's own Messages database** on the engine's Mac is not encrypted by OpenBots; use FileVault.
- **Keys saved in Connections can be decrypted by whoever runs the backend.** They're encrypted at rest, so a database
  backup alone doesn't reveal them, but the OpenBots operators hold `ENCRYPTION_KEY` and could decrypt them, and a
  leaked engine token can read them until it's revoked. If you'd rather nobody else could, set your keys as environment
  variables on the engine instead; they never leave that machine.
- **Counts reveal volume:** the backend knows how many conversations, texts and handoffs each agent had per day.
- This design hasn't had an external security review yet.

## Reporting a vulnerability

Please email security reports to hello@opendots.com with "Security" in the subject, rather than opening a public
issue. We'll reply within a few days.
