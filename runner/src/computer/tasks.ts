import { Stopped, type TaskEnd } from './loop'

// The task running on this computer, if any. Runs in the background after the agent replies "on it", takes your
// texts in that chat while it waits for an answer (or "stop"), and texts you how it ended. One at a time.

// `stopped` returns why the task must end now (you said stop, computer use was turned off, the agent was paused), or null
// `approve` texts an approval request as written and resolves with your answer, or null if you don't answer in time
export type Hooks = { ask: (question: string) => Promise<string>; approve: (request: string) => Promise<string | null>; stopped: () => string | null }
// `agentId` is the agent that started the task: its Computer use model runs it and its usage is recorded on it
export type TaskCtx = { agentId: string; agentName: string; conversationId: number; send: (body: string) => Promise<void> }

export const ANSWER_TIMEOUT_MS = 30 * 60_000
// Texts stay short enough for one SMS
export const TEXT_LIMIT = 300
// The longest task the agent can hand over
export const TASK_LIMIT = 2000
const ASK_SUFFIX = 'Reply YES to go ahead, YES ALL to stop asking me, or tell me what to do instead.'

export const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))

// The running task, kept on this computer so a restart can tell you it stopped (see index.ts:taskMemory)
export type Persist = { save: (t: { agentId: string; conversationId: number; task: string }) => void; clear: () => void }

type Waiting = { resolve: (answer: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
// `halted`: the engine is shutting down, so the task stays remembered and nothing is texted
type Running = { task: string; ctx: TaskCtx; stop: boolean; halted?: boolean; waiting?: Waiting }

export const YOU_STOPPED = 'You stopped it'

export class ComputerTasks {
    private running: Running | null = null

    constructor(
        private deps: {
            run: (task: string, hooks: Hooks, ctx: TaskCtx) => Promise<TaskEnd>
            log?: (line: string) => void
            answerTimeoutMs?: number
            persist?: Persist
            // Why the agent may not go on with a task right now (computer use turned off, the agent paused), or null
            allowed?: (agentId: string) => string | null
        },
    ) {}

    busy() {
        return !!this.running
    }

    // The task running now and the chat it reports to
    current(): { task: string; conversationId: number } | null {
        return this.running ? { task: this.running.task, conversationId: this.running.ctx.conversationId } : null
    }

    // Starts the task and returns at once; throws if one is already running
    start(task: string, ctx: TaskCtx): string {
        const text = task.trim()
        if (!text) throw new Error('Say what to do on the computer')
        if (text.length > TASK_LIMIT) throw new Error('That task is too long')
        if (this.running) throw new Error(`I'm still working on “${short(this.running.task, 60)}”. Text stop to cancel it first.`)
        const running: Running = { task: text, ctx, stop: false }
        this.running = running
        // Logs say who and how it went, never the task, questions or answers
        const log = this.deps.log ?? (() => {})
        log(`${ctx.agentName} started a computer task`)
        const persist = this.deps.persist
        try {
            persist?.save({ agentId: ctx.agentId, conversationId: ctx.conversationId, task: short(text, 80) })
        } catch (e) {
            log(`Couldn't remember the computer task: ${describe(e)}`)
        }
        // Read at each step, so turning computer use off or pausing the agent stops the task at the next action
        const stopped = (): string | null => {
            if (running.stop) return YOU_STOPPED
            try {
                return this.deps.allowed?.(ctx.agentId) ?? null
            } catch (e) {
                return `I couldn’t check computer use is still on (${describe(e)})`
            }
        }
        // Texts `body` and waits for your next text in the chat; `late` says what happens when you don't answer in time
        const wait = <T>(body: string, late: (resolve: (v: T) => void, reject: (e: Error) => void) => void) =>
            new Promise<T>((resolve, reject) => {
                // Already stopped: no new questions
                const why = stopped()
                if (why) return reject(new Stopped(why))
                const timer = setTimeout(() => {
                    running.waiting = undefined
                    late(resolve, reject)
                }, this.deps.answerTimeoutMs ?? ANSWER_TIMEOUT_MS)
                running.waiting = { resolve: resolve as (answer: string) => void, reject, timer }
                void ctx.send(body).catch((e) => log(`Couldn't text you a question: ${describe(e)}`))
            })
        const hooks: Hooks = {
            stopped,
            // Long questions are cut, never the reply instructions
            ask: (question) => wait<string>(`${short(question, TEXT_LIMIT - ASK_SUFFIX.length - 1)} ${ASK_SUFFIX}`, (_, reject) => reject(new Stopped('you didn’t answer in 30 minutes'))),
            // Sent whole: it shows exactly what's about to be typed (the loop keeps it short). No answer in time is a no.
            approve: (request) => wait<string | null>(request, (resolve) => resolve(null)),
        }
        const quoted = `“${short(text, 80)}”`
        // A run that throws straight away still ends in a text
        void new Promise<TaskEnd>((resolve) => resolve(this.deps.run(text, hooks, ctx)))
            .catch((e): TaskEnd => ({ outcome: 'failed', summary: describe(e), actions: 0 }))
            .then(async (end) => {
                if (running.waiting) clearTimeout(running.waiting.timer)
                this.running = null
                // Shutting down: the next start texts you that the restart stopped it
                if (running.halted) return log(`${ctx.agentName}'s computer task stopped for the shutdown`)
                try {
                    persist?.clear()
                } catch (e) {
                    log(`Couldn't forget the computer task: ${describe(e)}`)
                }
                log(`${ctx.agentName}'s computer task ended (${end.outcome}, ${end.actions} actions)`)
                const body =
                    end.outcome === 'done'
                        ? end.summary
                        : end.outcome === 'stopped'
                        ? end.summary === YOU_STOPPED
                            ? `Stopped ${quoted}.`
                            : `Stopped ${quoted}: ${end.summary}.`
                        : `I couldn’t finish ${quoted}: ${end.summary.replace(/\.$/, '')}.`
                await ctx.send(short(body, TEXT_LIMIT)).catch((e) => log(`Couldn't text you the result: ${describe(e)}`))
            })
        return 'Started. Tell the owner you’re on it and will text when it’s done.'
    }

    // The engine is shutting down: stop at the next action, keep the task remembered and text nothing
    halt() {
        const running = this.running
        if (!running) return
        running.halted = true
        running.stop = true
        const waiting = running.waiting
        if (waiting) {
            clearTimeout(waiting.timer)
            running.waiting = undefined
            waiting.reject(new Stopped('The engine is shutting down'))
        }
    }

    // Your text in the task's chat: a bare "stop" ends it, and while it waits for an answer any text is the answer.
    // Returns true when the text was for the task (so the agent doesn't also reply to it).
    handle(conversationId: number, text: string): boolean {
        const running = this.running
        if (!running || running.ctx.conversationId !== conversationId) return false
        const waiting = running.waiting
        if (/^\s*stop[\s.!]*$/i.test(text)) {
            running.stop = true
            if (waiting) {
                clearTimeout(waiting.timer)
                running.waiting = undefined
                waiting.reject(new Stopped(YOU_STOPPED))
            }
            return true
        }
        if (!waiting) return false
        clearTimeout(waiting.timer)
        running.waiting = undefined
        waiting.resolve(text.trim())
        return true
    }
}
