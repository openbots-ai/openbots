# OpenBots agent

The agent answers the iMessages your OpenBots agents receive, using the model you choose. You run it on a
machine you control: the Mac signed in to iMessage, a VM, a server at home.

**Messages never leave it.** Contacts, conversations and message text are kept in a local SQLite file, encrypted
with a key that sits next to it. The OpenBots dashboard and its Convex backend only ever see your settings
(agents, models, knowledge, numbers) and anonymous daily counts. Model keys stay here too.

The one exception is the model you pick: a cloud model (OpenAI, Anthropic, Google, xAI) receives each
conversation so it can write the reply. Choose **Local model** if nothing should leave your machines.

## Start it

1. In the dashboard, open **Settings → Agent**, name the machine and click **Add**. Copy the token. It's shown
   once and never stored, because Convex keeps only its hash.
2. Run the agent with that token, using one of the two setups below.

### On the Mac signed in to iMessage

```sh
OPENBOTS_CONVEX_URL=https://<your-deployment>.convex.cloud \
OPENBOTS_TOKEN=obr_... \
OPENAI_API_KEY=sk-... \
npx openbots-runner@0.1.0
```

Give the app that runs it (Terminal, iTerm, or your launchd job's binary) **Full Disk Access** in System Settings →
Privacy & Security, so it can read `~/Library/Messages`. Allow it to control **Messages** when macOS asks. It answers
one-to-one chats only, and starts from the newest message, so old history isn't answered.

To keep it running, wrap it in a `launchd` agent or run it under `pm2`.

### Anywhere else (Docker)

iMessage itself needs a Mac, so a relay on your Mac forwards texts to the agent and sends its replies:

```sh
docker run -d --name openbots -v openbots:/data -p 8787:8787 \
  -e OPENBOTS_CONVEX_URL=https://<your-deployment>.convex.cloud \
  -e OPENBOTS_TOKEN=obr_... \
  -e OPENBOTS_INBOUND_SECRET=<a long random secret> \
  -e OPENBOTS_RELAY_URL=https://<your-mac-relay>/send \
  -e OPENAI_API_KEY=sk-... \
  ghcr.io/shidhartha-sen/openbots-runner:0.1.0
```

The relay protocol:

- **In:** `POST http://<agent>:8787/inbound` with `Authorization: Bearer $OPENBOTS_INBOUND_SECRET` and
  `{ "to": "<your number>", "from": "<their handle>", "body": "<text>", "name": "<optional>" }`. The answer is
  `{ ok, markRead }`; send a read receipt when `markRead` is true.
- **Out:** the agent POSTs `{ "type": "message", from, to, body }` to `OPENBOTS_RELAY_URL` (with
  `Authorization: Bearer $OPENBOTS_RELAY_SECRET` if set). Just before a reply it also sends `{ "type": "typing", from, to }`.

Both machines are yours, but text crosses the network between them. Keep that link on a private network
(Tailscale, WireGuard) or behind HTTPS.

## Settings

| Variable | |
| --- | --- |
| `OPENBOTS_CONVEX_URL` | Your Convex deployment URL (the dashboard's `VITE_CONVEX_URL`). Required. |
| `OPENBOTS_TOKEN` | The token from Settings → Agent. Required. |
| `OPENBOTS_TRANSPORT` | `mac` (default on macOS) or `relay` (default elsewhere). |
| `OPENBOTS_DATA_DIR` | Where history and its key live. Default `~/.openbots`; `/data` in Docker. |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` | Keys for the cloud models your agents use. |
| `OPENBOTS_LOCAL_URL`, `OPENBOTS_LOCAL_MODEL` | The **Local model** option: any OpenAI-compatible server, e.g. `http://localhost:11434/v1` and `llama3.1` for Ollama. `OPENBOTS_LOCAL_KEY` if it needs one. |
| `OPENBOTS_INBOUND_SECRET` | Relay only: what your relay sends as a bearer token (16+ characters). |
| `OPENBOTS_RELAY_URL`, `OPENBOTS_RELAY_SECRET` | Relay only: where replies go, and the bearer token sent with them. |
| `OPENBOTS_RELAY_HOST`, `OPENBOTS_RELAY_PORT` | Relay only: where the agent listens. Default `127.0.0.1:8787` (`0.0.0.0` in Docker). |
| `OPENBOTS_DEMO` | `true` answers with sample replies when a model isn't set up. |

## Handoffs

When an agent can't or shouldn't answer (it asked for you, its model failed, the budget ran out, it's paused),
the agent texts **your phone** (Settings → General) from the agent's number, for example "Dana needs you (Pip)". The
alert names the contact but never quotes them. Answer them in Messages; the agent stays out of that chat for 24 hours.

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
npm view openbots-runner@0.1.0 dist.attestations
npm audit signatures

# Docker: check the image was signed by this repository's release workflow
cosign verify ghcr.io/shidhartha-sen/openbots-runner:0.1.0 \
  --certificate-identity-regexp 'https://github.com/shidhartha-sen/opendots/.github/workflows/runner-release.yml@.*' \
  --certificate-oidc-issuer https://token.actions.githubusercontent.com
gh attestation verify oci://ghcr.io/shidhartha-sen/openbots-runner:0.1.0 --owner shidhartha-sen
```

Or build it yourself from a commit you've read:

```sh
git clone https://github.com/shidhartha-sen/opendots && cd opendots
npm ci && npm run runner:build
node runner/dist/main.mjs
```

To release a new version, bump `runner/package.json` and push a matching tag (`runner-v0.1.1`). The workflow needs
an `NPM_TOKEN` secret.
