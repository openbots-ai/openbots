import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { ArrowRight, Check, ChevronLeft, LoaderCircle, Lock, MousePointer2, Repeat } from 'lucide-react'
import { AnimatePresence, motion, useInView } from 'motion/react'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { cn } from '@/lib/utils'
import { AgentAvatar } from '@/components/landing/agent-avatar'

// macOS-style window chrome the feature mockups sit in
const Window = ({ title, dark, className, children }: { title: string; dark?: boolean; className?: string; children: ReactNode }) => (
    <div
        className={cn(
            'w-full overflow-hidden rounded-xl text-left text-[11px] shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1',
            dark ? 'bg-[#1c1d21] text-neutral-200 ring-white/10' : 'bg-white text-neutral-800 ring-black/8',
            className
        )}>
        <div className={cn('flex items-center gap-1.5 border-b px-3 py-2.5', dark ? 'border-white/8' : 'border-black/6')}>
            <span className="size-2.5 rounded-full bg-[#FF5F57]" />
            <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
            <span className="size-2.5 rounded-full bg-[#28C840]" />
            <span className={cn('ml-2 font-medium', dark ? 'text-neutral-400' : 'text-neutral-500')}>{title}</span>
        </div>
        {children}
    </div>
)

type Bubble = { from?: string; hue?: number; text: string; system?: boolean }

// Advances one step after each delay while the mock is on screen, holds on the last step, then loops.
function useLoopedSteps(ref: RefObject<HTMLElement | null>, delays: number[], hold = 3200) {
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

const TypingDots = () => (
    <span className="imsg imsg-them imsg-tail relative flex w-fit gap-1 rounded-[16px] bg-[#E9E9EB] px-3 py-2">
        {[0, 0.15, 0.3].map((delay) => (
            <motion.span
                key={delay}
                className="size-1.5 rounded-full bg-neutral-400"
                animate={{ y: [0, -2.5, 0], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 0.9, repeat: Infinity, delay }}
            />
        ))}
    </span>
)

// A small iMessage thread that plays out message by message, used for the 1:1 and group chat mockups.
// Every bubble keeps its slot from the start so the card never changes height.
const Thread = ({ title, avatars, bubbles }: { title: string; avatars: { name: string }[]; bubbles: Bubble[] }) => {
    const ref = useRef<HTMLDivElement>(null)
    const shown = useLoopedSteps(
        ref,
        bubbles.map((b, i) => (i === 0 ? 700 : b.from ? 1500 : 900))
    )

    return (
        <div
            ref={ref}
            className="w-full max-w-sm overflow-hidden rounded-[1.6rem] bg-white text-left text-[12px] leading-snug text-black shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1 ring-black/8">
            <div className="relative flex flex-col items-center border-b border-black/5 pb-2.5 pt-3">
                <ChevronLeft className="absolute left-3 top-4 size-4 text-[#0A84FF]" />
                <div className="flex -space-x-2">
                    {avatars.map((a) => (
                        <AgentAvatar
                            key={a.name}
                            name={a.name}
                            className="size-8 ring-2 ring-white"
                        />
                    ))}
                </div>
                <span className="mt-1 text-[11px] font-semibold">{title}</span>
            </div>
            <div className="flex flex-col gap-1 px-3 py-3">
                {bubbles.map((b, i) => {
                    const mine = !b.from && !b.system
                    const showName = !!b.from && bubbles[i - 1]?.from !== b.from && avatars.length > 1
                    const content = b.system ? (
                        <p className="w-full py-1 text-center text-[10px] text-neutral-400">{b.text}</p>
                    ) : (
                        <>
                            {showName && <span className="mb-0.5 ml-2 text-[9px] text-neutral-500">{b.from}</span>}
                            <p
                                className={cn(
                                    'imsg imsg-tail relative max-w-[80%] rounded-[16px] px-3 py-1.5',
                                    mine ? 'imsg-me bg-[#0A84FF] text-white' : 'imsg-them bg-[#E9E9EB]'
                                )}>
                                {b.text}
                            </p>
                        </>
                    )
                    return (
                        <div
                            key={i}
                            className={cn('relative', i > 0 && bubbles[i - 1].from !== b.from && 'mt-1.5')}>
                            <div className={cn('invisible flex flex-col', mine ? 'items-end' : 'items-start')}>{content}</div>
                            <AnimatePresence>
                                {i < shown && (
                                    <motion.div
                                        className={cn('absolute inset-0 flex flex-col', mine ? 'items-end' : 'items-start')}
                                        initial={{ opacity: 0, y: 8, scale: 0.94 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                                        transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                                        style={{ originX: mine ? 1 : 0, originY: 1 }}>
                                        {content}
                                    </motion.div>
                                )}
                                {i === shown && !!b.from && (
                                    <motion.div
                                        key="typing"
                                        className="absolute left-0 top-0 flex flex-col items-start"
                                        initial={{ opacity: 0, scale: 0.7 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, transition: { duration: 0.1 } }}
                                        style={{ originX: 0, originY: 1 }}>
                                        {showName && <span className="mb-0.5 ml-2 text-[9px] text-neutral-500">{b.from}</span>}
                                        <TypingDots />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

const dealFields = [
    { label: 'Stage', before: 'Discovery', after: 'Proposal' },
    { label: 'Next step', before: 'n/a', after: 'Send pricing Fri' },
    { label: 'Seats', before: '25', after: '40' },
]

type Point = { x: number; y: number }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Scripted computer use: the agent's cursor clicks each field, types the new value, then hits Save, on a loop.
function useComputerUse(fieldRefs: RefObject<(HTMLElement | null)[]>, saveRef: RefObject<HTMLElement | null>, rootRef: RefObject<HTMLElement | null>) {
    const done = dealFields.map((f) => f.after)
    const [reduceMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const [cursor, setCursor] = useState<Point>({ x: 320, y: 20 })
    const [clicks, setClicks] = useState(0)
    const [focused, setFocused] = useState<number | null>(null)
    const [values, setValues] = useState(() => (reduceMotion ? done : dealFields.map((f) => f.before)))
    const [saved, setSaved] = useState(reduceMotion)

    useEffect(() => {
        if (reduceMotion) return
        let alive = true
        const wait = async (ms: number) => {
            await sleep(ms)
            if (!alive) throw new Error('cancelled')
        }
        const centerOf = (el: HTMLElement | null | undefined, dx = 0): Point | null => {
            const root = rootRef.current
            if (!el || !root) return null
            const a = el.getBoundingClientRect()
            const b = root.getBoundingClientRect()
            return { x: a.left - b.left + dx, y: a.top - b.top + a.height / 2 - 2 }
        }
        const click = async () => {
            setClicks((c) => c + 1)
            await wait(180)
        }

        const run = async () => {
            while (alive) {
                setValues(dealFields.map((f) => f.before))
                setSaved(false)
                setFocused(null)
                await wait(900)

                for (let i = 0; i < dealFields.length && alive; i++) {
                    const target = centerOf(fieldRefs.current?.[i], 40)
                    if (target) setCursor(target)
                    await wait(750)
                    await click()
                    setFocused(i)
                    setValues((v) => v.map((val, k) => (k === i ? '' : val)))
                    for (const ch of dealFields[i].after) {
                        if (!alive) return
                        await wait(55 + Math.random() * 60)
                        setValues((v) => v.map((val, k) => (k === i ? val + ch : val)))
                    }
                    await wait(250)
                }

                const save = saveRef.current
                const target = centerOf(save, save ? save.offsetWidth / 2 : 0)
                if (target) setCursor(target)
                await wait(750)
                setFocused(null)
                await click()
                setSaved(true)
                await wait(2600)
                setCursor({ x: 320, y: 20 })
            }
        }
        run().catch(() => {})
        return () => {
            alive = false
        }
    }, [reduceMotion, fieldRefs, saveRef, rootRef])

    return { cursor, clicks, focused, values, saved }
}

const ComputerMock = () => {
    const rootRef = useRef<HTMLDivElement>(null)
    const saveRef = useRef<HTMLSpanElement>(null)
    const fieldRefs = useRef<(HTMLElement | null)[]>([])
    const { cursor, clicks, focused, values, saved } = useComputerUse(fieldRefs, saveRef, rootRef)

    return (
        <div className="relative w-full">
            <div className="w-full overflow-hidden rounded-xl bg-white text-left text-[11px] text-neutral-800 shadow-[0_24px_48px_-16px_rgba(0,0,0,0.25)] ring-1 ring-black/8">
                {/* Browser chrome */}
                <div className="flex items-center gap-1.5 border-b border-black/6 bg-neutral-50 px-3 py-2">
                    <span className="size-2.5 rounded-full bg-[#FF5F57]" />
                    <span className="size-2.5 rounded-full bg-[#FEBC2E]" />
                    <span className="size-2.5 rounded-full bg-[#28C840]" />
                    <span className="mx-auto flex items-center gap-1 rounded-md bg-white px-3 py-0.5 text-[10px] text-neutral-500 ring-1 ring-black/6">
                        <Lock className="size-2.5" /> crm.acme.com/deals/northwind
                    </span>
                </div>

                <div
                    ref={rootRef}
                    className="relative p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-semibold">Northwind · Platform expansion</p>
                            <p className="text-neutral-500">Owner: you · $96,000</p>
                        </div>
                        <span
                            ref={saveRef}
                            className={cn(
                                'flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-semibold text-white transition-colors duration-300',
                                saved ? 'bg-emerald-500' : 'bg-neutral-900'
                            )}>
                            {saved ? (
                                <>
                                    <Check className="size-3" /> Saved
                                </>
                            ) : (
                                'Save'
                            )}
                        </span>
                    </div>
                    <div className="mt-3 divide-y divide-black/5 rounded-lg ring-1 ring-black/6">
                        {dealFields.map((f, i) => (
                            <div
                                key={f.label}
                                className="flex items-center px-3 py-1.5">
                                <span className="w-20 shrink-0 text-neutral-500">{f.label}</span>
                                <span
                                    ref={(el) => {
                                        fieldRefs.current[i] = el
                                    }}
                                    className={cn(
                                        'flex h-6 flex-1 items-center rounded-md px-2 font-medium transition-shadow',
                                        focused === i && 'bg-white ring-2 ring-sky-400/70',
                                        values[i] === f.after && focused !== i && 'text-sky-700'
                                    )}>
                                    {values[i]}
                                    {focused === i && <span className="ml-px h-3.5 w-px animate-pulse bg-neutral-900" />}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* Agent cursor with a name tag, like a collaborator in a shared doc */}
                    <motion.div
                        className="pointer-events-none absolute left-0 top-0 z-10"
                        initial={false}
                        animate={cursor}
                        transition={{ type: 'spring', stiffness: 120, damping: 20, mass: 0.8 }}>
                        <AnimatePresence>
                            <motion.span
                                key={clicks}
                                className="absolute -left-2 -top-2 size-5 rounded-full border-2 border-sky-400"
                                initial={{ scale: 0.3, opacity: clicks ? 0.9 : 0 }}
                                animate={{ scale: 1.6, opacity: 0 }}
                                transition={{ duration: 0.5 }}
                            />
                        </AnimatePresence>
                        <MousePointer2
                            className="size-4 text-sky-500 drop-shadow"
                            fill="currentColor"
                            strokeWidth={1.5}
                        />
                        <span className="ml-3 rounded-full bg-sky-500 px-1.5 py-0.5 text-[9px] font-semibold text-white">Waffles</span>
                    </motion.div>
                </div>
            </div>
        </div>
    )
}

const TextItMock = () => (
    <Thread
        title="Penny · Expense Manager"
        avatars={[{ name: 'Penny' }]}
        bubbles={[
            { text: 'can you deal with the invoices in my inbox?' },
            { from: 'Penny', hue: 340, text: 'on it. found 9, paid 8 ✅' },
            { from: 'Penny', hue: 340, text: 'the AWS one needs a PO number before I can pay it' },
            { text: 'PO-4471' },
            { from: 'Penny', hue: 340, text: 'done. all 9 paid and filed 👌' },
        ]}
    />
)

const TeamMock = () => (
    <Thread
        title="You + 4 agents"
        avatars={[
            { name: 'Mochi' },
            { name: 'Waffles' },
            { name: 'Biscuit' },
            { name: 'Penny' },
        ]}
        bubbles={[
            { system: true, text: 'You added Mochi, Waffles, Biscuit and Penny to the conversation' },
            { text: 'morning team, what needs me today?' },
            { from: 'Mochi', hue: 278, text: 'just one thing: sign off on the Northwind proposal' },
            { from: 'Waffles', hue: 200, text: 'it is in your inbox, 40 seats' },
            { from: 'Penny', hue: 340, text: 'pricing checks out, margins look healthy ✅' },
            { text: 'approved 👍' },
        ]}
    />
)

const routineSteps = ['Pull every deal that moved this week', 'Flag anything stalled for 14+ days', 'Update next steps in the CRM', 'Text you the scoreboard']

const RoutineMock = () => {
    const ref = useRef<HTMLDivElement>(null)
    // 0 idle, 1-4 running that step, 5 finished
    const step = useLoopedSteps(ref, [1200, 1100, 1100, 1100, 1100], 2800)
    const finished = step > routineSteps.length

    return (
        <div
            ref={ref}
            className="w-full">
            <Window title="Routines">
                <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <p className="text-[13px] font-semibold">Monday pipeline review</p>
                            <p className="mt-0.5 text-neutral-500">Learned from 1 walkthrough with you</p>
                        </div>
                        <span className="flex h-5 w-9 items-center rounded-full bg-[#34C759] p-0.5">
                            <span className="ml-auto size-4 rounded-full bg-white shadow" />
                        </span>
                    </div>
                    <ol className="mt-3 space-y-1.5">
                        {routineSteps.map((label, i) => {
                            const running = step === i + 1
                            const done = step > i + 1
                            return (
                                <li
                                    key={label}
                                    className={cn(
                                        'flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors duration-300',
                                        running ? 'bg-sky-50 ring-1 ring-sky-200' : 'bg-neutral-50'
                                    )}>
                                    <span className="relative flex size-4 items-center justify-center">
                                        {done ? (
                                            <motion.span
                                                initial={{ scale: 0.4 }}
                                                animate={{ scale: 1 }}
                                                className="flex size-4 items-center justify-center rounded-full bg-emerald-500">
                                                <Check
                                                    className="size-2.5 text-white"
                                                    strokeWidth={3}
                                                />
                                            </motion.span>
                                        ) : running ? (
                                            <LoaderCircle className="size-4 animate-spin text-sky-500" />
                                        ) : (
                                            <span className="flex size-4 items-center justify-center rounded-full bg-neutral-200 text-[9px] font-semibold text-neutral-600">{i + 1}</span>
                                        )}
                                    </span>
                                    <span className={cn('transition-colors', done && 'text-neutral-400')}>{label}</span>
                                </li>
                            )
                        })}
                    </ol>
                    <AnimatePresence
                        mode="wait"
                        initial={false}>
                        <motion.p
                            key={finished ? 'done' : step > 0 ? 'running' : 'idle'}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.2 }}
                            className={cn('mt-3 flex items-center gap-1.5', finished ? 'font-medium text-emerald-600' : 'text-neutral-500')}>
                            {finished ? (
                                <>
                                    <Check className="size-3" /> Done. Scoreboard sent to your iMessage
                                </>
                            ) : step > 0 ? (
                                <>
                                    <LoaderCircle className="size-3 animate-spin" /> Running now, Monday 8:00 AM
                                </>
                            ) : (
                                <>
                                    <Repeat className="size-3" /> Runs every Monday at 8:00 AM
                                </>
                            )}
                        </motion.p>
                    </AnimatePresence>
                </div>
            </Window>
        </div>
    )
}

const features = [
    { label: 'its own computer', title: 'your crm gets updated at 2am. you stay asleep, as you should.', mock: <ComputerMock /> },
    { label: 'just text it', title: 'set the rules once. after that it\'s literally just texting.', mock: <TextItMock /> },
    { label: 'group chat', title: 'build a few, throw them in one gc. lowkey the most productive group chat you\'ll ever be in.', mock: <TeamMock /> },
    { label: 'show it once', title: 'do the job once while it watches. it has every monday after that.', mock: <RoutineMock /> },
]

export default function Features() {
    return (
        <section
            id="features"
            className="px-6 py-28 md:py-40">
            <SectionHeading
                title="build the squad, run the squad"
                description="every agent gets its own computer and logs into your apps. how it thinks, talks and works? your call."
            />

            <Stagger className="mt-14 grid gap-5 md:grid-cols-2">
                {features.map(({ label, title, mock }) => (
                    <StaggerItem key={label}>
                        <article className="group flex h-full flex-col overflow-hidden rounded-[2rem] bg-neutral-100/70 ring-1 ring-black/4 transition-shadow duration-300 hover:shadow-xl hover:shadow-black/5 dark:bg-white/5 dark:ring-white/8">
                            <div
                                aria-hidden
                                className="flex h-[27rem] items-center justify-center px-8 pt-10 transition-transform duration-500 group-hover:-translate-y-1 md:px-12">
                                {mock}
                            </div>
                            <div className="bg-background/60 flex-1 px-8 pb-9 pt-7 md:px-10">
                                <p className="type-label text-muted-foreground">{label}</p>
                                <h3 className="type-heading mt-2 text-balance">{title}</h3>
                                <a
                                    href="/#early-access"
                                    className="type-body mt-6 inline-flex items-center gap-1.5 font-medium">
                                    Learn more
                                    <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                                </a>
                            </div>
                        </article>
                    </StaggerItem>
                ))}
            </Stagger>
        </section>
    )
}
