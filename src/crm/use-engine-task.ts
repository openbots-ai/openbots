import { useConvex } from 'convex/react'
import type { Infer } from 'convex/values'
import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { TASK_CANCELLED, TASK_EXPIRED } from '@convex/lib/tasks'
import type { taskRequest } from '@convex/schema'

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string }

const NO_ANSWER = 'Your engine didn’t answer, so nothing was done. Is it running? (See Connections.)'
const EXPIRED = 'Your engine took too long, so the request was closed. Is it running? (See Connections.)'

// How long to wait for an engine to pick a request up; once one has, wait for its answer (the backend closes it
// if that never comes, see convex/lib/tasks.ts)
const WAIT_MS = 60_000

// Queues a request for your engine (only it has your Twilio login) and waits for its answer
export function useEngineTask() {
    const convex = useConvex()
    return async (request: Infer<typeof taskRequest>): Promise<Outcome<NonNullable<Doc<'tasks'>['result']>>> => {
        const id = await convex.mutation(api.tasks.request, { request })
        return new Promise((resolve) => {
            const watch = convex.watchQuery(api.tasks.get, { id })
            let done = false
            const finish = (outcome: Outcome<NonNullable<Doc<'tasks'>['result']>>) => {
                if (done) return
                done = true
                unsubscribe()
                clearTimeout(timer)
                resolve(outcome)
            }
            const check = () => {
                const t = watch.localQueryResult()
                if (t?.status === 'done' && t.result) finish({ ok: true, value: t.result })
                if (t?.status === 'failed') finish({ ok: false, error: t.error === TASK_EXPIRED ? EXPIRED : t.error === TASK_CANCELLED ? NO_ANSWER : (t.error ?? 'Your engine couldn’t do that') })
            }
            const unsubscribe = watch.onUpdate(check)
            // Withdraw the request so no engine does it later; if one already took it, keep waiting for its answer
            const timer = setTimeout(() => {
                convex.mutation(api.tasks.cancel, { id }).then(
                    (withdrawn) => {
                        if (withdrawn) finish({ ok: false, error: NO_ANSWER })
                    },
                    () => finish({ ok: false, error: NO_ANSWER }),
                )
            }, WAIT_MS)
            check()
        })
    }
}
