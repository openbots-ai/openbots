import { useEffect, useRef, useState, type ReactNode } from 'react'
import { motion, useInView, useMotionValue, useReducedMotion, useSpring } from 'motion/react'
import { SECTION, SectionHeading } from '@/components/landing/section-heading'
import { Reveal } from '@/components/landing/motion'
import { ComputerVisual, MemoryVisual, RemindersVisual } from '@/components/landing/why-openbots-visuals'
import { cn } from '@/lib/utils'

const reasons: { title: string; body: string; visual: ReactNode }[] = [
    {
        title: 'It knows what you told it.',
        body: 'Give each agent notes in the dashboard: your people, your rules, what you like. It uses them in every reply, along with your recent texts.',
        visual: <MemoryVisual />,
    },
    {
        title: 'Reminders and watches.',
        body: 'Ask it to remind you about something, or to keep an eye on a price or a page. It texts you when it’s time, or when something changes.',
        visual: <RemindersVisual />,
    },
    {
        title: 'Your computer, your keys.',
        body: 'It runs on a computer you leave on: a Mac, PC or Linux box. Your chats stay there, encrypted, and it uses your own AI and texting accounts.',
        visual: <ComputerVisual />,
    },
]

// How long each card stays open before the next one opens
const SHOW_MS = 7000

// Phones get one picture at a time with the list under it; wider screens put the cards side by side
function useWide() {
    const query = '(min-width: 768px)'
    const [wide, setWide] = useState(() => window.matchMedia(query).matches)
    useEffect(() => {
        const media = window.matchMedia(query)
        const onChange = () => setWide(media.matches)
        media.addEventListener('change', onChange)
        return () => media.removeEventListener('change', onChange)
    }, [])
    return wide
}

// The line under a card: fills while that card is open, then the next one opens
const Progress = ({ active, running, onDone }: { active: boolean; running: boolean; onDone: () => void }) => (
    <div className="relative h-px bg-black/8 dark:bg-white/10">
        {active && (
            <motion.div
                className="bg-foreground absolute inset-y-0 left-0"
                initial={{ width: running ? '0%' : '100%' }}
                animate={{ width: '100%' }}
                transition={running ? { duration: SHOW_MS / 1000, ease: 'linear' } : { duration: 0 }}
                onAnimationComplete={() => running && onDone()}
            />
        )}
    </div>
)

const Caption = ({ title, body, active }: { title: string; body: string; active: boolean }) => (
    <p className="type-body pt-5 text-balance">
        <span className="font-medium">{title}</span>
        <motion.span
            className="text-muted-foreground"
            initial={false}
            animate={{ opacity: active ? 1 : 0 }}
            transition={{ duration: 0.3, delay: active ? 0.25 : 0 }}>
            {active && ` ${body}`}
        </motion.span>
    </p>
)

// The picture area. The visual keeps its own layout and is scaled down to fit the card's width, so a closed (narrow)
// card shows all of it, smaller, and it grows back as the card opens: the scale follows the card's animated width,
// through a spring, without re-rendering.
const Panel = ({ children, className }: { children: ReactNode; className?: string }) => {
    const card = useRef<HTMLDivElement>(null)
    const content = useRef<HTMLDivElement>(null)
    const fitted = useMotionValue(1)
    const scale = useSpring(fitted, { stiffness: 260, damping: 34, mass: 0.6 })

    useEffect(() => {
        const fit = () => {
            if (!card.current || !content.current) return
            // Room on either side, so the shrunk visual doesn't touch the card's edges
            fitted.set(Math.min(1, (card.current.clientWidth - 40) / content.current.offsetWidth))
        }
        fit()
        const observer = new ResizeObserver(fit)
        observer.observe(card.current!)
        return () => observer.disconnect()
    }, [fitted])

    return (
        <div
            ref={card}
            className={cn('relative overflow-hidden rounded-[1.75rem] bg-neutral-100/70 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8', className)}>
            <motion.div
                ref={content}
                className="absolute top-1/2 left-1/2 flex w-[25rem] max-w-[calc(100vw-4rem)] -translate-1/2 justify-center will-change-transform"
                style={{ scale }}>
                {children}
            </motion.div>
        </div>
    )
}

// Expandable cards: one open at a time, each for SHOW_MS, or the one you pick
export default function WhyOpenBots() {
    const ref = useRef<HTMLDivElement>(null)
    const inView = useInView(ref, { amount: 0.3 })
    const still = !!useReducedMotion()
    const wide = useWide()
    const [open, setOpen] = useState(0)
    // Restarts the line when you pick the card that's already open
    const [round, setRound] = useState(0)
    const running = inView && !still
    const next = () => setOpen((i) => (i + 1) % reasons.length)
    const pick = (i: number) => {
        setOpen(i)
        setRound((r) => r + 1)
    }

    return (
        <section
            id="why-openbots"
            className={`${SECTION} px-6`}>
            <SectionHeading
                title="An assistant that’s actually yours"
                description="Each agent knows what you’ve told it, reminds you and keeps watch for you, and runs on your own computer with your own keys."
            />

            <Reveal className="mt-14">
                <div ref={ref}>
                    {wide ? (
                        <div className="flex gap-4">
                            {reasons.map((r, i) => (
                                <motion.button
                                    key={r.title}
                                    type="button"
                                    onClick={() => pick(i)}
                                    aria-expanded={open === i}
                                    className="flex min-w-0 cursor-pointer flex-col justify-start text-left"
                                    initial={false}
                                    animate={{ flexGrow: open === i ? 2.4 : 1 }}
                                    style={{ flexBasis: 0 }}
                                    transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
                                    <Panel className="mb-5 h-[26rem]">{r.visual}</Panel>
                                    <Progress
                                        key={`${i}-${open}-${round}-${running}`}
                                        active={open === i}
                                        running={running}
                                        onDone={next}
                                    />
                                    <Caption
                                        title={r.title}
                                        body={r.body}
                                        active={open === i}
                                    />
                                </motion.button>
                            ))}
                        </div>
                    ) : (
                        <>
                            <Panel className="h-80">
                                <motion.div
                                    key={open}
                                    className="flex w-full justify-center"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ duration: 0.4 }}>
                                    {reasons[open].visual}
                                </motion.div>
                            </Panel>
                            <div className="mt-6 space-y-5">
                                {reasons.map((r, i) => (
                                    <button
                                        key={r.title}
                                        type="button"
                                        onClick={() => pick(i)}
                                        aria-expanded={open === i}
                                        className="block w-full cursor-pointer text-left">
                                        <Progress
                                            key={`${i}-${open}-${round}-${running}`}
                                            active={open === i}
                                            running={running}
                                            onDone={next}
                                        />
                                        <Caption
                                            title={r.title}
                                            body={r.body}
                                            active={open === i}
                                        />
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </Reveal>
        </section>
    )
}
