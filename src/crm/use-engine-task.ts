import { useConvex } from 'convex/react'
import type { Infer } from 'convex/values'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import type { taskRequest } from '@convex/schema'

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

// Queues a request for your engine (only it has your Twilio login) and waits for its answer
export function useEngineTask() {
    const convex = useConvex()
    return async (request: Infer<typeof taskRequest>): Promise<Outcome<NonNullable<Doc<'tasks'>['result']>>> => {
        const id = await convex.mutation(api.tasks.request, { request })
        return new Promise((resolve) => {
            const watch = convex.watchQuery(api.tasks.get, { id })
            const finish = (outcome: Outcome<NonNullable<Doc<'tasks'>['result']>>) => {
                unsubscribe()
                clearTimeout(timer)
                resolve(outcome)
            }
            const check = () => {
                const t = watch.localQueryResult()
                if (t?.status === 'done' && t.result) finish({ ok: true, value: t.result })
                if (t?.status === 'failed') finish({ ok: false, error: t.error ?? 'Your engine couldn’t do that' })
            }
            const unsubscribe = watch.onUpdate(check)
            const timer = setTimeout(() => finish({ ok: false, error: 'Your engine didn’t answer. Is it running? (See Connections.)' }), 60_000)
            check()
        })
    }
}
