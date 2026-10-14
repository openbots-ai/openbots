// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const morning = { id: 'a', days: [1, 2, 3, 4, 5], time: '08:00', what: 'Weather in Saskatoon today', on: true }

async function setup() {
    const base = convexTest(schema, modules)
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const owner = base.withIdentity({ subject: `${userId}|s`, tokenIdentifier: `t|${userId}` })
    await owner.mutation(api.workspace.create, { name: 'W', ownerName: 'Sam', timezone: 'America/Regina' })
    const id = await owner.mutation(api.agents.create, { name: 'Iris', role: 'Assistant', hue: 1, prompt: '', greeting: 'hi', status: 'live' })
    return { base, owner, id }
}

describe('check-ins', () => {
    it('saves an agent’s check-ins and keeps them when the agent is edited', async () => {
        const { owner, id } = await setup()
        await owner.mutation(api.agents.setCheckIns, { id, checkIns: [morning] })
        await owner.mutation(api.agents.update, { id, name: 'Iris 2', role: 'Assistant', hue: 1, prompt: '', greeting: 'hi', status: 'live' })
        expect((await owner.query(api.agents.get, { id }))?.checkIns).toEqual([morning])
    })

    it('refuses bad times, days, empty text, too many, and other people', async () => {
        const { base, owner, id } = await setup()
        const set = (checkIns: (typeof morning)[]) => owner.mutation(api.agents.setCheckIns, { id, checkIns })
        await expect(set([{ ...morning, time: '25:00' }])).rejects.toThrow(/HH:MM/)
        await expect(set([{ ...morning, days: [] }])).rejects.toThrow(/day/)
        await expect(set([{ ...morning, days: [7] }])).rejects.toThrow(/day/)
        await expect(set([{ ...morning, what: ' ' }])).rejects.toThrow(/what to send/)
        await expect(set(Array.from({ length: 6 }, (_, i) => ({ ...morning, id: String(i) })))).rejects.toThrow(/5 check-ins/)
        await expect(base.mutation(api.agents.setCheckIns, { id, checkIns: [] })).rejects.toThrow(/Sign in/)
    })
})
