// The dashboard lives at exactly this path (trailing slashes allowed)
export const DASHBOARD_PATH = '/dashboard'

export const isCrmPath = (path: string) => (path.replace(/\/+$/, '') || '/') === DASHBOARD_PATH
