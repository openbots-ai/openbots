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

// Rough token count for English text (about four characters per token); enough for usage estimates
export const estimateTokens = (text: string) => Math.ceil(text.length / 4)

// Fixed instructions every reply carries on top of the agent's own prompt
export const SYSTEM_TOKENS = 350

type Line = { from: 'contact' | 'agent'; body: string; at: number }

// Estimated tokens for one conversation's agent replies: each reply reads the system text, the agent's
// prompt and everything said before it (input), then writes its own text (output). Only replies at or
// after `since` count.
export function conversationTokens(lines: Line[], promptTokens: number, since = 0) {
    let history = 0
    let input = 0
    let output = 0
    for (const line of [...lines].sort((a, b) => a.at - b.at)) {
        const tokens = estimateTokens(line.body)
        if (line.from === 'agent' && line.at >= since) {
            input += SYSTEM_TOKENS + promptTokens + history
            output += tokens
        }
        history += tokens
    }
    return { input, output }
}
