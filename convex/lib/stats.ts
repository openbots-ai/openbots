export const DAY = 86_400_000

// Counts timestamps per UTC day for the `days` days ending today, oldest first
export function bucketByDay(times: number[], days: number, now: number) {
    const today = Math.floor(now / DAY)
    const counts = new Array<number>(days).fill(0)
    for (const t of times) {
        const i = days - 1 - (today - Math.floor(t / DAY))
        if (i >= 0 && i < days) counts[i]++
    }
    return counts.map((count, i) => ({
        day: new Date((today - (days - 1 - i)) * DAY).toISOString().slice(0, 10),
        count,
    }))
}
