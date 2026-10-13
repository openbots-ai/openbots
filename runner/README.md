# OpenBots agent

The agent answers the texts your OpenBots agents receive, using the models you choose. You run it on a machine you
control: the Mac signed in to iMessage, a VM, a server at home.

**Messages never leave it.** Contacts, conversations and message text are kept in a local SQLite file, encrypted
with a key that sits next to it. Your AI keys and account logins stay here too. The OpenBots dashboard and its Convex
backend only ever see your settings (agents, models, knowledge, numbers), anonymous daily counts, and what the agent
reports as set up: which services, which models your keys can use, and which addresses it texts from.

The one exception is the model you pick: a cloud model (OpenAI, Anthropic, Google, xAI) receives each conversation
so it can write the reply. Use a local model server if nothing should leave your machines.

## Start it

1. In the dashboard, open **Connections**, name the machine and click **Add agent**. Copy the token. It's shown
   once and never stored, because Convex keeps only its hash.
2. Run the agent with that token, your AI key(s) and at least one way to text (see Settings below).

```sh
OPENBOTS_CONVEX_URL=https://<your-deployment>.convex.cloud \
OPENBOTS_TOKEN=obr_... \
OPENAI_API_KEY=sk-... \
npx openbots-runner@0.2.0
```

On a Mac signed in to Messages with nothing else set up, it texts through Messages on that Mac. Give the app that
runs it (Terminal, iTerm, or your launchd job's binary) **Full Disk Access** in System Settings → Privacy & Security,
so it can read `~/Library/Messages`, and allow it to control **Messages** when macOS asks. It answers one-to-one
chats and starts from the newest message, so old history isn't answered. Keep it running with a `launchd` agent or
`pm2`.

Anywhere else, use Docker with Twilio, Sendblue, BlueBubbles or a relay:

```sh
docker run -d --name openbots -v openbots:/data -p 8787:8787 \
  -e OPENBOTS_CONVEX_URL=https://<your-deployment>.convex.cloud \
  -e OPENBOTS_TOKEN=obr_... \
  -e OPENBOTS_PUBLIC_URL=https://<where your accounts reach it> \
  -e OPENAI_API_KEY=sk-... \
  -e TWILIO_ACCOUNT_SID=AC... -e TWILIO_AUTH_TOKEN=... \
  ghcr.io/shidhartha-sen/openbots-runner:0.2.0
```

Twilio and Sendblue post incoming texts to the agent, so it needs a public HTTPS URL: a tunnel such as Cloudflare
Tunnel or Tailscale Funnel to port 8787 is enough. BlueBubbles only needs the Mac to reach the agent, so a private
network address works. Every webhook path carries a random secret, and Twilio's requests are checked against its
signature.

On start, and every six hours, the agent checks each key and account with its provider and reports what it found.
Use **Re-check** in Connections after you get access to a new model.

## Settings

| Variable | |
| --- | --- |
| `OPENBOTS_CONVEX_URL` | Your Convex deployment URL (the dashboard's `VITE_CONVEX_URL`). Required. |
| `OPENBOTS_TOKEN` | The token from Connections. Required. |
| `OPENBOTS_DATA_DIR` | Where history and its key live. Default `~/.openbots`; `/data` in Docker. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` | Your AI keys. The agent lists the chat models each can use, and the dashboard offers exactly those. |
| `OPENBOTS_LOCAL_URL` | A local, OpenAI-compatible model server, e.g. `http://localhost:11434/v1` for Ollama. Its models are listed too. `OPENBOTS_LOCAL_KEY` if it needs one. |
| `OPENBOTS_MAC` | `true` to text through Messages on this Mac. On by default on macOS when no other texting is set up. |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | SMS through your Twilio account. Buy or reuse numbers from the dashboard's Numbers page; the agent does it. |
| `SENDBLUE_API_KEY_ID`, `SENDBLUE_API_SECRET` | iMessage through your Sendblue line. |
| `BLUEBUBBLES_URL`, `BLUEBUBBLES_PASSWORD` | iMessage through BlueBubbles Server on your Mac, with group chats. |
| `OPENBOTS_PUBLIC_URL` | Where Twilio, Sendblue or BlueBubbles reach the agent's web server. Required with any of them. |
| `OPENBOTS_HOST`, `OPENBOTS_PORT` | Where the agent's web server listens. Default `127.0.0.1:8787` (`0.0.0.0` in Docker). |
| `OPENBOTS_INBOUND_SECRET`, `OPENBOTS_RELAY_URL`, `OPENBOTS_RELAY_SECRET` | Your own relay (protocol below). |
| `RESEND_API_KEY`, `RESEND_FROM` | Also email you handoff alerts, at the email in Settings. |
| `OPENBOTS_DEMO` | `true` answers with sample replies when no AI key is set up. |

### Relay protocol

- **In:** `POST http://<agent>:8787/inbound` with `Authorization: Bearer $OPENBOTS_INBOUND_SECRET` and
  `{ "to": "<your number>", "from": "<their handle>", "body": "<text>", "name": "<optional>" }`. Answers `{ ok, markRead }`.
- **Out:** the agent POSTs `{ "type": "message", from, to, body }` to `OPENBOTS_RELAY_URL` (with
  `Authorization: Bearer $OPENBOTS_RELAY_SECRET` if set), and `{ "type": "typing", from, to }` just before a reply.

## Handoffs

When an agent can't or shouldn't answer (it asked for you, its model failed, the budget ran out, it's paused), the
agent texts **your phone** (Settings → General) from the agent's number, for example "Dana needs you (Pip)", and
emails you too if Resend is set up. The alert names the contact (or the group) but never quotes them. Answer them
yourself; the agent stays out of that chat for 24 hours. In a group chat it only answers when someone uses its name.

## Back up your history

Everything is in `OPENBOTS_DATA_DIR`: `openbots.db` and `key`. **Back up both.** The database is unreadable without
the key, and if you lose the key the history is gone for good. Nobody, including the OpenBots developers, can
recover it. Turn on FileVault (or your OS's disk encryption) on the machine as well: macOS keeps its own
Messages history unencrypted on disk.

## Updating, and checking what you run

The agent never updates itself. Change the pinned version (`openbots-runner@x.y.z`, or the image tag) when you
decide to. Releases are built and published by GitHub Actions from this repository, never from a laptop:

```sh
# npm: check the package's provenance and registry signatures
npm view openbots-runner@0.2.0 dist.attestations
npm audit signatures

# Docker: check the image was signed by this repository's release workflow
cosign verify ghcr.io/shidhartha-sen/openbots-runner:0.2.0 \
  --certificate-identity-regexp 'https://github.com/shidhartha-sen/opendots/.github/workflows/runner-release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/shidhartha-sen/openbots-runner:0.2.0 --owner shidhartha-sen
```

Or build it yourself from a commit you've read:

```sh
git clone https://github.com/shidhartha-sen/opendots && cd opendots
npm ci && npm run runner:build
node runner/dist/main.mjs
```

To release a new version, bump `runner/package.json` and push a matching tag (`runner-v0.2.1`). The workflow needs
an `NPM_TOKEN` secret.
