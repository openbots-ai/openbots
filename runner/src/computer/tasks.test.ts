// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Stopped, type TaskEnd } from './loop'
import { ComputerTasks, type Hooks } from './tasks'

afterEach(() => vi.useRealTimers())

// A task you control from the test: `steps` asks its questions through the hooks and returns how it ended
function harness(steps: (hooks: Hooks) => Promise<TaskEnd>) {
    const sent: string[] = []
    const lines: string[] = []
    const runs: { task: string; agentId: string }[] = []
    const tasks = new ComputerTasks({
        run: (task, hooks, ctx) => {
            runs.push({ task, agentId: ctx.agentId })
            return steps(hooks)
        },
        log: (l) => lines.push(l),
        answerTimeoutMs: 1000,
    })
    const ctx = { agentId: 'agent1', agentName: 'Iris', conversationId: 7, send: async (b: string) => void sent.push(b) }
    const settle = () => new Promise((r) => setTimeout(r, 0))
    return { tasks, ctx, sent, lines, runs, settle }
}

describe('computer tasks', () => {
    it('runs one at a time and texts you the result', async () => {
        let finish!: (e: TaskEnd) => void
        const { tasks, ctx, sent, runs, settle } = harness(() => new Promise((r) => (finish = r)))
        expect(tasks.current()).toBeNull()
        expect(tasks.start('book Nopa', ctx)).toMatch(/Started/)
        expect(tasks.busy()).toBe(true)
        expect(tasks.current()).toEqual({ task: 'book Nopa', conversationId: 7 })
        expect(runs).toEqual([{ task: 'book Nopa', agentId: 'agent1' }])
        expect(() => tasks.start('something else', ctx)).toThrow(/still working on/)
        finish({ outcome: 'done', summary: 'Booked Nopa for 2 at 7pm Friday.', actions: 12 })
        await settle()
        expect(sent).toEqual(['Booked Nopa for 2 at 7pm Friday.'])
        expect(tasks.busy()).toBe(false)
        expect(tasks.current()).toBeNull()
    })

    it('refuses an empty task or one that’s too long', () => {
        const { tasks, ctx, runs } = harness(async () => ({ outcome: 'done', summary: 'x', actions: 0 }))
        expect(() => tasks.start('   ', ctx)).toThrow('Say what to do on the computer')
        expect(() => tasks.start('x'.repeat(2001), ctx)).toThrow('That task is too long')
        expect(runs).toEqual([])
        expect(tasks.busy()).toBe(false)
    })

    it('texts the question and takes your next text in that chat as the answer', async () => {
        let answer = ''
        const { tasks, ctx, sent, settle } = harness(async (h) => {
            answer = await h.ask('Pay $40 for the tickets?')
            return { outcome: 'done', summary: 'Paid.', actions: 3 }
        })
        tasks.start('buy tickets', ctx)
        await settle()
        expect(sent[0]).toBe('Pay $40 for the tickets? Reply YES to go ahead, YES ALL to stop asking me, or tell me what to do instead.')
        expect(tasks.handle(99, 'YES')).toBe(false)
        expect(tasks.handle(7, 'yes')).toBe(true)
        await settle()
        expect(answer).toBe('yes')
        expect(sent.at(-1)).toBe('Paid.')
    })

    it('leaves your texts to the agent while the task runs and isn’t waiting, except stop', async () => {
        let finish!: (e: TaskEnd) => void
        const { tasks, ctx, settle } = harness(() => new Promise((r) => (finish = r)))
        tasks.start('book Nopa', ctx)
        expect(tasks.handle(7, 'how’s it going?')).toBe(false)
        expect(tasks.handle(7, 'stop')).toBe(true)
        finish({ outcome: 'stopped', summary: 'You stopped it', actions: 1 })
        await settle()
        expect(tasks.handle(7, 'stop')).toBe(false)
    })

    it('takes a text that only starts with stop as the answer', async () => {
        let answer = ''
        const { tasks, ctx, settle } = harness(async (h) => {
            answer = await h.ask('Which result?')
            return { outcome: 'done', summary: 'ok', actions: 1 }
        })
        tasks.start('search', ctx)
        await settle()
        expect(tasks.handle(7, 'Stop at the second result')).toBe(true)
        await settle()
        expect(answer).toBe('Stop at the second result')
    })

    it('asks nothing more once you said stop', async () => {
        let go!: () => void
        const gate = new Promise<void>((r) => (go = r))
        const { tasks, ctx, sent, settle } = harness(async (h) => {
            await gate
            try {
                await h.ask('Delete 30 emails?')
            } catch (e) {
                if (e instanceof Stopped) return { outcome: 'stopped', summary: e.message, actions: 1 }
                throw e
            }
            return { outcome: 'done', summary: 'x', actions: 1 }
        })
        tasks.start('clean inbox', ctx)
        expect(tasks.handle(7, 'stop!')).toBe(true)
        go()
        await settle()
        expect(sent).toEqual(['Stopped “clean inbox”.'])
    })

    it('keeps the reply instructions on a long question', async () => {
        const { tasks, ctx, sent, settle } = harness(async (h) => {
            await h.ask('q'.repeat(400)).catch(() => '')
            return { outcome: 'done', summary: 'x', actions: 1 }
        })
        tasks.start('t', ctx)
        await settle()
        expect(sent[0].length).toBeLessThanOrEqual(300)
        expect(sent[0]).toMatch(/q… Reply YES to go ahead, YES ALL to stop asking me, or tell me what to do instead\.$/)
        tasks.handle(7, 'no')
    })

    it('stops when you text stop, or when you don’t answer in time', async () => {
        const { tasks, ctx, sent, settle } = harness(async (h) => {
            try {
                await h.ask('Delete 30 emails?')
            } catch (e) {
                if (e instanceof Stopped) return { outcome: 'stopped', summary: e.message, actions: 2 }
                throw e
            }
            return { outcome: 'done', summary: 'x', actions: 2 }
        })
        tasks.start('clean inbox', ctx)
        await settle()
        expect(tasks.handle(7, 'Stop')).toBe(true)
        await settle()
        expect(sent.at(-1)).toBe('Stopped “clean inbox”.')

        vi.useFakeTimers()
        tasks.start('clean inbox', ctx)
        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(1000)
        expect(sent.at(-1)).toBe('Stopped “clean inbox”: you didn’t answer in 30 minutes.')
    })

    it('says what went wrong without the screen, and logs no task text', async () => {
        const { tasks, ctx, sent, lines, settle } = harness(async (h) => {
            await h.ask('Open the secret folder?').catch(() => '')
            return { outcome: 'failed', summary: 'It took more than 200 steps', actions: 200 }
        })
        tasks.start('find my secret recipe', ctx)
        await settle()
        tasks.handle(7, 'yes, the secret one')
        await settle()
        expect(sent.at(-1)).toBe('I couldn’t finish “find my secret recipe”: It took more than 200 steps.')
        expect(lines.length).toBeGreaterThan(0)
        expect(lines.join('\n')).not.toContain('secret')
        const crash = harness(async () => Promise.reject(new Error('Anthropic is down')))
        crash.tasks.start('t', crash.ctx)
        await crash.settle()
        expect(crash.sent).toEqual(['I couldn’t finish “t”: Anthropic is down.'])
    })

    it('remembers the running task on this computer until it ends, so a restart can tell you', async () => {
        let finish!: (e: TaskEnd) => void
        const saved: unknown[] = []
        let cleared = 0
        const tasks = new ComputerTasks({ run: () => new Promise((r) => (finish = r)), persist: { save: (t) => void saved.push(t), clear: () => void cleared++ } })
        const ctx = { agentId: 'agent1', agentName: 'Iris', conversationId: 7, send: async () => {} }
        tasks.start(`book ${'a very long place name '.repeat(5)}`, ctx)
        expect(saved).toEqual([{ agentId: 'agent1', conversationId: 7, task: expect.stringMatching(/^book a very long place name/) }])
        expect((saved[0] as { task: string }).task.length).toBeLessThanOrEqual(80)
        expect(cleared).toBe(0)
        finish({ outcome: 'done', summary: 'ok', actions: 1 })
        await new Promise((r) => setTimeout(r, 0))
        expect(cleared).toBe(1)

        // A run that throws is cleared too
        const crash = new ComputerTasks({ run: async () => Promise.reject(new Error('down')), persist: { save: () => {}, clear: () => void cleared++ } })
        crash.start('t', ctx)
        await new Promise((r) => setTimeout(r, 0))
        expect(cleared).toBe(2)
    })

    it('halts on shutdown: stops the clicks but keeps the task remembered and texts nothing', async () => {
        const sent: string[] = []
        let cleared = 0
        let stopped!: () => string | null
        let finish!: (e: TaskEnd) => void
        const tasks = new ComputerTasks({
            run: (_t, hooks) => ((stopped = hooks.stopped), new Promise((r) => (finish = r))),
            persist: { save: () => {}, clear: () => void cleared++ },
        })
        tasks.start('book Nopa', { agentId: 'a1', agentName: 'Iris', conversationId: 7, send: async (b) => void sent.push(b) })
        tasks.halt()
        expect(stopped()).toBe('You stopped it')
        finish({ outcome: 'stopped', summary: 'You stopped it', actions: 1 })
        await new Promise((r) => setTimeout(r, 0))
        expect(cleared).toBe(0)
        expect(sent).toEqual([])
        // A question waiting for an answer is dropped too
        const asking = new ComputerTasks({ run: async (_t, h) => (await h.ask('Pay?').catch(() => ''), { outcome: 'stopped', summary: 'x', actions: 0 }), persist: { save: () => {}, clear: () => void cleared++ } })
        asking.start('pay', { agentId: 'a1', agentName: 'Iris', conversationId: 7, send: async () => {} })
        await new Promise((r) => setTimeout(r, 0))
        asking.halt()
        await new Promise((r) => setTimeout(r, 0))
        expect(cleared).toBe(0)
    })

    it('stops at once when computer use is turned off or the agent is paused, and says why', async () => {
        const sent: string[] = []
        let why: string | null = null
        let stopped!: () => string | null
        let finish!: (e: TaskEnd) => void
        const asked: string[] = []
        const tasks = new ComputerTasks({
            run: (_t, hooks) => ((stopped = hooks.stopped), new Promise((r) => (finish = r))),
            allowed: (agentId) => (asked.push(agentId), why),
        })
        tasks.start('book Nopa', { agentId: 'a1', agentName: 'Iris', conversationId: 7, send: async (b) => void sent.push(b) })
        expect(stopped()).toBeNull()
        why = 'computer use was turned off'
        expect(stopped()).toBe('computer use was turned off')
        expect(asked).toContain('a1')
        finish({ outcome: 'stopped', summary: stopped()!, actions: 1 })
        await new Promise((r) => setTimeout(r, 0))
        expect(sent).toEqual(['Stopped “book Nopa”: computer use was turned off.'])
        // A paused agent asks no new questions
        why = 'the agent was paused'
        const paused = new ComputerTasks({
            run: async (_t, h) => h.ask('Pay?').then(
                () => ({ outcome: 'done', summary: 'Paid.', actions: 1 }),
                (e) => ({ outcome: 'stopped', summary: e instanceof Stopped ? e.message : 'x', actions: 0 }),
            ),
            allowed: () => why,
        })
        paused.start('pay', { agentId: 'a1', agentName: 'Iris', conversationId: 7, send: async (b) => void sent.push(b) })
        await new Promise((r) => setTimeout(r, 0))
        expect(sent.at(-1)).toBe('Stopped “pay”: the agent was paused.')
    })

    it('texts an approval request whole and takes your next text as the answer', async () => {
        let answer: string | null = ''
        const request = `Allow this on your computer?\n• type “${'x'.repeat(400)}”\nReply YES…`
        const { tasks, ctx, sent, settle } = harness(async (h) => {
            answer = await h.approve(request)
            return { outcome: 'done', summary: 'ok', actions: 1 }
        })
        tasks.start('t', ctx)
        await settle()
        // Not cut to one SMS: the owner sees exactly what will be typed
        expect(sent[0]).toBe(request)
        expect(tasks.handle(7, 'YES ALL')).toBe(true)
        await settle()
        expect(answer).toBe('YES ALL')
    })

    it('treats an unanswered approval request as declined, and stop as stop', async () => {
        vi.useFakeTimers()
        try {
            const got: (string | null)[] = []
            const { tasks, ctx, sent } = harness(async (h) => {
                got.push(await h.approve('Allow?'))
                try {
                    await h.approve('Allow again?')
                } catch (e) {
                    if (e instanceof Stopped) return { outcome: 'stopped', summary: e.message, actions: 1 }
                    throw e
                }
                return { outcome: 'done', summary: 'x', actions: 1 }
            })
            tasks.start('t', ctx)
            await vi.advanceTimersByTimeAsync(1001)
            expect(got).toEqual([null])
            expect(tasks.handle(7, 'stop')).toBe(true)
            await vi.advanceTimersByTimeAsync(0)
            expect(sent.at(-1)).toBe('Stopped “t”.')
        } finally {
            vi.useRealTimers()
        }
    })
})
