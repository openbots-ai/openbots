# Contributing to OpenBots

Thanks for helping. Bug reports, fixes, docs and features are all welcome. For anything large, open an issue first
so we can agree on the approach before you spend time on it.

Security problems: please don't open a public issue. Report them privately as described in [SECURITY.md](SECURITY.md).

## Set up

You need Node.js 22.13 or newer and a free [Convex](https://convex.dev) account.

```sh
npm ci              # install exactly what package-lock.json pins
npx convex dev      # log in, create your own dev deployment, write .env.local, and watch convex/
npm run setup       # in another terminal: generate the deployment's ENCRYPTION_KEY and sign-in keys
npm run dev         # the site and dashboard on http://localhost:5173 (dashboard at /dashboard)
npm run runner      # build and start the engine; put OPENBOTS_CONVEX_URL and OPENBOTS_TOKEN in runner/.env
```

Sign up in the dashboard, add a computer in **Connections** to get an engine token, and paste it into `runner/.env`.
`OPENBOTS_DEMO=true` makes the engine answer with sample replies when you have no AI key. `.env.example` lists every
variable, and [runner/README.md](runner/README.md) explains the engine's settings.

## Where things are

- `src/crm/`: the dashboard. `src/pages/` and `src/components/landing/`: the landing site.
- `convex/`: the backend (schema, queries, mutations, actions, HTTP routes). Shared code the engine also uses lives in
  `convex/lib/`.
- `runner/`: the engine, bundled by `runner/build.mjs` into `runner/dist/main.mjs` (npm package) and
  `public/engine/openbots-engine.mjs` (the file the site serves).

### Convex code

Before you change anything in `convex/`, read [`convex/_generated/ai/guidelines.md`](convex/_generated/ai/guidelines.md).
It covers the function syntax, validators, indexes and limits this project follows, and it overrides older Convex
habits. Every public function must check the signed-in user's workspace (or the engine's token).

### Privacy rules

These are part of the design (see [SECURITY.md](SECURITY.md)), so changes that break them won't be merged:

- Message text, contact details and conversations stay on the engine. Never send them to Convex.
- The engine never logs message text.
- Saved keys are never returned to the dashboard.

## Checks

CI runs these on every pull request; please run them before you push:

```sh
npm run lint
npx tsc -b
npx tsc -p convex --noEmit
npm test
npm run build
```

Add or update tests for what you change: `*.test.ts` next to the code, run by Vitest. Convex functions are tested
with `convex-test`.

## Branches and pull requests

- Branch from `main` with a short prefixed name: `fix/twilio-signature`, `feat/voice-notes`, `docs/engine-setup`,
  `chore/deps`.
- Keep a pull request to one change. Describe what it does and why, how you tested it, and include screenshots for
  dashboard changes.
- Commit messages are short and say what changed, optionally with the area first: `Engine: retry failed reminders`.
- Add a line under **Unreleased** in [CHANGELOG.md](CHANGELOG.md) for anything a user would notice.
- Engine releases are cut by maintainers: bump `runner/package.json` and push a matching `runner-vX.Y.Z` tag, which
  runs `.github/workflows/runner-release.yml`.

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE), and to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
