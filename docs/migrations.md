# Migrating an older deployment

Only relevant if your Convex deployment holds data from before sign-in existed, or from before messages, contacts
and credentials moved onto the engine. A deployment created from the current code needs none of this.

## Data from before sign-in

The schema scopes everything to a signed-in user's workspace. A deployment holding data from before that won't accept
the new schema. Export what you want to keep (`npx convex export`) and clear its tables before deploying.

## Conversations or accounts stored in Convex

Older versions kept message history, contacts, notifications and connected-account credentials in Convex. Today they
live only on the engine. To delete what's left in Convex (it runs in batches until nothing remains):

```sh
npx convex run migrations:purgeLegacy
```

## Rows that don't match the schema

If a push fails because older rows don't match (a workspace owned through `ownerId`, numbers without a `channel`):

1. Make those fields optional in `convex/schema.ts` and push.
2. Run `npx convex run migrations:upgradeLegacy`. It moves `ownerId` to `userId`, drops retired workspace settings and
   gives numbers without a channel the `relay` channel.
3. Put the schema back and push again.

Add `--prod` to `npx convex run` to run a migration on the production deployment. Both are in
[`convex/migrations.ts`](../convex/migrations.ts).
