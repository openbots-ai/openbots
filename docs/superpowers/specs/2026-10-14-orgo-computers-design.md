# Computers for computer use: your own, or Orgo from an API key

Date: 2026-10-14. Status: draft, awaiting review.

## Goal

Every account needs one always-on computer: it runs the engine (answers texts through Sendblue or Twilio with the
account's keys) and is the desktop the agents' computer-use model works on. Users get two ways to have one:

1. **Your own computer.** Any machine they control (laptop, home server, a DigitalOcean droplet). They add it in
   Connections → Computer use, get a token, and run one command. This exists today.
2. **Orgo.** They paste an Orgo API key in Connections and click **Create computer**. OpenBots creates an always-on Orgo
   computer and sets the engine up on it. No terminal, no Mac, no machine of their own.

Messages never reach OpenBots' servers in either case.

## What Orgo provides (from docs.orgo.ai, 2026-10-14)

- `POST https://www.orgo.ai/api/computers` with `Authorization: Bearer <key>`: `workspace_id`, `name` (unique in the
  workspace), optional `os` (`linux` default), `ram` (4–64 GB), `cpu`, `disk_size_gb`, `template_ref`. Returns `id`,
  `instance_id`, `status: running`. Computers "run until you stop them or turn on auto-stop"; the disk survives stop/start.
- `POST /computers/{id}/bash` `{ command, timeout ≤ 300 }`: synchronous, returns `output` and `exit_code`.
- `POST /computers/{id}/start | stop | restart`, `DELETE /computers/{id}`, `GET /computers/{id}`.
- Workspaces API (`GET/POST /workspaces`).
- Computer actions for computer use: `screenshot`, `click`, `mouse-move`, `drag`, `type`, `key`, `scroll`, `wait`.
- Templates (`template_ref`): golden snapshots with secrets and triggers; a later way to boot with the engine preinstalled.
- **Not documented:** inbound traffic. No public IP, hostname or open ports for a server running on the computer.
- **Not documented in the docs:** price and billing basis (on orgo.ai's pricing page; third parties list $29/month for one
  computer).

## Design

### Saving the Orgo key

`orgo` becomes another service in Connections with one field, **API key**, saved per account and encrypted like the
other keys (`convex/lib/sealed.ts`, `secrets` table). It's used by the backend, which calls Orgo on the user's behalf,
so it is not sent to engines.

### Creating an Orgo computer

Connections → Computer use gets a second choice next to "Add computer": **Create on Orgo** (enabled once an Orgo key is
saved). It runs a Convex action that:

1. Decrypts the Orgo key; finds or creates an Orgo workspace named `OpenBots`.
2. Creates the engine's `runners` row and a fresh token (made in the action this time; Convex still stores only its
   hash, and the token goes straight to the computer).
3. `POST /computers` (Linux, 8 GB RAM default), named after the runner, and stores the Orgo computer id on the runner
   (`runners.orgo = { computerId, workspaceId }`).
4. Runs the install over `bash` in steps under 300 s each: install the engine (Node + `npx openbots-runner@<version>`,
   or its Docker image if Docker is available), install `cloudflared`, write the env file with the Convex URL and the
   token, and register a service that starts the tunnel and the engine on boot and restarts them if they stop.
5. Reports progress to the dashboard as it goes (a `tasks`-like status on the runner: creating, installing, online,
   failed with the step and output tail).

The computer then appears in Computer use like any other, marked **Orgo**, with Stop / Start / Delete actions that call
Orgo's lifecycle API.

### Receiving texts without inbound ports

The engine on an Orgo computer runs `cloudflared tunnel --url http://localhost:8787` (Cloudflare's free quick tunnel,
outbound only, no account). The tunnel prints a public `https://*.trycloudflare.com` address; the engine reads it and
reports it with its heartbeat as its public URL, which wins over an empty Public URL field. Because the address changes
when the tunnel restarts, the engine re-points its webhooks (Sendblue's receive webhook, Twilio's number) to the new
address on every change. Texts then go Sendblue/Twilio → tunnel → the user's computer, never through OpenBots' servers.

Own computers keep the manual Public URL field; they can opt into the same tunnel with `OPENBOTS_TUNNEL=true`.

### Computer use

Out of scope for this spec beyond making the computer exist. A follow-up spec covers the computer-use slot driving
the account's computer: on Orgo through its actions API (screenshot/click/type), on an own computer through a local
equivalent.

## What it costs whom

The Orgo computer is on the user's own Orgo account and billed to them by Orgo. OpenBots never pays for it.

## Error handling

- Orgo refuses the key (401), the plan's limits (403), a trial that ended (402): shown on the Orgo card with Orgo's
  message; nothing is created.
- An install step fails: the computer stays, the runner shows **Setup failed** with the step and the last lines of
  output, and a **Retry setup** button reruns the steps (they're safe to rerun).
- The computer is stopped or deleted in Orgo directly: the runner goes offline like any engine; Start / Delete in
  Connections reflect Orgo's state on the next check.

## Testing

- Unit: the Orgo client (request shapes, error mapping) against a fake fetch; the install script is generated per
  runner and is idempotent.
- convex-test: only the owner can create, start, stop or delete; the token hash is stored and the token never returned
  to the dashboard; the Orgo key never reaches `runner.dashboard`.
- Engine: tunnel URL parsing and webhook re-pointing when the URL changes.
- Live (needs an Orgo API key): create a computer, watch it come online in Connections, send a text through Sendblue
  and get a demo reply, stop and start it and see it come back.

## To verify first (spike, with a real Orgo key)

1. A process started from `bash` (e.g. via `systemd`, or `nohup` + `@reboot`) keeps running after the call returns and
   after a stop/start.
2. Node.js or Docker is available or installable, and outbound HTTPS to Cloudflare, npm and Convex is allowed.
3. A quick tunnel from the computer receives an outside HTTPS request.
4. Orgo's billing basis (flat monthly per computer vs usage), from the pricing page or the account.

If 3 fails, the fallback is a relay through Convex that forwards each webhook to the engine's outbound connection; it
works but means texts pass through OpenBots' servers (encrypted in transit only), so it needs a decision before use.
