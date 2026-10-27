# Security

## Where your data lives

OpenBots has three parts, and message content exists in only one of them.

| Part | Runs on | Holds |
| --- | --- | --- |
| **Engine** (`runner/`) | A machine the workspace owner chooses | Contacts, conversations, message text (encrypted at rest with a local key), AI keys, Twilio / Sendblue / BlueBubbles / Resend logins. |
| **Backend** (`convex/`) | A Convex deployment | Each user's workspace: settings, agents, model choices, knowledge, their numbers, their own phone and Allowed people list, the numbers (never the texts) of the last 10 people whose texts were ignored, a hash of any pending phone verification code, engine token hashes, keys saved in Connections (encrypted with the server's `ENCRYPTION_KEY`), daily counts, and what each engine reports as set up (which services, which model ids its keys can use, which addresses it texts from). |
| **Dashboard** (`src/`) | The browser | Nothing beyond what the backend holds. It never receives messages, and never receives a saved key back. |

So whoever runs the backend or hosts the dashboard (including the OpenBots developers, Convex, or anyone with a
database backup) cannot read messages, because they never receive them, not even encrypted.

## What each party can see

| Who | Message text | Contact names and numbers | When people text | Settings, prompts, knowledge |
| --- | --- | --- | --- | --- |
| The person texting, and the engine's machine | Yes | Yes | Yes | Yes |
| The model provider the owner picked | Yes, for each reply (none with a local model) | The prompt includes the contact's name, number and notes | No | The assistant's prompt and knowledge |
| The OpenBots backend / developers / Convex | **No** | Only the owner's own phone, their Allowed people, and the last 10 ignored numbers | Daily counts only | Yes, plus the owner's own numbers, which models their keys can use, and the keys saved in Connections (stored encrypted; whoever holds the server's `ENCRYPTION_KEY` can decrypt them) |
| Another OpenBots user | No | No | No | No: every function checks the signed-in user's workspace |
| Someone holding the engine's database file but not its key | No | No | No | n/a |
| Someone holding an engine token | No | No | No | That workspace's, read-only, **including the keys saved in Connections**; can add to counts and answer its Twilio requests. Revoke a token you think was leaked |
| Twilio, Sendblue, BlueBubbles (whichever the owner uses) | Yes, they carry the texts | Yes | Yes | No |
| Orgo, when the owner's computer runs there | Yes, it hosts the computer and its disk | Yes | Yes | The engine's settings file and token |
| Cloudflare, for an Orgo computer's tunnel | Yes, incoming texts pass through it | Yes | Yes | No |
| Anthropic, during a computer use task | The task you texted, the questions it asks you and your answers | Only what's on the screen | No | The task's instructions, not the agent's prompt or knowledge |

During a computer use task, Anthropic sees screenshots of the computer's whole screen, step by step, and the task.
OpenBots and Convex never do: screenshots aren't saved, logged or sent to the backend, and the task text stays on the
engine (sealed, and only while the task runs).

Reminders and watches you set by texting your agent stay on the engine, sealed like messages; Convex sees only how
many each agent has. Check-ins (days, time and what to send) are agent settings, stored in Convex like the agent's
prompt.

Between the engine's machine and the person texting, iMessage provides Apple's end-to-end encryption.

## Who the agents answer

By default, agents answer **nobody**. They reply only to:

- **The owner**, from the phone (or Apple ID email) in Settings, once it's **verified**: the dashboard asks the
  owner's engine to text a 6-digit code to it, and the owner types the code back. Convex stores only a SHA-256 hash of
  the code (salted with the request it came from), accepts it for 10 minutes and 5 tries, and sends at most 3 codes an
  hour. Changing the number undoes the verification; phones saved before verification existed count as unverified.
  The engine is given the owner's phone only while it's verified, and checks that again itself, so an unverified
  number gets no replies, handoffs, alerts, check-ins or owner powers.
- **Allowed people**: names with a phone or Apple ID email that the owner adds in Settings (compared in E.164 form, so
  formatting doesn't matter). They get replies, and documents marked "Share with contacts", within the budget and the
  per-contact reply limit, but none of the owner's powers (computer use, reminders, watches, task approvals).

A text from anyone else is dropped by the engine before anything else happens: no model call, no contact, chat or
message stored, no reply, and no text or email to the owner. That keeps strangers from spending the owner's AI keys
and texting credit. The engine reports only how many it dropped per agent per day, and the numbers (never the text)
of the last few senders, so the owner can allow them in one click. In a group chat each text is checked by its sender;
other members' texts never reach the agent, its history or the model.

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
- **The dashboard** requires the workspace owner's sign-in (Clerk) for every function.
- **Computer use** is off until the owner turns it on for a Windows, Mac or Linux computer in Connections. Only the owner,
  in their own one-to-one chat with the agent, can start a task. Claude must ask the owner ("Reply YES") before
  anything that can't be undone, each task stops after 200 steps or 30 minutes, and texting "stop" cancels it. Web
  pages and documents on the screen can try to mislead Claude into doing something else; the system prompt treats
  screen text as information, not instructions, but that's a mitigation, not a guarantee. What the engine enforces in
  code: it never types text, presses Enter (or Cmd/Ctrl+Enter) or pastes until the owner has approved that action by
  text, shown the exact text (hidden characters spelled out) and the window; no answer is a no. Clicks are not gated,
  so a click on a button that's already there (like "Send" on a filled-in form) still relies on the prompt.

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
- **Senders are recognised by their number**, and caller ID can be spoofed on SMS. A text from the owner's number over
  SMS gets the owner's chat but none of the owner's powers (computer use, reminders, watches, task answers); those
  need iMessage. Someone faking an allowed person's (or the owner's) number over SMS can still get replies, so they
  could spend some of the budget; the daily budget and the per-contact reply limit cap that, and the replies go to the
  real number, not to them.
- **Verification proves the code reached the phone, as far as the owner's engine tells it.** The engine makes and
  texts the code and reports its hash, so someone who controls the owner's engine (normally the owner) could skip the
  text. What it guards against is a mistyped or someone else's number receiving handoffs and check-ins, or being
  treated as the owner. A 6-digit code's hash can be brute-forced by whoever can read the database, which is why it
  expires in 10 minutes and the dashboard never sees it.
- **Counts reveal volume:** the backend knows how many conversations, texts, handoffs and ignored texts each agent had
  per day.
- **Engines older than this change** don't know about Allowed people. The backend tells them every agent is paused,
  so they answer only the owner's verified phone (they may still text the owner once per new chat that an agent is paused)
  until they're updated.
- This design hasn't had an external security review yet.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's private vulnerability reporting:
[open a security advisory](https://github.com/shidhartha-sen/opendots/security/advisories/new). Don't open a public
issue or pull request for a vulnerability. Include what's affected (dashboard, backend or engine, and the engine
version if it's the engine), how to reproduce it, and what an attacker could do with it. The maintainers will reply
in the advisory within a few days and credit you when a fix is published, unless you'd rather not be named.

Fixes go into `main`, and engine fixes ship as a new `openbots-runner` release; there are no long-term support
branches.
