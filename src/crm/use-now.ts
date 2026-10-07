import { useEffect, useState } from 'react'

// A clock that ticks once a minute, so relative times stay fresh without calling Date.now() in render
export function useNow(intervalMs = 60_000) {
    const [now, setNow] = useState(() => Date.now())
    useEffect(() => {
        const t = setInterval(() => setNow(Date.now()), intervalMs)
        return () => clearInterval(t)
    }, [intervalMs])
    return now
}
