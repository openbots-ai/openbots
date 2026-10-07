export function matches(q: string, ...fields: (string | undefined)[]) {
    const needle = q.trim().toLowerCase()
    return !needle || fields.some((f) => f?.toLowerCase().includes(needle))
}

export const parseTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
