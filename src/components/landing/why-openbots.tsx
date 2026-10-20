import type { ReactNode } from 'react'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AlwaysOnVisual, HostingVisual, KnowledgeVisual, RemindersVisual } from '@/components/landing/why-openbots-visuals'

const reasons: { title: string; body: string; detail: string; visual: ReactNode }[] = [
    {
        title: 'it knows what you told it',
        body: 'give each agent knowledge docs: your people, your rules, your preferences. it reads them, plus each contact’s notes, before every reply.',
        detail: 'knowledge docs',
        visual: <KnowledgeVisual />,
    },
    {
        title: 'it follows up on its own',
        body: 'text “remind me at 5” or “tell me if this changes” and it keeps track. set check-ins and it texts you first.',
        detail: 'reminders · watches · check-ins',
        visual: <RemindersVisual />,
    },
    {
        title: 'always on, while your engine is',
        body: 'the engine runs on a computer you choose, so reminders and check-ins carry on while you’re away. if your AI provider goes down, a backup model takes over.',
        detail: 'with a backup model',
        visual: <AlwaysOnVisual />,
    },
    {
        title: 'yours to run',
        body: 'openbots is free and open source. run the engine on your own computer and deploy your own copy of the dashboard to Convex and Vercel. there’s no hosted plan.',
        detail: 'self-hosted · MIT licensed',
        visual: <HostingVisual />,
    },
]

// Same structure and card treatment as the Trust section, with a product visual on top of each card
export default function WhyOpenBots() {
    return (
        <section
            id="why-openbots"
            className="scroll-mt-24 px-6 py-44 md:py-52 lg:py-60">
            <SectionHeading
                title="a home for agents you actually run"
                description="most assistants live in someone else’s app. openbots gives every agent a home you own: docs it reads, follow-ups it keeps, and an engine on your own computer."
            />

            <Stagger className="mt-14 grid gap-5 md:grid-cols-2">
                {reasons.map(({ title, body, detail, visual }) => (
                    <StaggerItem key={title}>
                        <article className="flex h-full flex-col rounded-[1.75rem] bg-neutral-100/70 p-3 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                            {/* The visual owns this area: it should fill it and stay inside it */}
                            <div className="relative flex h-72 items-center justify-center overflow-hidden rounded-[1.25rem] px-4">{visual}</div>
                            <div className="flex flex-1 flex-col px-4 pt-6 pb-4">
                                <h3 className="type-subheading text-balance">{title}</h3>
                                <p className="type-body-sm text-muted-foreground mt-2">{body}</p>
                                <p className="type-label text-muted-foreground mt-auto pt-7">{detail}</p>
                            </div>
                        </article>
                    </StaggerItem>
                ))}
            </Stagger>
        </section>
    )
}
