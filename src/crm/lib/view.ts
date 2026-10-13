import { DASHBOARD_PATH } from './route'

// No conversations or contacts: those live only on your agent, never in the dashboard
export const VIEWS = ['agents', 'knowledge', 'numbers', 'models', 'analytics', 'connections', 'settings'] as const
export type View = (typeof VIEWS)[number]

const isView = (v: string | null): v is View => (VIEWS as readonly (string | null)[]).includes(v)

// Views live in the query string so the path itself never leaves /dashboard
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
    return q ? `${DASHBOARD_PATH}?${q}` : DASHBOARD_PATH
}
