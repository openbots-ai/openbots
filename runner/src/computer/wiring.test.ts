// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Vault } from '../crypto'
import { Store } from '../store'
import type { Driver } from './driver'
import type { Create } from './loop'
import { computerAllowed, makeComputer, taskMemory, tellAboutRestart, type ComputerDeps } from './index'

let dir: string
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openbots-computer-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const settle = () => new Promise((r) => setTimeout(r, 10))
const fakeDriver = (): Driver => ({
    size: async () => ({ width: 1280, height: 720 }),
    screenshot: async () => ({ base64: 'A', width: 1280, height: 720 }),
    click: async () => {},
    move: async () => {},
    drag: async () => {},
    scroll: async () => {},
    type: async () => {},
    key: async () => {},
    cursor: async () => ({ x: 0, y: 0 }),
    ready: async () => null,
    close: () => {},
})
// Claude takes a screenshot, then finishes
const twoSteps = (): Create => {
    let call = 0
    return async () =>
        call++ === 0
            ? { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'a', name: 'screenshot', input: {}, toolset_name: 'computer' }] }
            : { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'b', name: 'finish', input: { summary: 'Notepad says hello.' } }] }
}
const base: ComputerDeps = { anthropicKey: () => 'a', model: () => ({ api: 'claude-sonnet-5-5', id: 'claude-sonnet-5.5-computer-use' }), budget: async () => null, record: () => {}, log: () => {} }

describe('choosing how to drive this computer', () => {
    it('drives Windows and Mac, and nothing else', () => {
        expect(makeComputer('linux', base)).toBeUndefined()
        expect(makeComputer('other', base)).toBeUndefined()
        expect(makeComputer('windows', base)).toBeDefined()
        expect(makeComputer('mac', base)).toBeDefined()
    })

    it('runs a task end to end with the starting agent’s model, and counts its usage on that agent', async () => {
        const sent: string[] = []
        const records: [string, string][] = []
        const asked: string[] = []
        const bodies: Record<string, unknown>[] = []
        const steps = twoSteps()
        const create: Create = async (body) => (bodies.push(body), steps(body))
        const tasks = makeComputer('windows', {
            ...base,
            model: (agentId) => (asked.push(agentId), agentId === 'opus-agent' ? { api: 'claude-opus-5-5', id: 'claude-opus-5.5-computer-use' } : { api: 'claude-sonnet-5-5', id: 'claude-sonnet-5.5-computer-use' }),
            record: (agentId, model) => void records.push([agentId, model]),
            driver: fakeDriver(),
            create,
        })!
        tasks.start('open Notepad and type hello', { agentId: 'opus-agent', agentName: 'Iris', conversationId: 1, send: async (b) => void sent.push(b) })
        await settle()
        expect(sent).toEqual(['Notepad says hello.'])
        expect(asked).toEqual(['opus-agent'])
        expect(bodies.map((b) => b.model)).toEqual(['claude-opus-5-5', 'claude-opus-5-5'])
        // Usage is counted under the option id, like the Brain's, so Analytics can name it
        expect(records).toEqual([
            ['opus-agent', 'claude-opus-5.5-computer-use'],
            ['opus-agent', 'claude-opus-5.5-computer-use'],
        ])
    })

    it('stops before starting when the Mac is missing a permission', async () => {
        const sent: string[] = []
        const driver = { ...fakeDriver(), ready: async () => 'Allow Screen Recording for the engine in System Settings → Privacy & Security, then restart it.' }
        let called = false
        const tasks = makeComputer('mac', { ...base, driver, create: async () => ((called = true), { stop_reason: 'end_turn', content: [] }) })!
        tasks.start('open Notes', { agentId: 'a1', agentName: 'Iris', conversationId: 1, send: async (b) => void sent.push(b) })
        await settle()
        expect(called).toBe(false)
        expect(sent).toEqual(['I couldn’t finish “open Notes”: Allow Screen Recording for the engine in System Settings → Privacy & Security, then restart it.'])
    })

    it('calls Claude through the beta endpoint with the key saved right now', async () => {
        const calls: { key: string; body: Record<string, unknown> }[] = []
        const saved: { key?: string } = {}
        const steps = twoSteps()
        const anthropic = (apiKey: string) => ({ beta: { messages: { create: async (body: Record<string, unknown>) => (calls.push({ key: apiKey, body }), steps(body)) } } })
        const sent: string[] = []
        const tasks = makeComputer('windows', { ...base, anthropicKey: () => saved.key, driver: fakeDriver(), anthropic })!
        const ctx = { agentId: 'a1', agentName: 'Iris', conversationId: 1, send: async (b: string) => void sent.push(b) }
        tasks.start('open Notepad', ctx)
        await settle()
        expect(sent).toEqual(['I couldn’t finish “open Notepad”: Add your Anthropic key in Connections.'])
        // A key saved in Connections later is used by the next task, without a restart
        saved.key = 'sk-new'
        tasks.start('open Notepad', ctx)
        await settle()
        expect(sent.at(-1)).toBe('Notepad says hello.')
        expect(calls.map((c) => c.key)).toEqual(['sk-new', 'sk-new'])
        expect(calls[0].body.betas).toEqual(['context-management-2025-06-27'])
    })
})

describe('turning computer use off or pausing the agent', () => {
    it('is read from the dashboard config', () => {
        const agents = [{ _id: 'a1', status: 'live' }, { _id: 'a2', status: 'paused' }]
        expect(computerAllowed({ computerUse: true, agents }, 'a1')).toBeNull()
        expect(computerAllowed({ computerUse: false, agents }, 'a1')).toBe('computer use was turned off')
        expect(computerAllowed({ agents }, 'a1')).toBe('computer use was turned off')
        expect(computerAllowed(null, 'a1')).toBe('computer use was turned off')
        expect(computerAllowed({ computerUse: true, agents }, 'a2')).toBe('the agent was paused')
    })

    it('stops a running task at its next step and texts why', async () => {
        const sent: string[] = []
        const config = { computerUse: true, agents: [{ _id: 'a1', status: 'live' }] }
        let calls = 0
        // Claude keeps taking screenshots; computer use is turned off after the first call
        const create: Create = async () => {
            calls++
            config.computerUse = false
            return { stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `s${calls}`, name: 'screenshot', input: {}, toolset_name: 'computer' }] }
        }
        const tasks = makeComputer('windows', { ...base, driver: fakeDriver(), create, allowed: (agentId) => computerAllowed(config, agentId) })!
        tasks.start('open Notepad', { agentId: 'a1', agentName: 'Iris', conversationId: 1, send: async (b) => void sent.push(b) })
        await settle()
        expect(calls).toBe(1)
        expect(sent).toEqual(['Stopped “open Notepad”: computer use was turned off.'])
    })
})

describe('a task the engine’s restart ended', () => {
    it('is remembered sealed, and you get one text about it in its chat', async () => {
        const store = new Store(join(dir, 'openbots.db'), Vault.open(dir))
        const memory = taskMemory(store)
        memory.save({ agentId: 'a1', conversationId: 4, task: 'book a table at Nopa' })
        expect(store.getMeta('computer.task')).not.toContain('Nopa')
        const texts: [string, number, string][] = []
        const send = async (agentId: string, conversationId: number, body: string) => void texts.push([agentId, conversationId, body])
        await tellAboutRestart(store, send)
        expect(texts).toEqual([['a1', 4, 'I was restarted, so I stopped “book a table at Nopa”. Text me to start it again.']])
        // Only once
        await tellAboutRestart(store, send)
        expect(texts).toHaveLength(1)
        store.close()
    })

    it('keeps the task for the next start while its chat’s channel isn’t running', async () => {
        const store = new Store(join(dir, 'openbots.db'), Vault.open(dir))
        taskMemory(store).save({ agentId: 'a1', conversationId: 4, task: 'book Nopa' })
        let sends = 0
        await tellAboutRestart(store, async () => void sends++, () => {}, () => 'waiting')
        expect(sends).toBe(0)
        await tellAboutRestart(store, async () => void sends++, () => {}, (id) => (id === 4 ? 'ready' : 'gone'))
        expect(sends).toBe(1)
        store.close()
    })

    it('forgets the task when its chat was deleted', async () => {
        const store = new Store(join(dir, 'openbots.db'), Vault.open(dir))
        taskMemory(store).save({ agentId: 'a1', conversationId: 4, task: 'book Nopa' })
        let sends = 0
        await tellAboutRestart(store, async () => void sends++, () => {}, () => 'gone')
        expect(sends).toBe(0)
        expect(store.getMeta('computer.task')).toBeFalsy()
        // Nothing left for a later check
        await tellAboutRestart(store, async () => void sends++)
        expect(sends).toBe(0)
        store.close()
    })

    it('says nothing when the task ended normally, and forgets it even if the text fails', async () => {
        const store = new Store(join(dir, 'openbots.db'), Vault.open(dir))
        const memory = taskMemory(store)
        memory.save({ agentId: 'a1', conversationId: 4, task: 'x' })
        memory.clear()
        let sends = 0
        await tellAboutRestart(store, async () => void sends++)
        expect(sends).toBe(0)
        memory.save({ agentId: 'a1', conversationId: 4, task: 'x' })
        const lines: string[] = []
        await tellAboutRestart(store, async () => Promise.reject(new Error('relay down')), (l) => lines.push(l))
        expect(lines).toEqual(['Couldn’t tell you about the computer task the restart stopped: relay down'])
        await tellAboutRestart(store, async () => void sends++)
        expect(sends).toBe(0)
        store.close()
    })
})
