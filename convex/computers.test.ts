// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { describe, expect, it } from 'vitest'
import { api } from './_generated/api'
import { hashToken, newToken } from './lib/tokens'
import { resolveModels, slotOf } from './lib/models'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

async function setup() {
    const base = convexTest(schema, modules)
    const owner = base.withIdentity({ subject: 'user', tokenIdentifier: 'test|user' })
    await owner.mutation(api.workspace.create, { name: 'W', ownerName: 'Sam', timezone: 'America/Regina' })
    const token = newToken()
    const id = await owner.mutation(api.runners.create, { name: 'PC', tokenHash: await hashToken(token) })
    const setOs = (os: 'windows' | 'mac' | 'linux') => base.run((ctx) => ctx.db.patch('runners', id, { os }))
    return { base, owner, id, token, setOs }
}

describe('turning computer use on for a computer', () => {
    it('turns it on for your own Windows or Mac computer, and the engine sees it', async () => {
        const { base, owner, id, token, setOs } = await setup()
        await setOs('windows')
        expect((await base.query(api.runner.config, { token }))?.computerUse).toBe(false)
        await owner.mutation(api.runners.setComputerUse, { id, on: true })
        expect((await base.query(api.runner.config, { token }))?.computerUse).toBe(true)
        expect((await owner.query(api.runners.list, {}))[0].computerUse).toBe(true)
        await owner.mutation(api.runners.setComputerUse, { id, on: false })
        expect((await base.query(api.runner.config, { token }))?.computerUse).toBe(false)
    })

    it('refuses Linux, computers that haven’t reported yet, and other people', async () => {
        const { base, owner, id, setOs } = await setup()
        await expect(owner.mutation(api.runners.setComputerUse, { id, on: true })).rejects.toThrow(/Windows or Mac/)
        await setOs('linux')
        await expect(owner.mutation(api.runners.setComputerUse, { id, on: true })).rejects.toThrow(/Windows or Mac/)
        await owner.mutation(api.runners.setComputerUse, { id, on: false })
        await expect(base.mutation(api.runners.setComputerUse, { id, on: true })).rejects.toThrow(/Sign in/)
    })
})

describe('the Computer use model', () => {
    it('offers Claude Sonnet 5.5 by default and Opus 5.5', () => {
        const slot = slotOf('computer')!
        expect(slot.runs).toBe(true)
        expect(slot.options.map((o) => o.api)).toEqual(['claude-sonnet-5-5', 'claude-opus-5-5'])
        expect(resolveModels(undefined, undefined, undefined, []).computer.option.api).toBe('claude-sonnet-5-5')
        expect(resolveModels({ computer: 'claude-opus-5.5-computer-use' }, undefined, undefined, []).computer.option.api).toBe('claude-opus-5-5')
        // An old choice that no longer exists falls back to the default
        expect(resolveModels({ computer: 'gpt-5.1-computer-use' }, undefined, undefined, []).computer.option.api).toBe('claude-sonnet-5-5')
    })
})

describe('agents saved with an old Computer use choice', () => {
    it('can still be edited, but a new bad pick is refused', async () => {
        const { base, owner } = await setup()
        const id = await owner.mutation(api.agents.create, { name: 'Iris', role: 'Assistant', hue: 1, prompt: '', greeting: 'hi', status: 'live' })
        await base.run((ctx) => ctx.db.patch('agents', id, { models: { computer: 'gpt-5.1-computer-use' } }))
        const fields = { id, name: 'Iris 2', role: 'Assistant', hue: 1, prompt: '', greeting: 'hi', status: 'live' as const }
        await owner.mutation(api.agents.update, { ...fields, models: { computer: 'gpt-5.1-computer-use' } })
        await expect(owner.mutation(api.agents.update, { ...fields, models: { computer: 'gemini-2.5-computer-use' } })).rejects.toThrow(/can't be used/)
        await owner.mutation(api.agents.update, { ...fields, models: { computer: 'claude-opus-5.5-computer-use' } })
    })
})
