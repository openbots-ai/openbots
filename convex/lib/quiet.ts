const MIN = 60_000

// Minutes since local midnight in `timeZone` at `now`
function localMinutes(now: number, timeZone: string) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now))
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
    return get('hour') * 60 + get('minute')
}

const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number)
    return h * 60 + m
}

// How long until quiet hours end, or 0 when they aren't on right now. Windows may wrap midnight (22:00 to 08:00).
export function msUntilQuietEnds(now: number, timeZone: string, start: string, end: string) {
    let current: number
    try {
        current = localMinutes(now, timeZone)
    } catch {
        current = localMinutes(now, 'UTC')
    }
    const s = toMinutes(start)
    const e = toMinutes(end)
    if (s === e) return 0
    const inside = s < e ? current >= s && current < e : current >= s || current < e
    if (!inside) return 0
    return (((e - current + 1440) % 1440) || 1440) * MIN
}
