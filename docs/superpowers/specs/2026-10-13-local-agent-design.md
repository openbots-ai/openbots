# Messages never leave the agent

Date: 2026-10-13. Status: approved in conversation, building.

## Goal

Nobody outside the agent and the person texting it can read messages: not the OpenBots developers, not
whoever runs the Convex deployment, not someone with a database backup. The workspace owner chooses where the
agent runs (their Mac, a VM, anything) and which model it uses (local or a cloud provider, their call).

## Decisions

- The agent is an open-source program (`runner/`) the owner runs wherever they like. It sends and receives
  iMessages (natively on a Mac, or through a relay on the owner's Mac), keeps contacts, conversations and
  messages in a local SQLite file, and calls the owner's chosen model with keys set on the agent.
- Convex never receives message text, contact details or provider keys, not even encrypted. It holds the
  owner's configuration (agents, models, knowledge, numbers, settings) and anonymous daily counts.
- The dashboard has no Conversations, Live or Contacts views, no notification inbox and no "Test a text".
- Handoffs: the agent texts the owner's own phone ("Dana needs you, from Pip"), then stays out of that
  conversation for 24 hours so the owner can answer in Messages.
- History lives on one machine. Losing it loses history; that is the accepted trade-off.

## What fixes the three real risks

1. Dashboard code served by the developer: the dashboard never sees a message or a key, so there is nothing
   for a bad deploy to steal.
2. Agent updates: releases are built in GitHub Actions with npm provenance, Docker images are signed with
   cosign, the agent never updates itself, and the docs show how to verify a release or build from source.
3. Metadata: Convex sees per-agent daily counts only (conversations, new contacts, messages in/out, handoffs,
   model usage). No names, numbers or timestamps of individual messages.

## Pieces

**Convex**
- Removed: `messages`, `conversations`, `contacts`, `notifications` tables; `/inbound`, delivery, replies,
  notifications, the digest cron, model-provider / relay / Resend env vars.
- Added: `runners` (agent tokens, stored as SHA-256 hashes; the token is made in the browser and the server
  never sees it), `activity` (daily counts per agent), `convex/runner.ts` (the agent's API: read config,
  heartbeat, budget check, record counts; every call checks the token).
- Workspace: `ownerHandle` (where handoff alerts go) replaces `ownerEmail`; the digest settings go.
- `migrations:purgeLegacy` deletes the old message tables on deployments that have them.

**Agent (`runner/`)**
- `config.ts` env-based config; `crypto.ts` AES-256-GCM with a local key file (mode 600) so a copied
  database is useless alone; `store.ts` SQLite via `node:sqlite` (message text and notes encrypted);
  `brain.ts` model calls (moved from `convex/lib/llm.ts`); `pipeline.ts` the reply logic (delay, quiet hours,
  budget, Backup fallback, handoff); `sync.ts` the Convex link; `transports/mac.ts` and `transports/relay.ts`.
- Shared logic (`convex/lib/models`, `prompt`, `quiet`, `usage`, `handles`, `demo`) is imported, not copied.

**Dashboard**
- Analytics from `usage` + `activity`. Settings gets an Agent section: online status, version, which provider
  keys the agent has, create/revoke tokens, setup commands.

## Errors

- No agent online: dashboard shows "Agent offline, last seen …"; texts wait in iMessage until it's back
  (mac transport reads anything newer than its last checkpoint; relay transport depends on the relay).
- Model failure: Backup takes over; if both fail, or the budget is used up, or the agent is paused, the owner
  gets a handoff text with a plain reason and no message content.
- Invalid or revoked token: the agent exits with a clear message.
- Agent never logs message text.

## Testing

- Convex: token checks (missing, wrong, revoked), counts add up, config carries no message data.
- Agent: crypto round trip and tamper detection; the SQLite file on disk has no plaintext; the pipeline with a
  fake transport, fake Convex and fake model (reply, quiet hours, handoff pauses the conversation, budget block,
  Backup fallback, demo mode).
