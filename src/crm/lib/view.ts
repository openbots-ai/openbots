export const VIEWS = ['agents', 'knowledge', 'numbers', 'broadcasts', 'conversations', 'contacts', 'analytics', 'live', 'settings'] as const
export type View = (typeof VIEWS)[number]

const isView = (v: string | null): v is View => (VIEWS as readonly (string | null)[]).includes(v)

// Views live in the query string so the path itself never leaves /crm
export function parseView(search: string): { view: View; id?: string } {
    const params = new URLSearchParams(search)
    const view = params.get('view')
    return { view: isView(view) ? view : 'agents', id: params.get('id') ?? undefined }
}

export function viewHref(view: View, id?: string) {
    const params = new URLSearchParams()
    if (view !== 'agents') params.set('view', view)
    if (id) params.set('id', id)
    const q = params.toString()
    return q ? `/crm?${q}` : '/crm'
}
