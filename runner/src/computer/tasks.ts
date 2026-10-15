import { Stopped, type TaskEnd } from './loop'

// The task running on this computer, if any. Runs in the background after the agent replies "on it", takes your
// texts in that chat while it waits for an answer (or "stop"), and texts you how it ended. One at a time.

export type Hooks = { ask: (question: string) => Promise<string>; stopped: () => boolean }
// `agentId` is the agent that started the task: its Computer use model runs it and its usage is recorded on it
export type TaskCtx = { agentId: string; agentName: string; conversationId: number; send: (body: string) => Promise<void> }

export const ANSWER_TIMEOUT_MS = 30 * 60_000
// Texts stay short enough for one SMS
export const TEXT_LIMIT = 300
// The longest task the agent can hand over
export const TASK_LIMIT = 2000

export const short = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)
const describe = (e: unknown) => (e instanceof Error ? e.message : String(e))

type Waiting = { resolve: (answer: string) => void; reject: (e: Error) => void; timer: ReturnType<typeof setTimeout> }
type Running = { task: string; ctx: TaskCtx; stop: boolean; waiting?: Waiting }

export class ComputerTasks {
    private running: Running | null = null

    constructor(private deps: { run: (task: string, hooks: Hooks, ctx: TaskCtx) => Promise<TaskEnd>; log?: (line: string) => void; answerTimeoutMs?: number }) {}

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
        const hooks: Hooks = {
            stopped: () => running.stop,
            ask: (question) =>
                new Promise<string>((resolve, reject) => {
                    const timer = setTimeout(() => {
                        running.waiting = undefined
                        reject(new Stopped('you didn’t answer in 30 minutes'))
                    }, this.deps.answerTimeoutMs ?? ANSWER_TIMEOUT_MS)
                    running.waiting = { resolve, reject, timer }
                    void ctx.send(short(`${question} Reply YES to go ahead, or tell me what to do instead.`, TEXT_LIMIT)).catch((e) => log(`Couldn't text you a question: ${describe(e)}`))
                }),
        }
        const quoted = `“${short(text, 80)}”`
        // A run that throws straight away still ends in a text
        void new Promise<TaskEnd>((resolve) => resolve(this.deps.run(text, hooks, ctx)))
            .catch((e): TaskEnd => ({ outcome: 'failed', summary: describe(e), actions: 0 }))
            .then(async (end) => {
                if (running.waiting) clearTimeout(running.waiting.timer)
                this.running = null
                log(`${ctx.agentName}'s computer task ended (${end.outcome}, ${end.actions} actions)`)
                const body =
                    end.outcome === 'done'
                        ? end.summary
                        : end.outcome === 'stopped'
                        ? end.summary === 'You stopped it'
                            ? `Stopped ${quoted}.`
                            : `Stopped ${quoted}: ${end.summary}.`
                        : `I couldn’t finish ${quoted}: ${end.summary.replace(/\.$/, '')}.`
                await ctx.send(short(body, TEXT_LIMIT)).catch((e) => log(`Couldn't text you the result: ${describe(e)}`))
            })
        return 'Started. Tell the owner you’re on it and will text when it’s done.'
    }

    // Your text in the task's chat: "stop" ends it, and while it waits for an answer any text is the answer.
    // Returns true when the text was for the task (so the agent doesn't also reply to it).
    handle(conversationId: number, text: string): boolean {
        const running = this.running
        if (!running || running.ctx.conversationId !== conversationId) return false
        const waiting = running.waiting
        if (/^\s*stop\b/i.test(text)) {
            running.stop = true
            if (waiting) {
                clearTimeout(waiting.timer)
                running.waiting = undefined
                waiting.reject(new Stopped('You stopped it'))
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
