// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { dayKey } from './lib/usage'

const modules = import.meta.glob('./**/*.ts')
const visit = (t: ReturnType<typeof convexTest>, body: unknown) =>
    t.fetch('/visit', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: typeof body === 'string' ? body : JSON.stringify(body) })

afterEach(() => {
    delete process.env.SITE_OWNER
})

describe('site visits', () => {
    it('counts views and new visitors per page per day', async () => {
        process.env.SITE_OWNER = 'user_owner'
        const t = convexTest(schema, modules)
        expect((await visit(t, { path: '/', newVisitor: true })).status).toBe(204)
        await visit(t, { path: '/', newVisitor: false })
        await visit(t, { path: '/pricing', newVisitor: true })

        const owner = t.withIdentity({ subject: 'user_owner', tokenIdentifier: 'clerk|user_owner' })
        const rows = await owner.query(api.siteVisits.summary, { since: '2000-01-01' })
        const today = dayKey(Date.now())
        expect(rows).toEqual(
            expect.arrayContaining([
                { day: today, path: '/', views: 2, visitors: 1 },
                { day: today, path: '/pricing', views: 1, visitors: 1 },
            ]),
        )
        expect(rows).toHaveLength(2)
    })

    it('ignores the dashboard, made-up paths and malformed bodies', async () => {
        const t = convexTest(schema, modules)
        for (const body of [{ path: '/dashboard', newVisitor: true }, { path: '/anything', newVisitor: true }, { path: '/' }, 'not json', 'null', 'x'.repeat(600)]) {
            expect((await visit(t, body)).status).toBeGreaterThanOrEqual(400)
        }
        process.env.SITE_OWNER = 'user_owner'
        const owner = t.withIdentity({ subject: 'user_owner', tokenIdentifier: 'clerk|user_owner' })
        expect(await owner.query(api.siteVisits.summary, { since: '2000-01-01' })).toEqual([])
    })

    it('shows the counts only to SITE_OWNER', async () => {
        const t = convexTest(schema, modules)
        await visit(t, { path: '/', newVisitor: true })
        const since = { since: '2000-01-01' }
        const someone = t.withIdentity({ subject: 'user_other', tokenIdentifier: 'clerk|user_other', email: 'other@example.com', emailVerified: true })

        // Unset: nobody, not even a signed-in user
        expect(await someone.query(api.siteVisits.summary, since)).toBeNull()

        process.env.SITE_OWNER = 'user_owner, Owner@Example.com'
        expect(await t.query(api.siteVisits.summary, since)).toBeNull()
        expect(await someone.query(api.siteVisits.summary, since)).toBeNull()
        expect(await t.withIdentity({ subject: 'user_owner', tokenIdentifier: 'clerk|user_owner' }).query(api.siteVisits.summary, since)).toHaveLength(1)
        expect(await t.withIdentity({ subject: 'user_x', tokenIdentifier: 'clerk|user_x', email: 'owner@example.com', emailVerified: true }).query(api.siteVisits.summary, since)).toHaveLength(1)
        // An email that isn't verified doesn't count
        expect(await t.withIdentity({ subject: 'user_y', tokenIdentifier: 'clerk|user_y', email: 'owner@example.com', emailVerified: false }).query(api.siteVisits.summary, since)).toBeNull()
    })
})
