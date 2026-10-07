# OpenDots

Landing site for OpenDots: a team of AI agents you text in iMessage.

Built with Vite, React, Tailwind CSS v4, Motion and Lenis.

## Develop

```sh
npm install
npm run dev
```

## Deploy

The site is hosted on Vercel and connected to this repo. Every push to `main`
deploys to production; pushes to other branches get preview deployments.

`vercel.json` rewrites every path to `index.html` so routes like `/privacy`
and `/contact` resolve on direct load.

## Pages

| Path | Page |
| --- | --- |
| `/` | Landing page (`/about` redirects here) |
| `/privacy`, `/terms` | Legal pages |
| `/contact` | Contact form |
| `/pricing`, `/changelog`, `/docs`, `/careers`, `/security` | Coming soon |
| `/crm` | Operator dashboard (unlisted, noindex; see below) |

## CRM (`/crm`)

An unlisted dashboard for building and managing agents. Only the exact path `/crm` loads it,
nothing links to it, and it is served with `noindex`. Views switch via `?view=` so the path
never changes. Data lives in [Convex](https://convex.dev) (`convex/`).

```sh
npx convex dev          # first run logs in, creates the deployment and writes .env.local
npx convex deploy       # push functions to production
```

Set `VITE_CONVEX_URL` (production deployment URL) in Vercel. An empty deployment seeds itself
with the mascot team and sample data on first visit.
