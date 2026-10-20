import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useInView, useReducedMotion } from 'motion/react'
import { AlarmClock, BookOpen, Check, ChevronRight, Cloud, Laptop, Plus } from 'lucide-react'
import { AgentAvatar } from '@/components/landing/agent-avatar'
import { cn } from '@/lib/utils'

// Visuals for the "Why OpenBots" cards, built from the product's own UI: iMessage threads, the conversation list,
// dashboard-style docs and settings rows. Each one has a single moment, loops only while on screen, and holds a
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
const LiveBadge = () => (
    <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-emerald-600/15 bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700">
        <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
        </span>
        Live
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

/* 1. Knowledge: Biscuit's reply quietly uses what's in the docs you gave it */

const KNOWLEDGE_DELAYS = [1300, 1100, 1300, 3800] as const

export function KnowledgeVisual() {
    const { ref, tick, reduce } = useTicks(KNOWLEDGE_DELAYS)
    // 0 your ask, 1 typing, 2 the reply, 3 what it read in its docs lights up
    const phase = reduce ? 3 : tick % KNOWLEDGE_DELAYS.length
    const loop = Math.floor(tick / KNOWLEDGE_DELAYS.length)
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
                                                    <BookOpen className="text-primary size-3.5" />
                                                    <span className="@max-sm:hidden">from its docs</span>
                                                </span>
                                                {[
                                                    ['vegetarian', 'food rules'],
                                                    ['mom: no dairy', 'family'],
                                                ].map(([fact, when], k) => (
                                                    <motion.span
                                                        key={fact}
                                                        initial={{ opacity: 0, scale: 0.9 }}
                                                        animate={{ opacity: 1, scale: 1 }}
                                                        transition={{ ...spring, delay: 0.15 + k * 0.12 }}
                                                        className="rounded-full bg-neutral-100 px-2 py-0.5 font-medium text-neutral-700 ring-1 ring-black/5">
                                                        {fact} <span className="font-normal text-neutral-400">· {when}</span>
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

/* 2. Reminders: you text Mochi a reminder, it lands in its follow-ups, and at 5 Mochi texts you first */

const REMINDER_DELAYS = [1800, 1400, 1700, 3600] as const

export function RemindersVisual() {
    const { ref, tick, reduce } = useTicks(REMINDER_DELAYS)
    // 0 your ask, 1 its reply, 2 the reminder is saved, 3 at 5pm it texts you first
    const phase = reduce ? 3 : tick % REMINDER_DELAYS.length
    const saved = phase >= 2

    return (
        <div
            ref={ref}
            className="@container flex w-full max-w-[25rem] flex-col gap-2.5">
            <div className={cn(card, 'overflow-hidden')}>
                {/* Newest at the bottom like iMessage; older bubbles scroll up under the fade */}
                <div className="flex h-[8rem] flex-col justify-end overflow-hidden px-4 pb-3 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]">
                    <AnimatePresence
                        mode="popLayout"
                        initial={false}>
                        {phase < 3 && (
                            <Msg
                                key="ask"
                                mine>
                                <Bubble
                                    mine
                                    tail={phase < 1}>
                                    remind me at 5 to call the dentist
                                </Bubble>
                            </Msg>
                        )}
                        {phase >= 1 && phase < 3 && (
                            <Msg
                                key="ok"
                                className="mt-2">
                                <Bubble>got it, i’ll text you at 5 ☕️</Bubble>
                            </Msg>
                        )}
                        {phase === 3 && (
                            <motion.p
                                key="later"
                                layout="position"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="mb-2 text-center text-[11px] text-neutral-400">
                                <span className="font-medium text-neutral-500">Today</span> 5:00 PM
                            </motion.p>
                        )}
                        {phase === 3 && (
                            <Msg key="nudge">
                                <Bubble>it’s 5: time to call the dentist 🦷</Bubble>
                            </Msg>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Mochi's follow-ups, gaining the one you just asked for */}
            <div className={cn(card, 'rounded-2xl px-4 py-2.5')}>
                <div className="flex items-center gap-2 text-[12px]">
                    <AlarmClock className="size-3.5 text-neutral-400" />
                    <span className="font-semibold">Mochi's follow-ups</span>
                    <span className="ml-auto text-[11px] text-neutral-400">{saved ? 'Added just now' : '1 scheduled'}</span>
                </div>
                <div className="mt-2 space-y-1 text-[12px] leading-snug">
                    <p className="flex items-center gap-2 text-neutral-500">
                        <span className="size-1 shrink-0 rounded-full bg-neutral-300" />
                        weekdays 8:00 AM · morning check-in
                    </p>
                    <div className="h-[22px]">
                        <AnimatePresence initial={false}>
                            {saved && (
                                <motion.p
                                    initial={{ opacity: 0, y: 6, filter: 'blur(3px)' }}
                                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                                    exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                    transition={{ duration: 0.45, ease }}
                                    className="bg-primary/6 -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-0.5 font-medium text-neutral-900">
                                    <Plus
                                        className="text-primary size-3 shrink-0"
                                        strokeWidth={3}
                                    />
                                    <span className="truncate">today 5:00 PM · call the dentist</span>
                                    <span className="text-primary ml-auto shrink-0 text-[11px] font-normal">from your text</span>
                                </motion.p>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    )
}

/* 3. Always on: the conversation list keeps updating on its own, morning to the middle of the night */

const ROLES: Record<string, string> = {
    Mochi: 'Personal Assistant',
    Rishi: 'Deal Hunter',
    Lulu: 'Trip Planner',
    Biscuit: 'Meal Planner',
    Tofu: 'Weekend Planner',
}
const UPDATES = [
    { name: 'Tofu', time: '3:10 AM', text: 'ramen spot opened saturday bookings. grabbed 1:30 🐯' },
    { name: 'Mochi', time: '7:02 AM', text: 'morning brief: 3 meetings, rain at 5, bring a jacket ☕️' },
    { name: 'Rishi', time: '11:30 AM', text: 'those headphones dropped to $89. link saved 🐶' },
    { name: 'Lulu', time: '2:15 PM', text: 'checked you in for friday. seat 14a, window ☀️' },
    { name: 'Biscuit', time: '6:40 PM', text: 'groceries ordered, arriving at 7. used the pantry first 🥕' },
    { name: 'Mochi', time: '11:48 PM', text: 'that flight you asked me to watch dropped to $212 ☕️' },
]
const ROWS = 4
const ALWAYS_DELAYS = [2200] as const

export function AlwaysOnVisual() {
    const { ref, tick, reduce } = useTicks(ALWAYS_DELAYS)
    // The newest update is on top; each agent shows its latest message. Walking back through the cycle keeps it endless.
    const at = reduce ? UPDATES.length - 1 : tick + UPDATES.length - 1
    const today = at - (at % UPDATES.length)
    const rows: ((typeof UPDATES)[number] & { yesterday: boolean })[] = []
    for (let k = at; rows.length < ROWS; k--) {
        const u = UPDATES[((k % UPDATES.length) + UPDATES.length) % UPDATES.length]
        if (!rows.some((r) => r.name === u.name)) rows.push({ ...u, yesterday: k < today })
    }

    return (
        <div
            ref={ref}
            className={cn(card, '@container max-w-[25rem] overflow-hidden')}>
            <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2.5">
                <span className="text-[13px] font-semibold">Messages</span>
                <LiveBadge />
            </div>
            <div className="relative h-[11.75rem] overflow-hidden [mask-image:linear-gradient(to_bottom,black_75%,transparent)]">
                {rows.map((u, k) => (
                    <motion.div
                        key={u.name}
                        layout="position"
                        initial={false}
                        transition={spring}
                        className="relative flex items-center gap-2.5 pl-5">
                        <AnimatePresence>
                            {k === 0 && (
                                <motion.span
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    exit={{ scale: 0 }}
                                    transition={spring}
                                    className="absolute top-1/2 left-1.5 size-2 -translate-y-1/2 rounded-full bg-[#0A84FF]"
                                />
                            )}
                        </AnimatePresence>
                        <AgentAvatar
                            name={u.name}
                            className="size-10"
                        />
                        <div className={cn('min-w-0 flex-1 border-b-[0.5px] py-2.5 pr-4', k === ROWS - 1 ? 'border-transparent' : 'border-[#E5E5EA]')}>
                            <div className="flex items-baseline justify-between gap-2">
                                <span className="truncate text-[13px] font-semibold">
                                    {u.name} <span className="font-normal text-neutral-400">· {ROLES[u.name]}</span>
                                </span>
                                <span className="flex shrink-0 items-center text-[11px] text-neutral-400 tabular-nums">
                                    {u.yesterday ? 'Yesterday' : u.time}
                                    <ChevronRight className="size-3" />
                                </span>
                            </div>
                            <AnimatePresence
                                mode="wait"
                                initial={false}>
                                <motion.p
                                    key={u.time}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.3 }}
                                    className={cn('mt-0.5 truncate text-[12px] leading-snug', k === 0 ? 'text-neutral-700' : 'text-neutral-500')}>
                                    {u.text}
                                </motion.p>
                            </AnimatePresence>
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    )
}

/* 4. Hosting: it's yours to run, on your own computer or in your own cloud; the agent underneath doesn't change */

const HOSTS = [
    { id: 'computer', Icon: Laptop, title: 'Your computer', body: 'the engine on your Mac, PC or server', host: 'engine · my-macbook' },
    { id: 'cloud', Icon: Cloud, title: 'Your own cloud', body: 'your copy, deployed to Convex + Vercel', host: 'bots.yourdomain.com' },
] as const
const HOSTING_DELAYS = [3400, 2800] as const

export function HostingVisual() {
    const { ref, tick, reduce } = useTicks(HOSTING_DELAYS)
    const active = reduce ? 0 : tick % HOSTS.length
    const host = HOSTS[active]

    return (
        <div
            ref={ref}
            className="@container flex w-full max-w-[25rem] flex-col gap-2.5">
            <div className={cn(card, 'p-2.5')}>
                <p className="px-1.5 pt-0.5 pb-1.5 text-[12px] font-medium text-neutral-600">Hosting</p>
                <div className="space-y-1.5">
                    {HOSTS.map((h, k) => {
                        const on = k === active
                        return (
                            <div
                                key={h.id}
                                className={cn('relative flex items-center gap-3 rounded-xl px-3 py-2 transition-colors duration-300', on ? 'bg-neutral-50' : 'bg-transparent')}>
                                {on && (
                                    <motion.span
                                        layoutId="why-hosting-ring"
                                        transition={spring}
                                        className="absolute inset-0 rounded-xl ring-[1.5px] ring-neutral-900"
                                    />
                                )}
                                <span className={cn('grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-black/6 transition-colors duration-300', on ? 'bg-white text-neutral-900' : 'bg-neutral-50 text-neutral-400')}>
                                    <h.Icon className="size-4" />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={cn('flex items-center gap-2 text-[13px] font-semibold transition-colors duration-300', on ? 'text-neutral-900' : 'text-neutral-500')}>
                                        {h.title}
                                    </span>
                                    <span className="block truncate text-[12px] text-neutral-500">{h.body}</span>
                                </span>
                                <span className={cn('grid size-4 shrink-0 place-items-center rounded-full transition-colors duration-300', on ? 'bg-primary text-white' : 'ring-1 ring-neutral-300')}>
                                    {on && (
                                        <Check
                                            className="size-2.5"
                                            strokeWidth={3.5}
                                        />
                                    )}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* The same agent either way: only where it runs changes */}
            <div className={cn(card, 'rounded-2xl px-4 py-2.5')}>
                <div className="flex items-center gap-3">
                    <AgentAvatar
                        name="Mochi"
                        className="size-9"
                    />
                    <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">
                            Mochi <span className="font-normal text-neutral-400">· Personal Assistant</span>
                        </span>
                        <span className="flex min-w-0 items-center gap-1 text-[11px] text-neutral-500">
                            <AnimatePresence
                                mode="wait"
                                initial={false}>
                                <motion.span
                                    key={host.host}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    transition={{ duration: 0.25 }}
                                    className="flex min-w-0 items-center gap-1 font-mono text-neutral-800">
                                    <host.Icon className="size-3 shrink-0 text-neutral-400" />
                                    <span className="truncate">{host.host}</span>
                                </motion.span>
                            </AnimatePresence>
                        </span>
                    </span>
                    <LiveBadge />
                </div>
            </div>
        </div>
    )
}
