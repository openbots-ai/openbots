# Changelog

Notable changes to OpenBots. The engine (`openbots-runner`) is versioned on its own and released from `runner-vX.Y.Z`
tags; the dashboard and backend are deployed from `main`.

## Unreleased

The first public release. What exists today:

### Dashboard and backend

- Email and password sign-in (Convex Auth) with a private workspace per account; every function checks the signed-in
  user's workspace.
- `npm run setup` generates the deployment's `ENCRYPTION_KEY` and sign-in keys and stores them on Convex, never in
  files.
- Pages for Agents, Models, Knowledge, Numbers, Connections, Analytics and Settings.
- Agents with instructions, knowledge, per-agent model choices, a reply delay, quiet hours, a usage budget, a paused
  state and scheduled check-ins.
- Model slots that run: Brain, Backup and Computer use. The Models page offers exactly the models each saved key can
  use.
- Keys saved once per account in Connections, encrypted with AES-256-GCM and handed only to the account's engines.
- Engine tokens generated in the browser; Convex stores only their hash. Start commands for Windows, Mac and Linux
  with the token filled in.
- Twilio numbers searched, bought or reused from the Numbers page (carried out by the engine), and a test text.
- Always-on engine computers created on the owner's Orgo account from an API key.
- Analytics from daily counts only.

### Engine (`openbots-runner` 0.2.0)

- Contacts, conversations and messages kept in a local SQLite file, encrypted per value; message text is never logged
  or sent to Convex.
- AI providers: OpenAI, Anthropic, Google Gemini, xAI, and local OpenAI-compatible servers. Backup model on provider
  failure, and demo replies when no key is set.
- Texting through Messages on a Mac, BlueBubbles (with group chats), Sendblue, Twilio SMS (signature-checked
  webhooks) or a custom relay. Optional Cloudflare quick tunnel for a public address.
- Web search in replies, and tool calls over several rounds (OpenAI and Anthropic).
- Reminders and watches set by texting your own agent, kept sealed on the engine, plus check-ins on a schedule.
- Handoff alerts by text, and by email with Resend, naming the contact but never quoting them.
- Computer use on Windows and Mac with Claude: tasks started by text, "Reply YES" before anything irreversible, "stop"
  to cancel, and limits of 200 steps or 30 minutes per task.
- Releases built by GitHub Actions: npm with provenance, and a Docker image signed with cosign with a build
  attestation.

### Not built yet

Voice notes, listening, calls, vision, and the Decisions and Router model slots.
