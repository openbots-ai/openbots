import { useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowRight, Check, Lock, MousePointer2, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { SECTION, SectionHeading } from '@/components/landing/section-heading'
import { useLoopedSteps } from '@/components/landing/use-looped-steps'
import { BrainMock, MemoryMock, PersonalityMock } from '@/components/landing/feature-mocks'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { cn } from '@/lib/utils'
import { ProviderMark } from '@/components/agent-config-bar'
import { SLOT_ICONS } from '@/components/slot-icons'
import { slotOf, type Provider, type SlotId } from '@convex/lib/models'

const dealFields = [
    { label: 'Destination', before: 'Undecided', after: 'Montreal' },
    { label: 'Dates', before: 'n/a', after: 'Oct 16–18' },
    { label: 'Budget', before: 'Not set', after: '$600 max' },
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
                        <Lock className="size-2.5" /> My weekend plans
                    </span>
                </div>

                <div
                    ref={rootRef}
                    className="relative p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[13px] font-semibold">A weekend away</p>
                            <p className="text-neutral-500">Your shortlist · nothing booked yet</p>
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

type PickerOption = { label: string; provider?: Provider }

// A floating settings menu that cycles through its options, so each card shows the part you get to choose
const Picker = ({ icon: Icon, label, options }: { icon: LucideIcon; label: string; options: PickerOption[] }) => {
    const ref = useRef<HTMLDivElement>(null)
    const step = useLoopedSteps(ref, options.map(() => 1600), 1600)
    const selected = step % options.length

    return (
        <div
            ref={ref}
            className="absolute -bottom-14 -right-2 z-20 w-48 rounded-xl bg-white p-1.5 text-left text-[11px] text-neutral-800 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.3)] ring-1 ring-black/8 md:-right-12">
            <p className="flex items-center gap-1.5 px-2 pb-1.5 pt-1 text-[10px] font-medium text-neutral-500">
                <Icon className="size-3" /> {label}
            </p>
            {options.map((o, i) => (
                <div
                    key={o.label}
                    className="relative flex items-center gap-2 rounded-lg px-2 py-1.5">
                    {i === selected && (
                        <motion.span
                            layoutId={`picker-${label}`}
                            className="absolute inset-0 rounded-lg bg-neutral-100"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        />
                    )}
                    {o.provider && (
                        <ProviderMark
                            provider={o.provider}
                            className="relative size-3.5"
                        />
                    )}
                    <span className="relative flex-1 truncate font-medium">{o.label}</span>
                    {i === selected && <Check className="relative size-3 text-neutral-900" />}
                </div>
            ))}
        </div>
    )
}

// A picker filled from a model slot: same name and the same full list of models as the dashboard's Models page
const SlotPicker = ({ slot }: { slot: SlotId }) => {
    const s = slotOf(slot)!
    return (
        <Picker
            icon={SLOT_ICONS[slot]}
            label={s.label}
            options={s.options.map((o) => ({ label: o.label, provider: o.provider }))}
        />
    )
}

// Each card shows one thing you customize, changing on its own
const features = [
    { label: 'Computer use', title: 'Let it work your computer.', mock: <ComputerMock />, picker: <SlotPicker slot="computer" /> },
    { label: 'Brain', title: 'Pick the brain behind every reply.', mock: <BrainMock /> },
    { label: 'Personality', title: 'Tune its personality, down to the vibe.', mock: <PersonalityMock /> },
    { label: 'Notes', title: 'You decide what it knows.', mock: <MemoryMock /> },
]

export default function Features() {
    return (
        <section
            id="features"
            className={`${SECTION} px-6`}>
            <SectionHeading
                title="You pick its superpowers."
                description="Pick its brain, let it use your computer, tune its personality and give it notes. Every part is your build."
            />

            <Stagger className="mt-14 grid gap-5 md:grid-cols-2">
                {features.map(({ label, title, mock, picker }) => (
                    <StaggerItem key={label}>
                        <article className="group flex h-full flex-col overflow-hidden rounded-[2rem] bg-neutral-100/70 ring-1 ring-black/4 transition-shadow duration-300 hover:shadow-xl hover:shadow-black/5 dark:bg-white/5 dark:ring-white/8">
                            <div
                                aria-hidden
                                className="flex h-[27rem] items-center justify-center px-8 pt-10 transition-transform duration-500 group-hover:-translate-y-1 md:px-12">
                                <div className="relative w-full max-w-sm">
                                    {mock}
                                    {picker}
                                </div>
                            </div>
                            <div className="bg-background/60 flex-1 px-8 pb-9 pt-7 md:px-10">
                                <p className="type-label text-muted-foreground">{label}</p>
                                <h3 className="type-heading mt-2 text-balance">{title}</h3>
                                <a
                                    href="/dashboard"
                                    className="type-body mt-6 inline-flex items-center gap-1.5 font-medium">
                                    Try it in the builder
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
