// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Driver } from './driver'
import { KEEP_SHOTS, MAX_ACTIONS, runTask, SKIPPED, Stopped, type Block, type Create, type LoopDeps } from './loop'

// A screen 2000×1000; screenshots are sent at 1516×758 (fitted)
function fakeDriver(failOn?: string) {
    const actions: string[] = []
    const driver: Driver = {
        size: async () => ({ width: 2000, height: 1000 }),
        screenshot: async (t) => (actions.push(`shot ${t.width}x${t.height}`), { base64: 'AAA', width: t.width, height: t.height }),
        click: async (at, button, count, mods) => {
            if (failOn === 'click') throw new Error('Windows blocked the input')
            actions.push(`click ${at?.x},${at?.y} ${button} ${count} ${mods.join('+')}`)
        },
        move: async (at) => void actions.push(`move ${at.x},${at.y}`),
        drag: async () => void actions.push('drag'),
        scroll: async (_at, d, n) => void actions.push(`scroll ${d} ${n}`),
        type: async (t) => void actions.push(`type ${t}`),
        key: async (k, r) => void actions.push(`key ${k} x${r}`),
        cursor: async () => ({ x: 1000, y: 500 }),
        ready: async () => null,
        close: () => {},
    }
    return { driver, actions }
}

const call = (id: string, name: string, input: Record<string, unknown> = {}): Block => ({ type: 'tool_use', id, name, input, toolset_name: 'computer' })
const own = (id: string, name: string, input: Record<string, unknown>): Block => ({ type: 'tool_use', id, name, input })

type Body = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
// Answers each request with the next canned response and keeps the requests
function script(...responses: Block[][]) {
    const bodies: Body[] = []
    const create: Create = async (body) => {
        bodies.push(structuredClone(body))
        const content = responses.shift() ?? [{ type: 'text', text: 'Done.' }]
        return { stop_reason: content.some((b) => b.type === 'tool_use') ? 'tool_use' : 'end_turn', content }
    }
    return { create, bodies }
}

function deps(over: Partial<LoopDeps> & Pick<LoopDeps, 'create' | 'driver'>): LoopDeps {
    return { model: 'claude-sonnet-5-5', os: 'windows', ask: async () => 'YES', stopped: () => false, overBudget: async () => null, record: () => {}, now: () => 0, sleep: async () => {}, ...over }
}

describe('the computer loop', () => {
    it('runs a batch in order, maps coordinates to the screen and answers every block with toolset_name', async () => {
        const { driver, actions } = fakeDriver()
        const { create, bodies } = script(
            [call('a', 'screenshot'), call('b', 'left_click', { coordinate: [758, 379], text: 'shift' }), call('c', 'type', { text: 'Nopa' }), call('d', 'key', { text: 'Return' })],
            [own('e', 'finish', { summary: 'Found Nopa’s booking page.' })],
        )
        const end = await runTask('find Nopa', deps({ create, driver }))
        expect(end).toEqual({ outcome: 'done', summary: 'Found Nopa’s booking page.', actions: 4 })
        expect(actions).toEqual(['shot 1516x758', 'click 1000,500 left 1 shift', 'type Nopa', 'key Return x1'])
        expect(bodies[0].tools[0]).toMatchObject({ type: 'computer_toolset_20260801' })
        const results = bodies[1].messages.at(-1).content
        expect(results.map((r: { tool_use_id: string; toolset_name: string }) => [r.tool_use_id, r.toolset_name])).toEqual([['a', 'computer'], ['b', 'computer'], ['c', 'computer'], ['d', 'computer']])
        expect(results[0].content[0]).toMatchObject({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAA' } })
    })

    it('stops a batch at the first failed action and marks the rest as not run', async () => {
        const { driver, actions } = fakeDriver('click')
        const { create, bodies } = script([call('a', 'left_click', { coordinate: [1, 1] }), call('b', 'type', { text: 'x' }), call('c', 'screenshot')])
        await runTask('t', deps({ create, driver }))
        const results = bodies[1].messages.at(-1).content
        expect(results[0]).toMatchObject({ tool_use_id: 'a', is_error: true, toolset_name: 'computer' })
        expect(results[0].content).toMatch(/blocked/)
        expect(results.slice(1)).toEqual([
            { type: 'tool_result', tool_use_id: 'b', toolset_name: 'computer', is_error: true, content: SKIPPED },
            { type: 'tool_result', tool_use_id: 'c', toolset_name: 'computer', is_error: true, content: SKIPPED },
        ])
        expect(actions).toEqual([])
    })

    it('asks you before acting and passes your answer to Claude', async () => {
        const { driver } = fakeDriver()
        const ask = vi.fn(async () => 'YES')
        const { create, bodies } = script([own('q', 'ask_owner', { question: 'Book Nopa for 2 at 7pm Friday?' })], [own('f', 'finish', { summary: 'Booked.' })])
        expect((await runTask('book Nopa', deps({ create, driver, ask }))).outcome).toBe('done')
        expect(ask).toHaveBeenCalledWith('Book Nopa for 2 at 7pm Friday?')
        expect(bodies[1].messages.at(-1).content[0]).toEqual({ type: 'tool_result', tool_use_id: 'q', content: 'The owner answered: YES' })
    })

    it('ends when you say stop or don’t answer', async () => {
        const { driver } = fakeDriver()
        const { create } = script([own('q', 'ask_owner', { question: 'Pay $40?' })])
        const end = await runTask('t', deps({ create, driver, ask: async () => Promise.reject(new Stopped('You stopped it')) }))
        expect(end).toMatchObject({ outcome: 'stopped', summary: 'You stopped it' })
    })

    it('stops between actions when told to', async () => {
        const { driver, actions } = fakeDriver()
        let stop = false
        const { create } = script([call('a', 'type', { text: 'one' }), call('b', 'type', { text: 'two' })])
        const end = await runTask('t', deps({ create, driver: { ...driver, type: async (t) => ((stop = true), void actions.push(t)) }, stopped: () => stop }))
        expect(end.outcome).toBe('stopped')
        expect(actions).toEqual(['one'])
    })

    it('gives up after 200 actions, 30 minutes, or when the budget runs out', async () => {
        const { driver } = fakeDriver()
        const busy: Create = async () => ({ stop_reason: 'tool_use', content: [call(`m${Math.random()}`, 'mouse_move', { coordinate: [1, 1] })] })
        const many = await runTask('t', deps({ create: busy, driver }))
        expect(many).toMatchObject({ outcome: 'failed', actions: MAX_ACTIONS })
        expect(many.summary).toMatch(/200 steps/)
        let t = 0
        const slow = await runTask('t', deps({ create: busy, driver, now: () => (t += 10 * 60_000) }))
        expect(slow.summary).toMatch(/30 minutes/)
        const broke = await runTask('t', deps({ create: busy, driver, overBudget: async () => 'Today’s usage budget is used up.' }))
        expect(broke).toMatchObject({ outcome: 'failed', summary: 'Today’s usage budget is used up.' })
    })

    it('keeps only the last 3 screenshots in the request', async () => {
        const { driver } = fakeDriver()
        const shots = Array.from({ length: 5 }, (_, i) => [call(`s${i}`, 'screenshot')])
        const { create, bodies } = script(...shots)
        await runTask('t', deps({ create, driver }))
        const last = bodies.at(-1)!
        const images = JSON.stringify(last.messages).match(/"type":"image"/g) ?? []
        expect(images).toHaveLength(KEEP_SHOTS)
    })

    it('answers members it doesn’t do with an error instead of failing the task', async () => {
        const { driver } = fakeDriver()
        const { create, bodies } = script([call('z', 'hold_key', { text: 'shift', duration: 1 })])
        await runTask('t', deps({ create, driver }))
        expect(bodies[1].messages.at(-1).content[0]).toMatchObject({ tool_use_id: 'z', is_error: true, toolset_name: 'computer' })
    })

    it('fails when the answer is cut off with no actions to run', async () => {
        const { driver } = fakeDriver()
        const create: Create = async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Let me' }] })
        const end = await runTask('t', deps({ create, driver }))
        expect(end).toMatchObject({ outcome: 'failed', summary: 'Claude’s answer was cut off' })
    })
})
