export function relativeTime(ts: number, now: number) {
    const s = Math.round((now - ts) / 1000)
    if (s < 60) return 'just now'
    const m = Math.round(s / 60)
    if (m < 60) return `${m}m ago`
    const h = Math.round(m / 60)
    if (h < 24) return `${h}h ago`
    const d = Math.round(h / 24)
    if (d < 7) return `${d}d ago`
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export const formatWhen = (ts: number) => new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

// "2026-10-06" (a UTC day key) → "Oct 6"
export const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
