import { useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/landing/motion'
import { AlwaysOnVisual, HostingVisual, LearningVisual, MemoryVisual } from '@/components/landing/why-openbots-visuals'
import { cn } from '@/lib/utils'

const reasons: { title: string; body: string; label: string; tint: string; visual: ReactNode }[] = [
    {
        title: 'memory that never resets',
        body: 'every agent keeps a long-term memory of you, your people and your rules. month six knows everything month one learned.',
        label: 'persistent by default',
        tint: 'bg-sky-50 ring-sky-900/6',
        visual: <MemoryVisual />,
    },
    {
        title: 'agents that improve themselves',
        body: 'correct it once and it sticks. every reply, fix and approval becomes a lesson, so your team gets sharper every week.',
        label: 'self-improving',
        tint: 'bg-violet-50 ring-violet-900/6',
        visual: <LearningVisual />,
    },
    {
        title: 'always on, never starting over',
        body: 'agents run around the clock on infrastructure built to stay up. schedules, follow-ups and half-finished work carry on without you.',
        label: 'built to run 24/7',
        tint: 'bg-emerald-50 ring-emerald-900/6',
        visual: <AlwaysOnVisual />,
    },
    {
        title: 'our cloud or yours',
        body: 'start in seconds on openbots cloud, where we handle updates, scaling and backups. need it in-house? self-host the same platform.',
        label: 'your choice',
        tint: 'bg-amber-50 ring-amber-900/6',
        visual: <HostingVisual />,
    },
]

export default function WhyOpenBots() {
    const rail = useRef<HTMLDivElement>(null)
    // One card's width plus the gap, so the arrows move a card at a time
    const scroll = (dir: 1 | -1) => {
        const el = rail.current
        const card = el?.querySelector('article')
        if (el && card) el.scrollBy({ left: dir * (card.clientWidth + 20), behavior: 'smooth' })
    }

    return (
        <section
            id="why-openbots"
            className="scroll-mt-24 py-32 md:py-40">
            <div className="flex flex-col gap-8 px-6 md:flex-row md:items-end md:justify-between">
                <Reveal className="max-w-3xl">
                    <p className="type-label text-muted-foreground">why openbots</p>
                    <h2 className="type-display mt-4 text-balance">infrastructure for agents that get better every day</h2>
                    <p className="type-body-lg text-muted-foreground mt-6 max-w-2xl text-balance">
                        most assistants forget you the moment the chat ends. openbots gives every agent a persistent home: memory that lasts, a loop that learns from you, and
                        a runtime that never switches off.
                    </p>
                </Reveal>
                <div className="hidden shrink-0 gap-2 md:flex">
                    {([-1, 1] as const).map((dir) => (
                        <button
                            key={dir}
                            type="button"
                            onClick={() => scroll(dir)}
                            aria-label={dir === -1 ? 'Previous' : 'Next'}
                            className="grid size-11 cursor-pointer place-items-center rounded-full bg-white ring-1 ring-black/10 transition-colors hover:bg-neutral-100">
                            {dir === -1 ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
                        </button>
                    ))}
                </div>
            </div>

            <Stagger className="mt-14">
                <div
                    ref={rail}
                    className="flex snap-x snap-mandatory scroll-px-6 gap-5 overflow-x-auto px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {reasons.map((r) => (
                        <StaggerItem
                            key={r.title}
                            className="w-[85%] max-w-[26rem] shrink-0 snap-start sm:w-[24rem]">
                            <article className={cn('flex h-full min-h-[36rem] flex-col overflow-hidden rounded-[1.75rem] ring-1', r.tint)}>
                                {/* The visual owns this area; it should fill it and stay inside it */}
                                <div className="relative flex h-72 items-center justify-center overflow-hidden p-6">{r.visual}</div>
                                <div className="mt-auto p-6 pt-8 md:p-7">
                                    <h3 className="type-heading text-balance">{r.title}</h3>
                                    <p className="type-body text-muted-foreground mt-3">{r.body}</p>
                                    <p className="type-label text-muted-foreground mt-6 font-mono tracking-wider uppercase">{r.label}</p>
                                </div>
                            </article>
                        </StaggerItem>
                    ))}
                </div>
            </Stagger>
        </section>
    )
}
