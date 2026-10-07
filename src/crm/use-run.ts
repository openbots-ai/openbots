import { toast } from 'sonner'

// Wraps a mutation so a failure shows as a toast instead of an unhandled rejection
export function useRun() {
    return async <T>(p: Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> => {
        try {
            return { ok: true, value: await p }
        } catch (e) {
            // Convex prefixes server errors with request metadata; keep the human part
            const msg = e instanceof Error ? e.message : String(e)
            toast.error(msg.match(/Uncaught Error: (.*?)(?:\n|\s+at |$)/)?.[1] ?? 'Something went wrong. Try again.')
            return { ok: false }
        }
    }
}
