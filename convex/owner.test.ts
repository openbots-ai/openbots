// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { convexTest } from 'convex-test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from './_generated/api'
import type { Id } from './_generated/dataModel'
import schema from './schema'
import { CODE_TTL_MS, codeHash, HOUR_MS, ONLINE_MS } from './lib/owner'
import { hashToken, newToken } from './lib/tokens'
import { dayKey } from './lib/usage'

const modules = import.meta.glob('./**/*.ts')
const PHONE = '+1 (650) 555-0000'

async function user(base: ReturnType<typeof convexTest>, name = 'Sam') {
    const userId = await base.run((ctx) => ctx.db.insert('users', {}))
    const t = base.withIdentity({ subject: `${userId}|session`, tokenIdentifier: `test|${userId}` })
    await t.mutation(api.workspace.create, { name: `${name}'s agents`, ownerName: name, timezone: 'UTC' })
    return t
}

// A workspace with an agent on a Mac number and an engine online that answers on Messages
async function setup({ channels = ['mac'] as ('mac' | 'twilio')[], number = true } = {}) {
    const base = convexTest(schema, modules)
    const owner = await user(base)
    const agentId = await owner.mutation(api.agents.create, { name: 'Pip', role: 'Assistant', hue: 10, prompt: 'Be brief.', status: 'live' })
    if (number) await owner.mutation(api.numbers.add, { handle: '+1 (415) 555-0101', channel: 'mac', agentId })
    const token = newToken()
    await owner.mutation(api.runners.create, { name: 'Mac mini', tokenHash: await hashToken(token) })
    const beat = () => base.mutation(api.runner.heartbeat, { token, version: '0.2.0', services: [], models: [], channels, lines: [], demo: false })
    await beat()
    // What the engine does with an ownerCode request: claims it, texts the code, reports its hash
    const deliver = async (code: string) => {
        const [task] = (await base.query(api.runner.tasks, { token })).filter((t) => t.request.kind === 'ownerCode')
        expect(await base.mutation(api.runner.claimTask, { token, id: task._id })).toBe(true)
        await base.mutation(api.runner.finishTask, { token, id: task._id, result: { codeHash: await codeHash(task._id, code) } })
        return task
    }
    const engineOwner = async () => (await base.query(api.runner.config, { token }))!.workspace.ownerHandle
    return { base, owner, agentId, token, beat, deliver, engineOwner }
}

afterEach(() => {
    vi.useRealTimers()
})

describe('verifying your phone', () => {
    it('texts a code through your engine, keeps only its hash, and verifies the phone once you type it', async () => {
        const { base, owner, deliver, engineOwner } = await setup()
        const taskId = await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        expect(taskId).toBeTruthy()
        expect((await owner.query(api.workspace.ownerPhone, {})).code).toMatchObject({ status: 'sending', attemptsLeft: 5 })
        // Saved but not yet yours: the engine isn't given it
        expect(await engineOwner()).toBeUndefined()

        const task = await deliver('482913')
        expect(task.request).toEqual({ kind: 'ownerCode', to: PHONE })
        // The dashboard sees where it went, never the hash
        expect(await owner.query(api.tasks.get, { id: taskId! })).toEqual({ status: 'done', result: { sentTo: PHONE } })
        const rows = await base.run((ctx) => ctx.db.query('ownerCodes').collect())
        expect(rows).toHaveLength(1)
        expect(rows[0].codeHash).toMatch(/^[0-9a-f]{64}$/)
        expect(JSON.stringify(rows)).not.toContain('482913')
        expect(JSON.stringify(await owner.query(api.workspace.ownerPhone, {}))).not.toContain(rows[0].codeHash!)

        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '000000' })).toEqual({ ok: false, error: 'That’s not the code. 4 tries left.' })
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '482 913' })).toEqual({ ok: true })
        expect(await owner.query(api.workspace.ownerPhone, {})).toMatchObject({ handle: PHONE, verified: true, code: null })
        expect((await owner.query(api.workspace.get, {}))?.ownerVerified).toBe(true)
        expect(await engineOwner()).toBe(PHONE)
        // A used code can't be used again
        await owner.mutation(api.workspace.removeOwnerHandle, {})
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '482913' })).toMatchObject({ ok: false })
        expect(await engineOwner()).toBeUndefined()
    })

    it('expires a code after 10 minutes', async () => {
        vi.useFakeTimers()
        const { owner, deliver } = await setup()
        await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        await deliver('111222')
        vi.setSystemTime(Date.now() + CODE_TTL_MS + 1)
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '111222' })).toEqual({ ok: false, error: 'That code has expired. Send a new one.' })
        expect((await owner.query(api.workspace.ownerPhone, {})).verified).toBe(false)
    })

    it('allows 5 tries per code, then not even the right one', async () => {
        const { owner, deliver } = await setup()
        await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        // Not sent yet
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '333444' })).toMatchObject({ ok: false, error: expect.stringMatching(/hasn’t been sent yet/) })
        await deliver('333444')
        for (let i = 0; i < 4; i++) expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '999999' })).toMatchObject({ ok: false })
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '999999' })).toEqual({ ok: false, error: 'That’s not the code, and that was the last try. Send a new code.' })
        expect((await owner.query(api.workspace.ownerPhone, {})).code?.attemptsLeft).toBe(0)
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '333444' })).toEqual({ ok: false, error: 'Too many wrong tries. Send a new code.' })
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '12345' })).toEqual({ ok: false, error: 'Enter the 6 digits from the text' })
    })

    it('sends at most 3 codes an hour', async () => {
        vi.useFakeTimers()
        const { owner, beat } = await setup()
        for (let i = 0; i < 3; i++) await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        await expect(owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })).rejects.toThrow(/3 codes in the last hour. Try again in 60 minutes/)
        // Another number doesn't get around it
        await expect(owner.mutation(api.workspace.sendOwnerCode, { handle: '+1 650 555 0001' })).rejects.toThrow(/3 codes in the last hour/)
        vi.setSystemTime(Date.now() + HOUR_MS + 1)
        await beat()
        expect(await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })).toBeTruthy()
    })

    it('unverifies your phone when you change it, and an old code can’t verify the new number', async () => {
        const { owner, deliver, engineOwner } = await setup()
        await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        await deliver('555666')
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '555666' })).toEqual({ ok: true })
        // The same number, written another way, stays verified without a new code
        expect(await owner.mutation(api.workspace.sendOwnerCode, { handle: '650-555-0000' })).toBeNull()
        expect((await owner.query(api.workspace.ownerPhone, {})).verified).toBe(true)

        await owner.mutation(api.workspace.sendOwnerCode, { handle: '+1 650 555 0001' })
        expect(await owner.query(api.workspace.ownerPhone, {})).toMatchObject({ handle: '+1 650 555 0001', verified: false })
        expect(await engineOwner()).toBeUndefined()
        // Back to the first number: still needs a new code
        await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        expect((await owner.query(api.workspace.ownerPhone, {})).verified).toBe(false)
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '555666' })).toMatchObject({ ok: false })
    })

    it('never lets Settings set your phone without a code', async () => {
        const { base, owner, engineOwner } = await setup()
        const ws = (await owner.query(api.workspace.get, {}))!
        await expect(owner.mutation(api.workspace.update, { name: ws.name, ownerName: ws.ownerName, ownerHandle: PHONE } as never)).rejects.toThrow()
        // A workspace from before verification existed keeps its phone, unverified
        await base.run((ctx) => ctx.db.patch('workspace', ws._id, { ownerHandle: PHONE }))
        expect(await owner.query(api.workspace.ownerPhone, {})).toMatchObject({ handle: PHONE, verified: false })
        expect(await engineOwner()).toBeUndefined()
        // Nor can a request for the engine text a code
        await expect(owner.mutation(api.tasks.request, { request: { kind: 'ownerCode', to: PHONE } })).rejects.toThrow(/Your phone/)
    })

    it('needs an engine online that can text the number', async () => {
        vi.useFakeTimers()
        const none = await setup({ number: false })
        await expect(none.owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })).rejects.toThrow(/Set up texting/)
        const { owner, beat } = await setup()
        await expect(owner.mutation(api.workspace.sendOwnerCode, { handle: '+1 (415) 555-0101' })).rejects.toThrow(/one of your agents’ numbers/)
        await expect(owner.mutation(api.workspace.sendOwnerCode, { handle: 'hello' })).rejects.toThrow(/phone number/)
        vi.setSystemTime(Date.now() + ONLINE_MS + 1)
        await expect(owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })).rejects.toThrow(/engine is offline/)
        await beat()
        expect(await owner.mutation(api.workspace.sendOwnerCode, { handle: 'sam@icloud.com' })).toBeTruthy()

        const base = convexTest(schema, modules)
        const fresh = await user(base)
        await expect(fresh.mutation(api.workspace.sendOwnerCode, { handle: PHONE })).rejects.toThrow(/Add your engine/)
    })

    it('sends to an Apple ID email only over iMessage from a Mac', async () => {
        const { base, owner, token } = await setup({ channels: ['twilio'], number: false })
        const workspaceId = (await owner.query(api.workspace.get, {}))!._id
        await base.run((ctx) => ctx.db.insert('numbers', { workspaceId, handle: '+16395550100', key: '16395550100', kind: 'phone', channel: 'twilio' }))
        await expect(owner.mutation(api.workspace.sendOwnerCode, { handle: 'sam@icloud.com' })).rejects.toThrow(/Apple ID email/)
        expect(await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })).toBeTruthy()
        // A code's hash can only answer a code request
        const other = await base.run((ctx) => ctx.db.insert('tasks', { workspaceId, request: { kind: 'twilioOwned' }, status: 'pending' }))
        await base.mutation(api.runner.claimTask, { token, id: other })
        await base.mutation(api.runner.finishTask, { token, id: other, result: { codeHash: 'a'.repeat(64) } })
        expect(await owner.query(api.tasks.get, { id: other })).toMatchObject({ status: 'failed' })
    })

    it('keeps each workspace’s phone and codes to itself', async () => {
        const { base, owner, deliver, token } = await setup()
        await owner.mutation(api.workspace.sendOwnerCode, { handle: PHONE })
        await deliver('777888')
        const other = await user(base, 'Ali')
        expect(await other.mutation(api.workspace.confirmOwnerCode, { code: '777888' })).toEqual({ ok: false, error: 'Send a code to your phone first' })
        expect(await other.query(api.workspace.ownerPhone, {})).toMatchObject({ handle: null, verified: false, code: null })
        expect(await owner.mutation(api.workspace.confirmOwnerCode, { code: '777888' })).toEqual({ ok: true })
        expect((await other.query(api.workspace.ownerPhone, {})).verified).toBe(false)
        // Another workspace's engine can't answer this workspace's request
        const otherToken = newToken()
        await other.mutation(api.runners.create, { name: 'PC', tokenHash: await hashToken(otherToken) })
        await owner.mutation(api.workspace.sendOwnerCode, { handle: '+1 650 555 0001' })
        const [task] = await base.query(api.runner.tasks, { token })
        expect(await base.query(api.runner.tasks, { token: otherToken })).toEqual([])
        expect(await base.mutation(api.runner.claimTask, { token: otherToken, id: task._id })).toBe(false)
    })
})

describe('allowed people', () => {
    it('adds, lists and removes people, matching numbers however they are written', async () => {
        const { base, owner, token } = await setup()
        const lee = await owner.mutation(api.allowed.add, { name: ' Lee ', handle: '(212) 555-0222' })
        await owner.mutation(api.allowed.add, { name: 'Dana', handle: 'Dana@iCloud.com' })
        expect(await owner.query(api.allowed.list, {})).toEqual([
            { _id: expect.anything(), name: 'Dana', handle: 'Dana@iCloud.com' },
            { _id: lee, name: 'Lee', handle: '(212) 555-0222' },
        ])
        await expect(owner.mutation(api.allowed.add, { name: 'Lee again', handle: '+1 212 555 0222' })).rejects.toThrow(/Lee already has that number/)
        await expect(owner.mutation(api.allowed.add, { name: 'D', handle: 'dana@icloud.com' })).rejects.toThrow(/already/)
        await expect(owner.mutation(api.allowed.add, { name: 'X', handle: '12' })).rejects.toThrow(/phone number/)
        await expect(owner.mutation(api.allowed.add, { name: ' ', handle: '+1 212 555 0333' })).rejects.toThrow(/name/)
        await expect(owner.mutation(api.allowed.add, { name: 'Pip', handle: '4155550101' })).rejects.toThrow(/agents’ numbers/)
        // The engine gets the list
        expect((await base.query(api.runner.config, { token }))!.allowed).toEqual(expect.arrayContaining([{ name: 'Lee', handle: '(212) 555-0222' }]))
        await owner.mutation(api.allowed.remove, { id: lee })
        expect((await base.query(api.runner.config, { token }))!.allowed).toEqual([{ name: 'Dana', handle: 'Dana@iCloud.com' }])
    })

    it('keeps each workspace’s list to itself', async () => {
        const { base, owner } = await setup()
        const id = await owner.mutation(api.allowed.add, { name: 'Lee', handle: '(212) 555-0222' })
        const other = await user(base, 'Ali')
        expect(await other.query(api.allowed.list, {})).toEqual([])
        await expect(other.mutation(api.allowed.remove, { id })).rejects.toThrow(/Not found/)
        // The same person can be on both lists
        await other.mutation(api.allowed.add, { name: 'Lee', handle: '+12125550222' })
        expect(await owner.query(api.allowed.list, {})).toHaveLength(1)
        await expect(base.query(api.allowed.list, {})).rejects.toThrow(/Sign in/)
    })

    it('shows how many texts were ignored today and the last 10 numbers, never their texts', async () => {
        const { base, owner, agentId, token } = await setup()
        const today = dayKey(Date.now())
        await base.mutation(api.runner.record, { token, agentId, activity: { ignored: 7 } })
        await base.mutation(api.runner.record, { token, agentId, activity: { ignored: 2, messagesIn: 1 } })
        const senders = Array.from({ length: 10 }, (_, i) => `+1 917 555 01${String(i).padStart(2, '0')}`)
        await base.mutation(api.runner.ignored, { token, senders })
        await base.mutation(api.runner.ignored, { token, senders: ['+1 917 555 0200', '(917) 555-0100'] })
        const seen = await owner.query(api.allowed.ignored, { today })
        expect(seen.today).toBe(9)
        expect(seen.recent).toHaveLength(10)
        expect(seen.recent.map((r) => r.handle)).toContain('+1 917 555 0200')
        expect(seen.recent.map((r) => r.handle)).not.toContain('+1 917 555 0101')
        expect(await owner.query(api.usage.activity, { since: today })).toMatchObject({ messagesIn: 1 })

        // Allowing one takes it off the list; dismissing just forgets it
        await owner.mutation(api.allowed.add, { name: '+1 917 555 0200', handle: '+1 917 555 0200' })
        const after = await owner.query(api.allowed.ignored, { today })
        expect(after.recent.map((r) => r.handle)).not.toContain('+1 917 555 0200')
        await owner.mutation(api.allowed.dismiss, { id: after.recent[0]._id })
        expect((await owner.query(api.allowed.ignored, { today })).recent).toHaveLength(after.recent.length - 1)
        // A number already allowed isn't kept as ignored
        await base.mutation(api.runner.ignored, { token, senders: ['+19175550200'] })
        expect((await owner.query(api.allowed.ignored, { today })).recent.map((r) => r.handle)).not.toContain('+19175550200')
        await expect(base.mutation(api.runner.ignored, { token, senders: Array(11).fill('+19175550300') })).rejects.toThrow(/Too many/)

        const other = await user(base, 'Ali')
        expect(await other.query(api.allowed.ignored, { today })).toEqual({ today: 0, recent: [] })
        await expect(other.mutation(api.allowed.dismiss, { id: after.recent[1]._id as Id<'ignoredSenders'> })).rejects.toThrow(/Not found/)
    })
})
