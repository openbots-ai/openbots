# Security

## Where your data lives

OpenBots has three parts, and message content exists in only one of them.

| Part | Runs on | Holds |
| --- | --- | --- |
| **Agent** (`runner/`) | A machine the workspace owner chooses | Contacts, conversations, message text, model keys. Encrypted at rest with a local key. |
| **Backend** (`convex/`) | A Convex deployment | Settings, agents, models, knowledge, iMessage numbers, agent token hashes, daily counts. |
| **Dashboard** (`src/`) | The browser | Nothing beyond what the backend holds. It never receives messages or keys. |

So whoever runs the backend or hosts the dashboard (including the OpenBots developers, Convex, or anyone with a
database backup) cannot read messages, because they never receive them, not even encrypted.

## What each party can see

| Who | Message text | Contact names and numbers | When people text | Settings, prompts, knowledge |
| --- | --- | --- | --- | --- |
| The person texting, and the agent's machine | Yes | Yes | Yes | Yes |
| The model provider the owner picked | Yes, for each reply (none with a local model) | The prompt includes the contact's name, number and notes | No | The agent's prompt and knowledge |
| The OpenBots backend / developers / Convex | **No** | **No** | Daily counts only | Yes |
| Someone holding the agent's database file but not its key | No | No | No | n/a |
| Someone holding an agent token | No | No | No | Yes (read-only), and can add to counts |

Between the agent's machine and the person texting, iMessage provides Apple's end-to-end encryption.

## Design choices

- **Agent tokens** are generated in the owner's browser with Web Crypto. Convex stores only their SHA-256 hash, so a
  database leak doesn't reveal working tokens. Revoking one in Settings → Agent cuts the agent off on its next call.
- **Local encryption:** AES-256-GCM with a fresh random nonce per value. Each value is bound to its row, so values
  can't be swapped between rows. Contacts are looked up by HMAC, never by the stored number.
- **Handoff alerts** to the owner name the contact but never quote message text.
- **The agent never logs message text.**
- **Releases** of the agent are built by GitHub Actions: npm with provenance, Docker signed with cosign plus a build
  attestation. The agent never updates itself. See [runner/README.md](runner/README.md) for how to verify.
- **The dashboard** requires the workspace owner's sign-in (Convex Auth) for every function.

## Known limits

- **The model provider sees conversations** when the owner chooses a cloud model. That's the owner's choice;
  **Local model** keeps everything on their machines.
- **One machine holds the history.** If the agent's data directory and key are lost, so is the history.
- **The relay link:** with the Docker/relay setup, text crosses the network between the owner's Mac and the agent.
  Run it over a private network or HTTPS.
- **macOS's own Messages database** on the agent's Mac is not encrypted by OpenBots; use FileVault.
- **Counts reveal volume:** the backend knows how many conversations, texts and handoffs each agent had per day.
- This design hasn't had an external security review yet.

## Reporting a vulnerability

Please email security reports to hello@opendots.com with "Security" in the subject, rather than opening a public
issue. We'll reply within a few days.
