import { useEffect, useRef, useState, type RefObject } from 'react'
import { useInView } from 'motion/react'

// Advances one step after each delay while the mock is on screen, holds on the last step, then loops.
export function useLoopedSteps(ref: RefObject<HTMLElement | null>, delays: number[], hold = 3200) {
    const inView = useInView(ref, { amount: 0.4 })
    const [reduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const [step, setStep] = useState(reduceMotion ? delays.length : 0)
    const delaysRef = useRef(delays)

    useEffect(() => {
        delaysRef.current = delays
    })

    useEffect(() => {
        if (reduceMotion || !inView) return
        const last = delaysRef.current.length
        const id = window.setTimeout(() => setStep((s) => (s >= last ? 0 : s + 1)), step >= last ? hold : delaysRef.current[step])
        return () => clearTimeout(id)
    }, [inView, step, hold, reduceMotion])

    return step
}
