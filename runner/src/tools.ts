import type { Tool } from './brain'
import type { Store } from './store'
import type { Channel } from './transports/types'

// What an agent can schedule while chatting with its owner. Each tool checks its input and throws a plain message
// the model can pass on ("that time has already passed"); the tool loop gives errors to the model.

export const LIMITS = { reminders: 50, watches: 10 }
export const MIN_WATCH_MINUTES = 30

type Ctx = { store: Store; agentId: string; owner: string; number: string; channel: Channel; now: () => number }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : undefined)
const when = (iso: unknown) => {
    const t = typeof iso === 'string' ? Date.parse(iso) : NaN
    return Number.isFinite(t) ? t : undefined
}
const count = (ctx: Ctx, kind: 'reminder' | 'watch') => ctx.store.jobsFor(ctx.agentId).filter((j) => j.kind === kind).length

export function schedulingTools(ctx: Ctx): Tool[] {
    const base = { agentId: ctx.agentId, to: ctx.owner, number: ctx.number, channel: ctx.channel }
    return [
        {
            name: 'set_reminder',
            description: 'Text the owner a reminder at a time. Give either `at` (ISO 8601 with offset) or `in_minutes`.',
            parameters: { type: 'object', properties: { text: { type: 'string', description: 'What to remind them of' }, at: { type: 'string' }, in_minutes: { type: 'number' } }, required: ['text'] },
            run: async (input) => {
                const text = str(input.text)
                if (!text) throw new Error('Say what to remind them of')
                const minutes = num(input.in_minutes)
                const at = minutes !== undefined ? ctx.now() + minutes * 60_000 : when(input.at)
                if (at === undefined) throw new Error('Give a time (`at`) or `in_minutes`')
                if (at <= ctx.now()) throw new Error('That time has already passed')
                if (count(ctx, 'reminder') >= LIMITS.reminders) throw new Error(`There are already ${LIMITS.reminders} reminders; cancel some first`)
                const id = ctx.store.addJob({ ...base, kind: 'reminder', dueAt: at, everyMin: null, until: null, text })
                return `Reminder set (#${id}) for ${new Date(at).toISOString()}`
            },
        },
        {
            name: 'watch',
            description: `Check something on the web on a schedule and text the owner only when it changes. Checks at most every ${MIN_WATCH_MINUTES} minutes.`,
            parameters: { type: 'object', properties: { what: { type: 'string', description: 'What to check, e.g. "the price of …"' }, every_minutes: { type: 'number' }, until: { type: 'string', description: 'ISO 8601, optional' } }, required: ['what'] },
            run: async (input) => {
                const what = str(input.what)
                if (!what) throw new Error('Say what to watch')
                const every = Math.max(MIN_WATCH_MINUTES, Math.round(num(input.every_minutes) ?? 60))
                const until = input.until === undefined ? null : (when(input.until) ?? null)
                if (until !== null && until <= ctx.now()) throw new Error('That end time has already passed')
                if (count(ctx, 'watch') >= LIMITS.watches) throw new Error(`There are already ${LIMITS.watches} watches; cancel one first`)
                const id = ctx.store.addJob({ ...base, kind: 'watch', dueAt: ctx.now(), everyMin: every, until, text: what })
                return `Watching (#${id}), checking every ${every} minutes`
            },
        },
        {
            name: 'list_scheduled',
            description: 'List the reminders and watches this agent has for the owner.',
            parameters: { type: 'object', properties: {} },
            run: async () => {
                const jobs = ctx.store.jobsFor(ctx.agentId)
                if (!jobs.length) return 'Nothing scheduled'
                return jobs.map((j) => (j.kind === 'reminder' ? `#${j.id} reminder at ${new Date(j.dueAt).toISOString()}: ${j.text}` : `#${j.id} watching every ${j.everyMin} min: ${j.text}`)).join('\n')
            },
        },
        {
            name: 'cancel_scheduled',
            description: 'Cancel a reminder or watch by its number from list_scheduled.',
            parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] },
            run: async (input) => {
                const id = num(input.id)
                if (id === undefined || !ctx.store.cancelJob(id, ctx.agentId)) throw new Error(`There's no #${String(input.id)} to cancel`)
                return `Cancelled #${id}`
            },
        },
    ]
}
