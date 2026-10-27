import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { Bell, CalendarClock, Check, Eye, FileText, Monitor } from 'lucide-react'
import { AgentAvatar } from '@/components/landing/agent-avatar'
import { cn } from '@/lib/utils'

// Visuals for the "Why OpenBots" cards, built from the product's own UI: iMessage threads, Connections and the
// engine's log. Each one has a single moment, loops only while on screen, and holds a
// sensible still frame when reduced motion is on.

const card = 'w-full rounded-[1.6rem] bg-white text-left text-neutral-900 shadow-[0_14px_32px_-14px_rgba(0,0,0,0.22)] ring-1 ring-black/8'
const ease = [0.22, 1, 0.36, 1] as const
const spring = { type: 'spring', stiffness: 380, damping: 32 } as const
const bubbleSpring = { type: 'spring', stiffness: 380, damping: 36, mass: 0.9 } as const

// A tick that counts up while the visual is on screen, waiting delays[tick % delays.length] between ticks.
// Callers derive their phase from it. Reduced motion freezes it, and callers pick a finished frame.
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

    return { ref, tick, reduce }
}

// Status chip colors copied from the dashboard
const OnlineBadge = () => (
    <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/15 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700">
        <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        Online
    </span>
)

// Compact chat header: who you're texting
const ThreadHeader = ({ name, role, aside }: { name: string; role: string; aside?: ReactNode }) => (
    <div className="flex items-center gap-2.5 border-b border-neutral-100 px-4 py-2.5">
        <AgentAvatar
            name={name}
            className="size-8"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {name} <span className="font-normal text-neutral-400">· {role}</span>
        </span>
        {aside}
    </div>
)

// iMessage bubble, same classes as the phone demo (the tail needs a white backdrop)
const Bubble = ({ mine, tail = true, children, className }: { mine?: boolean; tail?: boolean; children: ReactNode; className?: string }) => (
    <p
        className={cn(
            'imsg relative max-w-[82%] rounded-[18px] px-3 py-1.5 text-[13px] leading-snug',
            mine ? 'imsg-me bg-[#0A84FF] text-white' : 'imsg-them bg-[#E9E9EB] text-black',
            tail && 'imsg-tail',
            className,
        )}>
        {children}
    </p>
)

const TypingDots = () => (
    <span className="imsg imsg-them imsg-tail relative flex gap-1 rounded-[18px] bg-[#E9E9EB] px-3 py-2.5">
        {[0, 0.2, 0.4].map((delay) => (
            <motion.span
                key={delay}
                className="size-1.5 rounded-full bg-neutral-500"
                animate={{ opacity: [0.3, 0.85, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut', delay }}
            />
        ))}
    </span>
)

// A message row that enters the way iMessage does: yours rise, theirs grow from the tail
const Msg = ({ mine, children, className }: { mine?: boolean; children: ReactNode; className?: string }) => (
    <motion.div
        layout="position"
        initial={mine ? { opacity: 0, y: 18, scale: 0.97 } : { opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -12, transition: { duration: 0.2 } }}
        transition={{ default: bubbleSpring, opacity: { duration: 0.2 } }}
        style={{ originX: mine ? 1 : 0, originY: 1 }}
        className={cn('flex flex-col', mine ? 'items-end' : 'items-start', className)}>
        {children}
    </motion.div>
)

/* 1. Notes: Biscuit's reply uses what you wrote in its notes (Knowledge in the dashboard) */

const MEMORY_DELAYS = [1300, 1100, 1300, 3800] as const

export function MemoryVisual() {
    const { ref, tick, reduce } = useTicks(MEMORY_DELAYS)
    // 0 your ask, 1 typing, 2 the reply, 3 the notes it used light up
    const phase = reduce ? 3 : tick % MEMORY_DELAYS.length
    const loop = Math.floor(tick / MEMORY_DELAYS.length)
    const recalled = phase >= 3
    const mark = (text: string) => (
        <span className={cn('rounded-[4px] whitespace-nowrap transition-colors duration-500', recalled && 'bg-primary/10 text-primary')}>{text}</span>
    )

    return (
        <div
            ref={ref}
            className={cn(card, '@container max-w-[25rem] overflow-hidden')}>
            <ThreadHeader
                name="Biscuit"
                role="Meal Planner"
            />
            <div className="h-[11rem] px-4 pt-2.5">
                <p className="text-center text-[11px] text-neutral-400">
                    <span className="font-medium text-neutral-500">Today</span> 6:12 PM
                </p>
                <AnimatePresence
                    mode="popLayout"
                    initial={false}>
                    <motion.div
                        key={loop}
                        exit={{ opacity: 0, transition: { duration: 0.25 } }}
                        className="mt-2 flex flex-col gap-2">
                        <AnimatePresence initial={false}>
                            <Msg
                                key="ask"
                                mine>
                                <Bubble mine>mom's here thursday. dinners?</Bubble>
                            </Msg>
                            {phase === 1 && (
                                <Msg key="typing">
                                    <TypingDots />
                                </Msg>
                            )}
                            {phase >= 2 && (
                                <Msg key="reply">
                                    <Bubble>
                                        5 {mark('veggie')} dinners, $46 cart. thursday's a {mark('dairy‑free')} risotto for mom 🥕
                                    </Bubble>
                                    <AnimatePresence>
                                        {recalled && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 6 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0 }}
                                                transition={{ duration: 0.4, ease }}
                                                className="mt-2 flex items-center gap-1.5 text-[11px] whitespace-nowrap text-neutral-500">
                                                <span className="flex items-center gap-1">
                                                    <FileText className="text-primary size-3.5" />
                                                    <span className="@max-sm:hidden">from your notes</span>
                                                </span>
                                                {['vegetarian', 'mom: no dairy'].map((fact, k) => (
                                                    <motion.span
                                                        key={fact}
                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ ...spring, delay: 0.15 + k * 0.12 }}
                                                        className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700 ring-1 ring-black/5">
                                                        {fact}
                                                    </motion.span>
                                                ))}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </Msg>
                            )}
                        </AnimatePresence>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    )
}

/* 2. Reminders: you ask Mochi to remind you, it says when, and at that time it texts you first */

const REMINDER_DELAYS = [1500, 1200, 2200, 3800] as const

export function RemindersVisual() {
    const { ref, tick, reduce } = useTicks(REMINDER_DELAYS)
    // 0 your ask, 1 typing, 2 the reminder is set, 3 six o'clock: it texts you
    const phase = reduce ? 3 : tick % REMINDER_DELAYS.length
    const loop = Math.floor(tick / REMINDER_DELAYS.length)

    return (
        <div
            ref={ref}
            className="@container flex w-full max-w-[25rem] flex-col gap-2.5">
            <div className={cn(card, 'overflow-hidden')}>
                <ThreadHeader
                    name="Mochi"
                    role="Personal Assistant"
                />
                <div className="flex h-[10rem] flex-col justify-end overflow-hidden px-4 pb-3 [mask-image:linear-gradient(to_bottom,transparent,black_25%)]">
                    <AnimatePresence
                        mode="popLayout"
                        initial={false}>
                        <motion.div
                            key={loop}
                            exit={{ opacity: 0, transition: { duration: 0.25 } }}
                            className="flex flex-col gap-2">
                            <AnimatePresence initial={false}>
                                <Msg
                                    key="ask"
                                    mine>
                                    <Bubble mine>remind me to call mom at 6</Bubble>
                                </Msg>
                                {phase === 1 && (
                                    <Msg key="typing">
                                        <TypingDots />
                                    </Msg>
                                )}
                                {phase >= 2 && (
                                    <Msg key="set">
                                        <Bubble tail={phase < 3}>done, i'll text you at 6:00 PM ☕️</Bubble>
                                    </Msg>
                                )}
                                {phase >= 3 && (
                                    <motion.p
                                        key="time"
                                        layout="position"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="text-center text-[11px] text-neutral-400">
                                        <span className="font-medium text-neutral-500">Today</span> 6:00 PM
                                    </motion.p>
                                )}
                                {phase >= 3 && (
                                    <Msg key="nudge">
                                        <Bubble>time to call mom 📞</Bubble>
                                    </Msg>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* What Mochi has scheduled: the reminder joins a watch that's already running */}
            <div className={cn(card, 'rounded-2xl px-4 py-2.5')}>
                <div className="flex items-center gap-2 text-[12px]">
                    <CalendarClock className="size-3.5 text-neutral-400" />
                    <span className="font-semibold">Scheduled</span>
                </div>
                <div className="mt-2 space-y-1 text-[12px] leading-snug">
                    <p className="flex items-center gap-2 text-neutral-500">
                        <Eye className="size-3 shrink-0 text-neutral-400" />
                        <span className="truncate">watch: concert tickets go on sale</span>
                        <span className="ml-auto shrink-0 text-[11px]">every hour</span>
                    </p>
                    <div className="h-[22px]">
                        <AnimatePresence initial={false}>
                            {phase === 2 && (
                                <motion.p
                                    initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                    transition={{ duration: 0.45, ease }}
                                    className="bg-primary/6 -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 font-medium text-neutral-900">
                                    <Bell className="text-primary size-3 shrink-0" />
                                    <span className="truncate">reminder: call mom</span>
                                    <span className="text-primary ml-auto shrink-0 text-[11px] font-normal">6:00 PM</span>
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* 3. Your computer: the engine runs on a computer you leave on, with your own keys, and its log shows the work */

// Lines the engine really prints
const LOG = ['Text from …4567 to Mochi (you)', 'Mochi replied to …4567 (Claude Sonnet 5.5)', 'Mochi sent a reminder to …4567', 'Mochi sent a watch update to …4567'] as const
const LOG_DELAYS = [1600, 1600, 1600, 2600] as const
const KEYS = ['Anthropic', 'OpenAI', 'Twilio'] as const

export function ComputerVisual() {
    const { ref, tick, reduce } = useTicks(LOG_DELAYS)
    // The newest few log lines, the latest at the bottom
    const at = reduce ? LOG.length - 1 : tick
    const lines = [at - 2, at - 1, at].filter((k) => k >= 0)

    return (
        <div
            ref={ref}
            className="@container flex w-full max-w-[25rem] flex-col gap-2.5">
            {/* The computer as Connections shows it */}
            <div className={cn(card, 'rounded-2xl px-4 py-3')}>
                <div className="flex items-center gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-neutral-50 ring-1 ring-black/6">
                        <Monitor className="size-4 text-neutral-700" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">Mac mini</span>
                        <span className="block truncate text-[11px] text-neutral-500">Your computer · texts through iMessage</span>
                    </span>
                    <OnlineBadge />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-neutral-500">Your keys</span>
                    {KEYS.map((k) => (
                        <span
                            key={k}
                            className="flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700 ring-1 ring-black/5">
                            <Check
                                className="size-2.5 text-emerald-600"
                                strokeWidth={3.5}
                            />
                            {k}
                        </span>
                    ))}
                </div>
            </div>

            {/* The engine's own log on that computer */}
            <div className="w-full rounded-2xl bg-neutral-900 px-4 py-3 text-left font-mono text-[11px] text-neutral-300 shadow-[0_14px_32px_-14px_rgba(0,0,0,0.35)]">
                <p className="mb-1.5 text-neutral-500">openbots engine</p>
                <div className="h-[4.5rem] overflow-hidden">
                    <AnimatePresence
                        mode="popLayout"
                        initial={false}>
                        {lines.map((k) => (
                            <motion.p
                                key={k}
                                layout="position"
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, transition: { duration: 0.15 } }}
                                transition={{ duration: 0.3, ease }}
                                className="truncate leading-6">
                                <span className="text-emerald-400">›</span> {LOG[k % LOG.length]}
                            </motion.p>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
