import { isPublicPath } from '@convex/lib/visits'

// Where the visit counter lives: the Convex deployment's HTTP URL (convex/http.ts → /visit)
const siteUrl = (import.meta.env.VITE_CONVEX_SITE_URL as string | undefined) ?? (import.meta.env.VITE_CONVEX_URL as string | undefined)?.replace(/\.convex\.cloud\b/, '.convex.site')

const SEEN_KEY = 'openbots:visit-day'
let sent = false

// Whether this browser hadn't visited yet today (UTC). Only today's date is kept, never an ID, so the count of new
// visitors per day is all anyone can learn from it.
function firstVisitToday(today: string) {
    try {
        if (localStorage.getItem(SEEN_KEY) === today) return false
        localStorage.setItem(SEEN_KEY, today)
    } catch {
        // Storage blocked: count the view, but not as a visitor, so private windows can't inflate the count
        return false
    }
    return true
}

// Counts one view of a public page. Skipped for browsers that ask not to be tracked and for automated ones.
export function recordVisit(path: string) {
    if (sent || !siteUrl || !isPublicPath(path)) return
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean }
    if (nav.doNotTrack === '1' || nav.globalPrivacyControl || nav.webdriver) return
    sent = true
    const body = JSON.stringify({ path, newVisitor: firstVisitToday(new Date().toISOString().slice(0, 10)) })
    const url = `${siteUrl.replace(/\/+$/, '')}/visit`
    try {
        if (nav.sendBeacon?.(url, new Blob([body], { type: 'text/plain' }))) return
        void fetch(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {})
    } catch {
        // A missed count never breaks the page
    }
}
