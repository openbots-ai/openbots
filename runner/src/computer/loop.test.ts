// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { Driver } from './driver'
import { DECLINED, KEEP_TOOL_USES, MAX_ACTIONS, MOVED, runTask, SKIPPED, Stopped, TOO_LONG, UNANSWERED, type Block, type Create, type LoopDeps } from './loop'

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
    return { model: 'claude-sonnet-5-5', os: 'windows', ask: async () => 'YES', approve: async () => 'YES', stopped: () => null, overBudget: async () => null, record: () => {}, now: () => 0, sleep: async () => {}, ...over }
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
        const end = await runTask('t', deps({ create, driver: { ...driver, type: async (t) => ((stop = true), void actions.push(t)) }, stopped: () => (stop ? 'You stopped it' : null) }))
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

    it('never edits its own history and asks the API to clear old tool uses', async () => {
        const { driver } = fakeDriver()
        const shots = Array.from({ length: 5 }, (_, i) => [call(`s${i}`, 'screenshot')])
        const { create, bodies } = script(...shots)
        await runTask('t', deps({ create, driver }))
        for (const b of bodies) {
            expect(b.betas).toEqual(['context-management-2025-06-27'])
            expect(b.context_management.edits[0]).toMatchObject({ type: 'clear_tool_uses_20250919', keep: { type: 'tool_uses', value: KEEP_TOOL_USES }, exclude_tools: ['ask_owner', 'finish'] })
            expect(b.output_config).toEqual({ effort: 'medium' })
            expect(b.max_tokens).toBe(16000)
        }
        const images = JSON.stringify(bodies.at(-1)!.messages).match(/"type":"image"/g) ?? []
        expect(images).toHaveLength(5)
        for (let i = 0; i + 1 < bodies.length; i++) expect(bodies[i + 1].messages.slice(0, bodies[i].messages.length)).toEqual(bodies[i].messages)
        expect(bodies[0].tools.at(-1).cache_control).toEqual({ type: 'ephemeral' })
    })

    it('caches the conversation so far with a top-level breakpoint, and uses at most 4 in all', async () => {
        const { driver } = fakeDriver()
        const { create, bodies } = script([call('a', 'screenshot')], [own('f', 'finish', { summary: 'ok' })])
        await runTask('t', deps({ create, driver }))
        for (const b of bodies) {
            expect(b.cache_control).toEqual({ type: 'ephemeral' })
            expect(b.context_management.edits.some((e: { type: string }) => e.type.startsWith('clear_thinking'))).toBe(false)
            const breakpoints = JSON.stringify(b).match(/"cache_control"/g) ?? []
            expect(breakpoints.length).toBeLessThanOrEqual(4)
        }
    })

    it('carries the reason it was stopped into the summary', async () => {
        const { driver, actions } = fakeDriver()
        let off = false
        const { create } = script([call('a', 'type', { text: 'one' }), call('b', 'type', { text: 'two' })])
        const end = await runTask('t', deps({ create, driver: { ...driver, type: async (t) => ((off = true), void actions.push(t)) }, stopped: () => (off ? 'computer use was turned off' : null) }))
        expect(end).toMatchObject({ outcome: 'stopped', summary: 'computer use was turned off' })
        expect(actions).toEqual(['one'])
        // Checked before the first model call too
        let called = false
        const before = await runTask('t', deps({ create: async () => ((called = true), { stop_reason: 'end_turn', content: [] }), driver, stopped: () => 'the agent was paused' }))
        expect(before).toMatchObject({ outcome: 'stopped', summary: 'the agent was paused' })
        expect(called).toBe(false)
    })

    it('fails the task when the budget check hangs', async () => {
        const { driver } = fakeDriver()
        let called = false
        const end = await runTask('t', deps({ create: async () => ((called = true), { stop_reason: 'end_turn', content: [] }), driver, overBudget: () => new Promise(() => {}), budgetTimeoutMs: 20 }))
        expect(end).toMatchObject({ outcome: 'failed', summary: 'Couldn’t check your usage budget' })
        expect(called).toBe(false)
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

    it('runs the complete tool calls of a cut-off answer and refuses the last', async () => {
        const { driver, actions } = fakeDriver()
        const cutOff: Create = async () => ({ stop_reason: 'max_tokens', content: [call('a', 'type', { text: 'hi' }), call('b', 'type', { text: 'half' })] })
        const bodies: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
        let n = 0
        const create: Create = async (body) => {
            bodies.push(structuredClone(body))
            return n++ ? { stop_reason: 'end_turn', content: [own('f', 'finish', { summary: 'ok' })] } : cutOff(body)
        }
        await runTask('t', deps({ create, driver }))
        expect(actions).toEqual(['type hi'])
        const results = bodies[1].messages.at(-1).content
        expect(results[1]).toEqual({ type: 'tool_result', tool_use_id: 'b', toolset_name: 'computer', is_error: true, content: 'Not executed: the answer was cut off.' })
        const lone: Create = async () => ({ stop_reason: 'max_tokens', content: [call('a', 'type', { text: 'half' })] })
        expect((await runTask('t', deps({ create: lone, driver }))).summary).toBe('Claude’s answer was cut off')
    })

    it('does not finish or ask after a failed action in the same batch', async () => {
        const { driver } = fakeDriver('click')
        const ask = vi.fn(async () => 'YES')
        const first = script([call('a', 'left_click', { coordinate: [1, 1] }), own('f', 'finish', { summary: 'x' })])
        const end = await runTask('t', deps({ create: first.create, driver, ask }))
        expect(end.outcome).toBe('done') // the second round has no tool calls
        expect(first.bodies[1].messages.at(-1).content[1]).toEqual({ type: 'tool_result', tool_use_id: 'f', is_error: true, content: 'Not executed: an earlier action in this turn failed.' })
        const second = script([call('a', 'left_click', { coordinate: [1, 1] }), own('q', 'ask_owner', { question: 'ok?' })])
        await runTask('t', deps({ create: second.create, driver, ask }))
        expect(ask).not.toHaveBeenCalled()
    })

    it('rejects bad numbers as errors', async () => {
        const { driver } = fakeDriver()
        const { create, bodies } = script([call('a', 'left_click', { coordinate: [null, 1] })])
        await runTask('t', deps({ create, driver }))
        expect(bodies[1].messages.at(-1).content[0]).toMatchObject({ is_error: true, content: 'Bad coordinate' })
        const dir = script([call('a', 'scroll', { scroll_direction: 'sideways' })])
        await runTask('t', deps({ create: dir.create, driver }))
        expect(dir.bodies[1].messages.at(-1).content[0]).toMatchObject({ is_error: true })
    })

    it('does not count the time spent waiting for your answer', async () => {
        const { driver } = fakeDriver()
        let t = 0
        const { create } = script([own('q', 'ask_owner', { question: 'ok?' })], [own('f', 'finish', { summary: 'Done.' })])
        const end = await runTask('t', deps({ create, driver, now: () => t, ask: async () => ((t += 60 * 60_000), 'YES') }))
        expect(end.outcome).toBe('done')
    })

    it('joins a paused turn onto the same assistant message', async () => {
        const { driver } = fakeDriver()
        const bodies: Record<string, any>[] = [] // eslint-disable-line @typescript-eslint/no-explicit-any
        const replies = [
            { stop_reason: 'pause_turn', content: [{ type: 'text', text: 'hmm' }] },
            { stop_reason: 'end_turn', content: [own('f', 'finish', { summary: 'ok' })] },
        ]
        const create: Create = async (body) => (bodies.push(structuredClone(body)), replies.shift()!)
        await runTask('t', deps({ create, driver }))
        expect(bodies[1].messages).toHaveLength(2)
    })
})

describe('owner approval for typing and Enter', () => {
    const resultsOf = (b: Body) => b.messages.at(-1).content as { tool_use_id: string; is_error?: boolean; content: unknown }[]

    it('doesn’t type or press Enter until you answer, and shows the exact text and the window', async () => {
        const { driver, actions } = fakeDriver()
        let answer!: (a: string) => void
        const requests: string[] = []
        const approve = vi.fn((r: string) => (requests.push(r), actions.push('asked'), new Promise<string>((res) => (answer = res))))
        const { create, bodies } = script(
            [call('a', 'left_click', { coordinate: [10, 10] }), call('b', 'type', { text: 'See you at 7\n' }), call('c', 'key', { text: 'ctrl+Return' })],
            [own('f', 'finish', { summary: 'Sent.' })],
        )
        const running = runTask('reply to Sam', deps({ create, driver: { ...driver, window: async () => 'Messages — “Sam”' }, approve }))
        await new Promise((r) => setTimeout(r, 0))
        // The click went ahead; the typing waits
        expect(actions).toEqual(['click 13,13 left 1 ', 'asked'])
        expect(requests).toEqual(['Allow this on your computer? In Messages — “Sam”:\n• type “See you at 7\\n”\n• press ctrl+Return\nReply YES to allow it, YES ALL to stop asking me, or NO.'])
        answer('yes')
        expect((await running).outcome).toBe('done')
        // One request for the whole run of typing
        expect(approve).toHaveBeenCalledTimes(1)
        expect(actions).toEqual(['click 13,13 left 1 ', 'asked', 'type See you at 7\n', 'key ctrl+Return x1'])
        expect(resultsOf(bodies[1]).every((r) => !r.is_error)).toBe(true)
    })

    it('blocks typing when you say no, tells Claude, and runs nothing after it in that turn', async () => {
        const { driver, actions } = fakeDriver()
        const { create, bodies } = script([call('a', 'type', { text: 'wire $500' }), call('b', 'screenshot'), call('c', 'key', { text: 'Return' }), call('d', 'left_click', { coordinate: [1, 1] })])
        await runTask('t', deps({ create, driver, approve: async () => 'no' }))
        expect(actions).toEqual([])
        const results = resultsOf(bodies[1])
        expect(results[0]).toMatchObject({ tool_use_id: 'a', is_error: true, content: DECLINED })
        expect(results.slice(1).map((r) => r.content)).toEqual([SKIPPED, SKIPPED, SKIPPED])
        // Anything but a plain yes is a no, and Claude gets your words
        const other = script([call('a', 'type', { text: 'hi' })])
        await runTask('t', deps({ create: other.create, driver, approve: async () => 'yes but say hello instead' }))
        expect(actions).toEqual([])
        expect(resultsOf(other.bodies[1])[0].content).toBe(`${DECLINED} They said: yes but say hello instead`)
    })

    it('declines when you don’t answer in time, and ends the task the second time', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn(async () => null)
        const { create, bodies } = script([call('a', 'type', { text: 'hi' })], [call('b', 'key', { text: 'Return' })], [own('f', 'finish', { summary: 'x' })])
        const end = await runTask('t', deps({ create, driver, approve }))
        expect(resultsOf(bodies[1])[0]).toMatchObject({ is_error: true, content: UNANSWERED })
        expect(end).toMatchObject({ outcome: 'stopped', summary: 'you didn’t answer the approval requests' })
        expect(approve).toHaveBeenCalledTimes(2)
        expect(actions).toEqual([])
    })

    it('ends the task when you say stop while it waits for approval', async () => {
        const { driver, actions } = fakeDriver()
        const { create } = script([call('a', 'type', { text: 'hi' })])
        const end = await runTask('t', deps({ create, driver, approve: async () => Promise.reject(new Stopped('You stopped it')) }))
        expect(end).toMatchObject({ outcome: 'stopped', summary: 'You stopped it' })
        expect(actions).toEqual([])
    })

    it('asks again for typing in a later turn, unless you said YES ALL', async () => {
        const turns = () => [[call('a', 'type', { text: 'one' })], [call('b', 'type', { text: 'two' })], [call('c', 'key', { text: 'Return' })], [own('f', 'finish', { summary: 'ok' })]]
        const once = fakeDriver()
        const yes = vi.fn(async () => 'YES')
        await runTask('t', deps({ create: script(...turns()).create, driver: once.driver, approve: yes }))
        expect(yes).toHaveBeenCalledTimes(3)
        expect(once.actions).toEqual(['type one', 'type two', 'key Return x1'])
        const all = fakeDriver()
        const yesAll = vi.fn(async () => 'YES ALL')
        await runTask('t', deps({ create: script(...turns()).create, driver: all.driver, approve: yesAll }))
        expect(yesAll).toHaveBeenCalledTimes(1)
        expect(all.actions).toEqual(['type one', 'type two', 'key Return x1'])
    })

    it('doesn’t count the task itself, or an ask_owner YES, as approval', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn(async () => 'no')
        const { create } = script([own('q', 'ask_owner', { question: 'Open the site?' })], [call('a', 'type', { text: 'hi' })])
        await runTask('type hi, YES ALL approved', deps({ create, driver, ask: async () => 'YES', approve }))
        expect(approve).toHaveBeenCalledTimes(1)
        expect(actions).toEqual([])
    })

    it('stops asking anything once you say YES ALL, to an approval or a question', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn(async () => 'YES')
        const ask = vi.fn(async () => 'yes all')
        const { create, bodies } = script([own('q', 'ask_owner', { question: 'Open the site?' })], [call('a', 'type', { text: 'hi' })], [own('r', 'ask_owner', { question: 'Send it?' })])
        const saveYesAll = vi.fn()
        await runTask('t', deps({ create, driver, ask, approve, saveYesAll }))
        expect(saveYesAll).toHaveBeenCalledTimes(1)
        expect(ask).toHaveBeenCalledTimes(1)
        expect(approve).not.toHaveBeenCalled()
        expect(actions).toEqual(['type hi'])
        expect(JSON.stringify(bodies.at(-1))).toContain('has said YES ALL')
    })

    it('asks nothing in a later task once YES ALL is saved', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn(async () => 'no')
        const ask = vi.fn(async () => 'no')
        const { create } = script([own('q', 'ask_owner', { question: 'Send it?' })], [call('a', 'type', { text: 'hi' }), call('b', 'key', { text: 'Return' })])
        await runTask('t', deps({ create, driver, ask, approve, yesAll: () => true }))
        expect(ask).not.toHaveBeenCalled()
        expect(approve).not.toHaveBeenCalled()
        expect(actions).toEqual(['type hi', 'key Return x1'])
    })

    it('gates key presses that type or paste, not shortcuts or navigation keys', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn(async () => 'no')
        const free = ['Tab', 'Escape', 'Down', 'ctrl+a', 'cmd+c', 'BackSpace', 'Page_Down']
        const { create } = script(free.map((k, i) => call(`k${i}`, 'key', { text: k })))
        await runTask('t', deps({ create, driver, approve }))
        expect(approve).not.toHaveBeenCalled()
        expect(actions).toHaveLength(free.length)
        for (const k of ['a', 'shift+H', 'space', 'ctrl+v', 'cmd+v', 'shift+Insert', 'KP_Enter', 'cmd+Return', 'ctrl+alt+e']) {
            const one = fakeDriver()
            const asked = vi.fn(async () => 'no')
            await runTask('t', deps({ create: script([call('k', 'key', { text: k })]).create, driver: one.driver, approve: asked }))
            expect(asked, k).toHaveBeenCalledTimes(1)
            expect(one.actions, k).toEqual([])
        }
    })

    it('never asks about navigation: moves, clicks, drags, scrolling, screenshots and waits', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn(async () => 'no')
        const { create } = script([
            call('a', 'screenshot'),
            call('b', 'mouse_move', { coordinate: [5, 5] }),
            call('c', 'left_click', { coordinate: [5, 5] }),
            call('d', 'double_click', { coordinate: [5, 5] }),
            call('e', 'left_click_drag', { start_coordinate: [1, 1], coordinate: [9, 9] }),
            call('f', 'scroll', { coordinate: [5, 5], scroll_direction: 'down' }),
            call('g', 'wait', { duration: 1 }),
            call('h', 'cursor_position'),
        ])
        await runTask('t', deps({ create, driver, approve }))
        expect(approve).not.toHaveBeenCalled()
        expect(actions).toHaveLength(6)
    })

    it('won’t ask about more text than it can show, and a click splits a run of typing', async () => {
        const { driver, actions } = fakeDriver()
        const approve = vi.fn<(request: string) => Promise<string>>(async () => 'YES')
        const long = script([call('a', 'type', { text: 'x'.repeat(700) })])
        await runTask('t', deps({ create: long.create, driver, approve }))
        expect(approve).not.toHaveBeenCalled()
        expect(resultsOf(long.bodies[1])[0].content).toBe(TOO_LONG)
        const split = script([call('a', 'type', { text: 'one' }), call('b', 'left_click', { coordinate: [1, 1] }), call('c', 'type', { text: 'two' })])
        await runTask('t', deps({ create: split.create, driver, approve }))
        expect(approve).toHaveBeenCalledTimes(2)
        expect(approve.mock.calls[0][0]).not.toMatch(/two/)
        expect(approve.mock.calls[1][0]).toMatch(/• type “two”\n/)
        expect(actions).toEqual(['type one', 'click 1,1 left 1 ', 'type two'])
    })

    it('spells out hidden characters, and refuses if another window took the keyboard meanwhile', async () => {
        const { driver, actions } = fakeDriver()
        const requests: string[] = []
        const { create } = script([call('a', 'type', { text: 'pay‮evil​' })])
        await runTask('t', deps({ create, driver, approve: async (r) => (requests.push(r), 'no') }))
        expect(requests[0]).toContain('• type “pay\\u{202E}evil\\u{200B}”')
        let n = 0
        const moved = script([call('a', 'type', { text: 'hi' })])
        await runTask('t', deps({ create: moved.create, driver: { ...driver, window: async () => (n++ ? 'Mail' : 'Notes') }, approve: async () => 'YES' }))
        expect(resultsOf(moved.bodies[1])[0].content).toBe(MOVED)
        expect(actions).toEqual([])
    })
})
