import { useRef, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Brain, Check, Cloud, RefreshCw, Server, Sparkles } from 'lucide-react'
import { Reveal, Stagger, StaggerItem } from '@/components/landing/motion'
import { cn } from '@/lib/utils'

// The small product mockup at the top of each card
const Mock = ({ children }: { children: ReactNode }) => (
    <div className="rounded-2xl bg-black/35 p-4 text-[13px] text-white ring-1 ring-white/15 backdrop-blur-sm">{children}</div>
)

const MemoryMock = () => (
    <Mock>
        <p className="flex items-center gap-2 text-white/60">
            <Brain className="size-3.5" aria-hidden />
            pip remembers
        </p>
        <ul className="mt-3 space-y-2">
            {['no meetings before 9:30', 'mom gets a call every sunday', 'oat milk, never dairy'].map((item, i) => (
                <li key={item} className="flex items-center justify-between gap-3 rounded-lg bg-white/8 px-3 py-2">
                    <span>{item}</span>
                    <span className="shrink-0 text-[11px] text-white/45">{['3 months ago', 'week 1', 'yesterday'][i]}</span>
                </li>
            ))}
        </ul>
    </Mock>
)

const LearningMock = () => (
    <Mock>
        <div className="flex flex-col gap-2">
            <p className="max-w-[85%] self-end rounded-[16px] bg-[#0A84FF] px-3 py-1.5">too formal, keep it short</p>
            <p className="max-w-[85%] self-start rounded-[16px] bg-white/15 px-3 py-1.5">got it. shorter from now on</p>
        </div>
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-400/15 px-3 py-2 text-emerald-200">
            <Sparkles className="size-3.5 shrink-0" aria-hidden />
            new rule learned: replies under two lines
        </p>
    </Mock>
)

const AlwaysOnMock = () => (
    <Mock>
        <p className="flex items-center gap-2 text-white/60">
            <RefreshCw className="size-3.5" aria-hidden />
            running for 214 days
        </p>
        <div className="mt-3 flex h-14 items-end gap-[3px]" aria-hidden>
            {[4, 6, 5, 8, 7, 9, 6, 8, 10, 7, 9, 11, 8, 10, 12, 9, 11, 13, 10, 12, 14, 12].map((h, i) => (
                <span key={i} className="flex-1 rounded-[2px] bg-white/70" style={{ height: `${h * 7}%` }} />
            ))}
        </div>
        <ul className="mt-3 space-y-1.5 text-white/80">
            <li>7:00 morning brief sent</li>
            <li>13:20 chased the invoice from acme</li>
            <li>22:05 booked friday's dinner</li>
        </ul>
    </Mock>
)

const HostingMock = () => (
    <Mock>
        <div className="grid gap-2">
            <div className="flex items-center gap-3 rounded-lg bg-white px-3 py-2.5 text-neutral-900">
                <Cloud className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">
                    <span className="block font-medium">openbots cloud</span>
                    <span className="block text-[11px] text-neutral-500">we run it, update it and back it up</span>
                </span>
                <Check className="size-4 shrink-0 text-emerald-600" aria-label="selected" />
            </div>
            <div className="flex items-center gap-3 rounded-lg bg-white/8 px-3 py-2.5">
                <Server className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">
                    <span className="block font-medium">self-hosted</span>
                    <span className="block text-[11px] text-white/55">your servers, your network</span>
                </span>
            </div>
        </div>
    </Mock>
)

const reasons = [
    {
        title: 'memory that never resets',
        body: 'every agent keeps a long-term memory of you, your people and your rules. month six knows everything month one learned.',
        label: 'persistent by default',
        bg: 'bg-[#2c6a9a]',
        mock: <MemoryMock />,
    },
    {
        title: 'agents that improve themselves',
        body: 'correct it once and it sticks. every reply, fix and approval becomes a lesson, so your team gets sharper every week.',
        label: 'self-improving',
        bg: 'bg-[#5b3fb0]',
        mock: <LearningMock />,
    },
    {
        title: 'always on, never starting over',
        body: 'agents run around the clock on infrastructure built to stay up. schedules, follow-ups and half-finished work carry on without you.',
        label: 'built to run 24/7',
        bg: 'bg-[#1f7a5c]',
        mock: <AlwaysOnMock />,
    },
    {
        title: 'our cloud or yours',
        body: 'start in seconds on openbots cloud, where we handle updates, scaling and backups. need it in-house? self-host the same platform.',
        label: 'your choice',
        bg: 'bg-[#a3472e]',
        mock: <HostingMock />,
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
            className="scroll-mt-24 px-3 py-24 md:px-6">
            <div className="overflow-hidden rounded-[2rem] bg-neutral-950 py-16 text-white md:py-24">
                <Reveal className="px-8 md:px-14">
                    <p className="type-label text-white/50">why openbots</p>
                    <h2 className="type-display mt-4 max-w-3xl text-balance">infrastructure for agents that get better every day</h2>
                    <p className="type-body-lg mt-6 max-w-2xl text-white/70 text-balance">
                        most assistants forget you the moment the chat ends. openbots gives every agent a persistent home: memory that lasts, a loop that learns from you, and
                        a runtime that never switches off.
                    </p>
                </Reveal>

                <Stagger className="mt-14">
                    <div
                        ref={rail}
                        className="flex snap-x snap-mandatory scroll-px-8 gap-5 overflow-x-auto px-8 pb-2 [scrollbar-width:none] md:scroll-px-14 md:px-14 [&::-webkit-scrollbar]:hidden">
                        {reasons.map((r) => (
                            <StaggerItem
                                key={r.title}
                                className="w-[85%] max-w-[26rem] shrink-0 snap-start sm:w-[24rem]">
                                <article className={cn('flex h-full min-h-[34rem] flex-col rounded-[1.75rem] p-6 md:p-7', r.bg)}>
                                    {r.mock}
                                    <h3 className="type-heading mt-auto pt-10 text-balance">{r.title}</h3>
                                    <p className="type-body mt-3 text-white/80">{r.body}</p>
                                    <p className="type-label mt-6 font-mono tracking-wider text-white/70 uppercase">{r.label}</p>
                                </article>
                            </StaggerItem>
                        ))}
                    </div>
                </Stagger>

                <div className="mt-8 flex gap-2 px-8 md:px-14">
                    {([-1, 1] as const).map((dir) => (
                        <button
                            key={dir}
                            type="button"
                            onClick={() => scroll(dir)}
                            aria-label={dir === -1 ? 'Previous' : 'Next'}
                            className="grid size-11 cursor-pointer place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20">
                            {dir === -1 ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    )
}
