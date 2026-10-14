// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'
import { hashToken, newToken } from './lib/tokens'

const modules = import.meta.glob('./**/*.ts')

async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const t = base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}
const computer = async (t: Awaited<ReturnType<typeof user>>, name: string) => t.mutation(api.runners.create, { name, tokenHash: await hashToken(newToken()) })
const agent = (t: Awaited<ReturnType<typeof user>>) => t.mutation(api.agents.create, { name: 'Pip', role: 'Assistant', hue: 10, prompt: 'Be brief.', greeting: 'hi', status: 'live' })

describe('choosing the computer agents use', () => {
    it('saves the workspace’s computer and an agent’s own, and clears them', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const laptop = await computer(owner, 'Laptop')
        const vm = await computer(owner, 'VM')
        const pip = await agent(owner)

        await owner.mutation(api.workspace.setComputer, { computerId: laptop })
        await owner.mutation(api.agents.setComputer, { id: pip, computerId: vm })
        expect((await owner.query(api.workspace.get, {}))?.computerId).toBe(laptop)
        expect((await owner.query(api.agents.get, { id: pip }))?.computerId).toBe(vm)

        await owner.mutation(api.agents.setComputer, { id: pip })
        expect((await owner.query(api.agents.get, { id: pip }))?.computerId).toBeUndefined()
    })

    it('refuses your own Linux computer for computer use', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const token = newToken()
        const fedora = await owner.mutation(api.runners.create, { name: 'Fedora', tokenHash: await hashToken(token) })
        await base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [], models: [], channels: [], lines: [], demo: false, os: 'linux' })
        const pip = await agent(owner)
        await expect(owner.mutation(api.workspace.setComputer, { computerId: fedora })).rejects.toThrow(/isn’t supported on Linux/)
        await expect(owner.mutation(api.agents.setComputer, { id: pip, computerId: fedora })).rejects.toThrow(/isn’t supported on Linux/)
    })

    it("refuses another account's computer or agent", async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const other = await user(base, 'Ali')
        const theirs = await computer(other, 'Their VM')
        const pip = await agent(owner)
        await expect(owner.mutation(api.workspace.setComputer, { computerId: theirs })).rejects.toThrow(/Not found/)
        await expect(owner.mutation(api.agents.setComputer, { id: pip, computerId: theirs })).rejects.toThrow(/Not found/)
        await expect(other.mutation(api.agents.setComputer, { id: pip })).rejects.toThrow(/Not found/)
    })

    it('keeps an agent’s computer when the agent is edited and saved', async () => {
        const base = convexTest(schema, modules)
        const owner = await user(base)
        const vm = await computer(owner, 'VM')
        const pip = await agent(owner)
        await owner.mutation(api.agents.setComputer, { id: pip, computerId: vm })
        await owner.mutation(api.agents.update, { id: pip, name: 'Pip 2', role: 'Assistant', hue: 10, prompt: 'Be brief.', greeting: 'hi', status: 'live' })
        expect((await owner.query(api.agents.get, { id: pip }))?.computerId).toBe(vm)
    })
})
