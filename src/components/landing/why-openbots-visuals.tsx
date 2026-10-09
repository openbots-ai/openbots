import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useInView, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { CalendarDays, Check, Clock3, Cloud, RotateCw, Server, Sparkles } from 'lucide-react'
import { AgentAvatar } from '@/components/landing/agent-avatar'
import { cn } from '@/lib/utils'

// Animated visuals for the "Why OpenBots" cards. Each one tells a single idea at a glance and only animates while on screen.

const card = 'w-full rounded-[1.6rem] bg-white text-left text-neutral-900 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1 ring-black/8'
const ease = [0.22, 1, 0.36, 1] as const
const spring = { type: 'spring', stiffness: 380, damping: 32 } as const

// A tick that keeps counting up while the visual is on screen, waiting delays[tick % delays.length] between ticks.
// Callers derive their phase (tick % n) and loop number (tick / n) from it. Reduced motion freezes it at 0.
function useTicks(delays: readonly number[]) {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { amount: 0.4 })
    const reduce = !!useReducedMotion()
    const [tick, setTick] = useState(0)

    useEffect(() => {
        if (reduce || !inView) return
        const id = window.setTimeout(() => setTick((t) => t + 1), delays[tick % delays.length])
        return () => clearTimeout(id)
    }, [tick, inView, reduce, delays])

    return { ref, tick, reduce, inView }
}

/* ------------------------------------------------------------------ */
/* 1. Memory: facts keep arriving over months and none ever drop out   */
/* ------------------------------------------------------------------ */

const MEMORIES = [
    { emoji: '🥛', text: 'oat milk, never dairy', when: 'wk 1' },
    { emoji: '🗓️', text: 'no meetings till 9:30', when: 'wk 3' },
    { emoji: '📞', text: 'calls mom on sundays', when: 'mo 2' },
    { emoji: '✈️', text: 'aisle seat, always', when: 'mo 3' },
    { emoji: '🎂', text: "sam's birthday: may 12", when: 'mo 4' },
    { emoji: '🐶', text: "biscuit's vet: dr. lee", when: 'mo 6' },
]
const MEMORY_TIME = ['week 1', 'week 3', 'month 2', 'month 3', 'month 4', 'month 6']
const MEMORY_COUNT = [3, 18, 41, 77, 112, 164]
const MEMORY_DELAYS = [1500, 1500, 1500, 1500, 1500, 3600] as const

export function MemoryVisual() {
    const { ref, tick, reduce } = useTicks(MEMORY_DELAYS)
    const n = MEMORIES.length
    const phase = reduce ? n - 1 : tick % n
    const loop = Math.floor(tick / n)
    const shown = MEMORIES.slice(0, phase + 1).reverse()

    return (
        <div
            ref={ref}
            className={cn(card, 'max-w-[20rem] p-3.5 sm:p-4')}>
            <div className="flex items-center gap-3">
                <AgentAvatar
                    name="Pip"
                    className="size-9"
                />
                <div className="min-w-0 flex-1">
                    <p className="text-[14px] leading-tight font-semibold">Pip</p>
                    <p className="mt-0.5 flex items-center gap-1 text-[11.5px] leading-4 whitespace-nowrap text-neutral-500">
                        <span className="relative inline-flex h-4 shrink-0 overflow-hidden leading-4 tabular-nums">
                            <AnimatePresence
                                mode="popLayout"
                                initial={false}>
                                <motion.span
                                    key={MEMORY_COUNT[phase]}
                                    initial={{ y: 12, opacity: 0 }}
                                    animate={{ y: 0, opacity: 1 }}
                                    exit={{ y: -12, opacity: 0 }}
                                    transition={{ duration: 0.35, ease }}>
                                    {MEMORY_COUNT[phase]}
                                </motion.span>
                            </AnimatePresence>
                        </span>
                        memories
                    </p>
                </div>
                <span className="flex h-7 items-center gap-1.5 rounded-full bg-sky-50 px-2.5 text-[11.5px] font-medium text-sky-700 ring-1 ring-sky-200">
                    <CalendarDays className="size-3.5" />
                    <AnimatePresence
                        mode="wait"
                        initial={false}>
                        <motion.span
                            key={MEMORY_TIME[phase]}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className="whitespace-nowrap">
                            {MEMORY_TIME[phase]}
                        </motion.span>
                    </AnimatePresence>
                </span>
            </div>

            {/* Newest memory lands on top; older ones slide down and stay (the fade hints at many more below) */}
            <div className="relative mt-3.5 h-[7.75rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]">
                <AnimatePresence
                    mode="wait"
                    initial={false}>
                    <motion.div
                        key={loop}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="flex flex-col gap-1.5">
                        <AnimatePresence initial={false}>
                            {shown.map((m, k) => (
                                <motion.div
                                    key={m.text}
                                    layout
                                    initial={{ opacity: 0, y: -14, scale: 0.94 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    transition={spring}
                                    className={cn(
                                        'flex h-7 shrink-0 items-center gap-2 rounded-lg px-2 text-[12px] sm:px-2.5 transition-colors duration-700',
                                        k === 0 && !reduce ? 'bg-sky-100/80 ring-1 ring-sky-300/70' : 'bg-neutral-50 ring-1 ring-black/5',
                                    )}>
                                    <span className="text-[13px] leading-none">{m.emoji}</span>
                                    <span className="min-w-0 flex-1 truncate font-medium text-neutral-800">{m.text}</span>
                                    <span className="shrink-0 font-mono text-[11px] text-neutral-400">{m.when}</span>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </motion.div>
                </AnimatePresence>
            </div>

            <div className="mt-2.5 flex items-center gap-2.5 text-[11px] text-neutral-400">
                <span className="relative h-1.5 flex-1 rounded-full bg-neutral-100">
                    <motion.span
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-sky-200 to-sky-500"
                        animate={{ width: `${((phase + 1) / n) * 100}%` }}
                        transition={{ duration: 0.8, ease }}
                    />
                </span>
                <span className="font-medium whitespace-nowrap text-sky-700">0 forgotten</span>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* 2. Learning: correction → learned rule → a better next reply        */
/* ------------------------------------------------------------------ */

const LESSONS = [
    {
        before: "Dear Sam, I hope you're well. I'm writing to kindly confirm our 3pm meeting today.",
        fix: 'too formal, keep it short',
        rule: 'short and casual',
        after: "sam's in for 3pm 👍",
        score: [64, 79],
    },
    {
        before: 'done! booked nobu for 8pm, table for 4.',
        fix: 'ask me before you book',
        rule: 'ask before booking',
        after: 'nobu has 8pm for 4. want it?',
        score: [79, 88],
    },
    {
        before: 'reminder: dentist tomorrow at 2 🦷',
        fix: 'not after 10pm please',
        rule: 'quiet after 10pm',
        after: 'morning! dentist at 2 today 🦷',
        score: [88, 96],
    },
]
// Per lesson: first reply, your correction, it learns, the better reply
const LEARNING_DELAYS = [1400, 1400, 1500, 2800] as const

const Bubble = ({ mine, children }: { mine?: boolean; children: string }) => (
    <div className={cn('flex items-end gap-1.5', mine && 'justify-end')}>
        {!mine && <AgentAvatar name="Penny" className="size-6" />}
        <span
            className={cn(
                'max-w-[80%] rounded-[18px] px-3 py-1.5 text-[12.5px] leading-snug',
                mine ? 'rounded-br-md bg-[#0A84FF] text-white' : 'rounded-bl-md bg-[#E9E9EB] text-neutral-900',
            )}>
            {children}
        </span>
    </div>
)

function ScoreRing({ value }: { value: number }) {
    const r = 17
    return (
        <span className="relative grid size-11 shrink-0 place-items-center">
            <svg
                viewBox="0 0 44 44"
                className="absolute inset-0 -rotate-90">
                <circle
                    cx="22"
                    cy="22"
                    r={r}
                    fill="none"
                    strokeWidth="4"
                    className="stroke-violet-100"
                />
                <motion.circle
                    cx="22"
                    cy="22"
                    r={r}
                    fill="none"
                    strokeWidth="4"
                    strokeLinecap="round"
                    className="stroke-violet-500"
                    initial={false}
                    animate={{ pathLength: value / 100 }}
                    transition={{ duration: 0.9, ease }}
                />
            </svg>
            <AnimatePresence
                mode="popLayout"
                initial={false}>
                <motion.span
                    key={value}
                    initial={{ y: 8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -8, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="text-[12px] font-semibold tabular-nums">
                    {value}
                </motion.span>
            </AnimatePresence>
        </span>
    )
}

export function LearningVisual() {
    const { ref, tick, reduce } = useTicks(LEARNING_DELAYS)
    const steps = LEARNING_DELAYS.length
    const phase = reduce ? 3 : tick % steps
    const lesson = LESSONS[reduce ? 0 : Math.floor(tick / steps) % LESSONS.length]
    const learned = phase >= 2

    // The thread: the first reply and your correction, then (once learned) just the better reply
    const messages =
        phase < 3
            ? [{ id: 'before', mine: false, text: lesson.before }, ...(phase >= 1 ? [{ id: 'fix', mine: true, text: lesson.fix }] : [])]
            : [{ id: 'after', mine: false, text: lesson.after }]

    return (
        <div
            ref={ref}
            className={cn(card, 'max-w-[20rem] overflow-hidden')}>
            <div className="relative h-[8.5rem] px-3.5 pt-3.5">
                <AnimatePresence
                    mode="popLayout"
                    initial={false}>
                    {phase === 3 && (
                        <motion.p
                            key={`next-${lesson.rule}`}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3, delay: 0.1 }}
                            className="mb-2 flex items-center justify-center gap-1 text-[11px] font-medium text-violet-600">
                            <Sparkles className="size-3" />
                            next time
                        </motion.p>
                    )}
                </AnimatePresence>
                <div className="flex flex-col gap-1.5">
                    <AnimatePresence
                        mode="popLayout"
                        initial={false}>
                        {messages.map((m) => (
                            <motion.div
                                key={`${lesson.rule}-${m.id}`}
                                layout
                                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -16, transition: { duration: 0.25 } }}
                                transition={spring}
                                style={{ originX: m.mine ? 1 : 0 }}>
                                <Bubble mine={m.mine}>
                                    {m.text}
                                </Bubble>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </div>
                <AnimatePresence>
                    {phase === 3 && (
                        <motion.p
                            key={`sent-${lesson.rule}`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, transition: { duration: 0.15 } }}
                            transition={{ duration: 0.3, delay: 0.45 }}
                            className="mt-1.5 flex items-center gap-1 pl-[30px] text-[11px] text-neutral-400">
                            <Check className="size-3 text-violet-500" strokeWidth={3} />
                            sent, no edits needed
                        </motion.p>
                    )}
                </AnimatePresence>
            </div>

            {/* The loop: what it learned, and how often it now gets things right first time */}
            <div className="flex items-center gap-3 border-t border-neutral-100 bg-violet-50/50 px-3.5 py-3">
                <motion.span
                    className={cn('grid size-8 shrink-0 place-items-center rounded-full transition-colors duration-500', learned ? 'bg-violet-500 text-white' : 'bg-violet-100 text-violet-500')}
                    animate={{ rotate: learned && !reduce ? 360 : 0 }}
                    transition={learned ? { duration: 0.8, ease } : { duration: 0 }}>
                    <RotateCw className="size-4" />
                </motion.span>
                <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-neutral-500">{learned ? 'learned' : 'listening for feedback'}</p>
                    <div className="relative h-[18px]">
                        <AnimatePresence
                            mode="wait"
                            initial={false}>
                            <motion.p
                                key={learned ? lesson.rule : 'waiting'}
                                initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                exit={{ opacity: 0, y: -6 }}
                                transition={{ duration: 0.3 }}
                                className={cn('truncate text-[12.5px] font-semibold', learned ? 'text-violet-700' : 'text-neutral-300')}>
                                {learned ? lesson.rule : '···'}
                            </motion.p>
                        </AnimatePresence>
                    </div>
                </div>
                <div className="flex flex-col items-center">
                    <ScoreRing value={learned ? lesson.score[1] : lesson.score[0]} />
                </div>
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* 3. Always on: a day sweeps round the clock while work gets done     */
/* ------------------------------------------------------------------ */

const DAY_MS = 9000
const TASKS = [
    { at: 7 * 60, label: 'brief sent' },
    { at: 13 * 60 + 20, label: 'invoice chased' },
    { at: 22 * 60 + 5, label: 'dinner booked' },
].map((t) => ({ ...t, t: t.at / 1440, time: `${String(Math.floor(t.at / 60)).padStart(2, '0')}:${String(t.at % 60).padStart(2, '0')}` }))
const START_DAY = 214

const clockText = (v: number) => {
    const mins = Math.floor((v * 1440) / 5) * 5
    return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
}

export function AlwaysOnVisual() {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { amount: 0.4 })
    const reduce = !!useReducedMotion()
    const t = useMotionValue(reduce ? 0.96 : 0.18)
    const [day, setDay] = useState(START_DAY)
    const [done, setDone] = useState(reduce ? TASKS.length : 0)

    // Advance the day while on screen; work picks up exactly where it paused
    useEffect(() => {
        if (reduce || !inView) return
        let raf = 0
        let last = performance.now()
        const frame = (now: number) => {
            let v = t.get() + (now - last) / DAY_MS
            last = now
            if (v >= 1) {
                v -= 1
                setDay((d) => d + 1)
            }
            t.set(v)
            setDone(TASKS.filter((task) => task.t <= v).length)
            raf = requestAnimationFrame(frame)
        }
        raf = requestAnimationFrame(frame)
        return () => cancelAnimationFrame(raf)
    }, [inView, reduce, t])

    const rotate = useTransform(t, (v) => v * 360)
    const time = useTransform(t, clockText)
    const R = 52

    return (
        <div
            ref={ref}
            className="flex w-full max-w-[20rem] items-center gap-2.5 sm:gap-3">
            {/* 24h dial: midnight at the top, the arc fills as the day passes */}
            <div className="relative size-[6.5rem] shrink-0 rounded-full sm:size-[8.5rem] bg-white shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1 ring-black/8">
                <svg
                    viewBox="0 0 136 136"
                    className="absolute inset-0">
                    {Array.from({ length: 24 }, (_, h) => {
                        const a = (h / 24) * Math.PI * 2
                        const long = h % 6 === 0
                        const r1 = long ? 38 : 41
                        return (
                            <line
                                key={h}
                                x1={68 + Math.sin(a) * r1}
                                y1={68 - Math.cos(a) * r1}
                                x2={68 + Math.sin(a) * 44}
                                y2={68 - Math.cos(a) * 44}
                                strokeLinecap="round"
                                strokeWidth={long ? 1.6 : 1}
                                className={long ? 'stroke-neutral-300' : 'stroke-neutral-200'}
                            />
                        )
                    })}
                    <circle
                        cx="68"
                        cy="68"
                        r={R}
                        fill="none"
                        strokeWidth="7"
                        className="stroke-emerald-50"
                    />
                    <motion.circle
                        cx="68"
                        cy="68"
                        r={R}
                        fill="none"
                        strokeWidth="7"
                        strokeLinecap="round"
                        transform="rotate(-90 68 68)"
                        className="stroke-emerald-300"
                        style={{ pathLength: t }}
                    />
                    {TASKS.map((task, k) => {
                        const a = task.t * Math.PI * 2
                        return (
                            <circle
                                key={task.time}
                                cx={68 + Math.sin(a) * R}
                                cy={68 - Math.cos(a) * R}
                                r="4.5"
                                strokeWidth="2"
                                className={cn('stroke-white transition-colors duration-300', k < done ? 'fill-emerald-600' : 'fill-neutral-300')}
                            />
                        )
                    })}
                </svg>
                {/* The sweeping head of the arc */}
                <motion.div
                    className="absolute inset-0"
                    style={{ rotate }}>
                    <span className="absolute top-[6.6%] left-1/2 size-3 -translate-x-1/2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.18)]" />
                </motion.div>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span className="font-mono text-[14px] font-semibold tracking-tight sm:text-[17px] text-neutral-900 tabular-nums">{time}</motion.span>
                    <span className="relative mt-0.5 flex h-4 items-center overflow-hidden text-[11px] text-neutral-500">
                        day&nbsp;
                        <AnimatePresence
                            mode="popLayout"
                            initial={false}>
                            <motion.span
                                key={day}
                                initial={{ y: 10, opacity: 0 }}
                                animate={{ y: 0, opacity: 1 }}
                                exit={{ y: -10, opacity: 0 }}
                                transition={{ duration: 0.35, ease }}
                                className="tabular-nums">
                                {day}
                            </motion.span>
                        </AnimatePresence>
                    </span>
                </div>
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="flex w-fit items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11.5px] font-medium whitespace-nowrap text-emerald-700 shadow-sm ring-1 ring-emerald-900/10">
                    <span className="relative flex size-2">
                        {!reduce && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />}
                        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                    </span>
                    online · 24/7
                </span>
                {TASKS.map((task, k) => {
                    const isDone = k < done
                    return (
                        <motion.div
                            key={task.time}
                            animate={{ scale: isDone ? 1 : 0.98, opacity: isDone ? 1 : 0.6 }}
                            transition={spring}
                            className="flex items-center gap-1.5 rounded-xl bg-white px-2 py-1.5 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.25)] ring-1 ring-black/6">
                            <span className={cn('grid size-5 shrink-0 place-items-center rounded-full transition-colors duration-300', isDone ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-400')}>
                                <AnimatePresence
                                    mode="wait"
                                    initial={false}>
                                    <motion.span
                                        key={isDone ? 'done' : 'todo'}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        exit={{ scale: 0 }}
                                        transition={spring}>
                                        {isDone ? <Check className="size-3" strokeWidth={3} /> : <Clock3 className="size-3" />}
                                    </motion.span>
                                </AnimatePresence>
                            </span>
                            <span className="min-w-0">
                                <span className="block font-mono text-[11px] leading-tight text-neutral-400">{task.time}</span>
                                <span className="block truncate text-[12px] leading-tight font-medium text-neutral-800">{task.label}</span>
                            </span>
                        </motion.div>
                    )
                })}
            </div>
        </div>
    )
}

/* ------------------------------------------------------------------ */
/* 4. Hosting: the same team lands in our cloud or on your servers     */
/* ------------------------------------------------------------------ */

const HOSTS = [
    { id: 'cloud', label: 'openbots cloud', Icon: Cloud, note: 'managed for you', perks: ['updates', 'scaling', 'backups'] },
    { id: 'self', label: 'self-hosted', Icon: Server, note: 'your servers', perks: ['your servers', 'same platform'] },
] as const
const HOSTING_DELAYS = [3400, 2600] as const

const Team = () => (
    <motion.span
        layoutId="why-hosting-team"
        transition={spring}
        className="flex items-center gap-1.5 rounded-full bg-white py-1 pr-2 pl-1 shadow-[0_6px_16px_-6px_rgba(0,0,0,0.3)] ring-1 ring-black/8">
        <span className="flex -space-x-2">
            {['Pip', 'Penny', 'Mochi'].map((name) => (
                <AgentAvatar
                    key={name}
                    name={name}
                    className="size-6 ring-2 ring-white"
                />
            ))}
        </span>
        <span className="size-1.5 rounded-full bg-emerald-500" />
    </motion.span>
)

const Rack = ({ active }: { active: boolean }) => (
    <span className="flex w-16 flex-col gap-1">
        {[0, 1, 2].map((u) => (
            <span
                key={u}
                className="flex h-3.5 items-center gap-1 rounded-[5px] bg-neutral-100 px-1.5 ring-1 ring-black/5">
                <span className="h-1 flex-1 rounded-full bg-neutral-200" />
                <motion.span
                    className="size-1.5 rounded-full bg-emerald-500"
                    animate={active ? { opacity: [1, 0.25, 1] } : { opacity: 0.35 }}
                    transition={active ? { duration: 1.1, repeat: Infinity, delay: u * 0.3 } : { duration: 0.3 }}
                />
            </span>
        ))}
    </span>
)

export function HostingVisual() {
    const { ref, tick, reduce } = useTicks(HOSTING_DELAYS)
    const active = reduce ? 0 : tick % HOSTS.length
    const host = HOSTS[active]

    return (
        <div
            ref={ref}
            className="flex w-full max-w-[20rem] flex-col items-center gap-3.5">
            {/* Segmented toggle */}
            <div className="flex w-full rounded-full bg-white p-1 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.3)] ring-1 ring-black/8">
                {HOSTS.map((h, k) => (
                    <span
                        key={h.id}
                        className={cn('relative flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 text-[12px] font-medium transition-colors duration-300', k === active ? 'text-white' : 'text-neutral-500')}>
                        {k === active && (
                            <motion.span
                                layoutId="why-hosting-pill"
                                transition={spring}
                                className="absolute inset-0 rounded-full bg-neutral-900"
                            />
                        )}
                        <h.Icon className="relative size-3.5" />
                        <span className="relative whitespace-nowrap">{h.label}</span>
                    </span>
                ))}
            </div>

            {/* Two homes, one platform: the same team hops between them */}
            <div className="grid w-full grid-cols-2 gap-3">
                {HOSTS.map((h, k) => {
                    const on = k === active
                    return (
                        <motion.div
                            key={h.id}
                            animate={{ opacity: on ? 1 : 0.55, scale: on ? 1 : 0.96 }}
                            transition={{ duration: 0.4, ease }}
                            className={cn(
                                'relative flex flex-col items-center gap-2 rounded-[1.25rem] bg-white px-2 pt-3 pb-2.5 ring-1 transition-shadow duration-500',
                                on ? 'shadow-[0_20px_40px_-16px_rgba(180,83,9,0.35)] ring-amber-300' : 'shadow-sm ring-black/8',
                            )}>
                            {h.id === 'cloud' && (
                                <span className="absolute -top-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] leading-tight font-medium whitespace-nowrap text-white shadow-sm">
                                    <Sparkles className="size-3" />
                                    recommended
                                </span>
                            )}
                            <span className="grid h-12 place-items-center">
                                {h.id === 'cloud' ? (
                                    <Cloud
                                        className={cn('size-12 transition-colors duration-500', on ? 'fill-amber-100 text-amber-400' : 'fill-neutral-50 text-neutral-300')}
                                        strokeWidth={1.4}
                                    />
                                ) : (
                                    <Rack active={on} />
                                )}
                            </span>
                            <span className="grid h-10 w-full place-items-center rounded-xl border border-dashed border-neutral-200">
                                {on && <Team />}
                            </span>
                            <span className="text-[11px] text-neutral-500">{h.note}</span>
                        </motion.div>
                    )
                })}
            </div>

            <div className="h-6">
                <AnimatePresence
                    mode="wait"
                    initial={false}>
                    <motion.div
                        key={host.id}
                        className="flex items-center gap-1.5"
                        initial="hidden"
                        animate="shown"
                        exit="hidden"
                        variants={{ shown: { transition: { staggerChildren: 0.06 } }, hidden: {} }}>
                        {host.perks.map((p) => (
                            <motion.span
                                key={p}
                                variants={{ hidden: { opacity: 0, y: 6 }, shown: { opacity: 1, y: 0 } }}
                                transition={{ duration: 0.25 }}
                                className="flex items-center gap-1 rounded-full bg-white/80 px-2 py-1 text-[11.5px] leading-none font-medium whitespace-nowrap text-neutral-700 ring-1 ring-amber-900/10">
                                <Check
                                    className="size-3 text-amber-600"
                                    strokeWidth={3}
                                />
                                {p}
                            </motion.span>
                        ))}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}
