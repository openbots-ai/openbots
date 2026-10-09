import type { ReactNode } from 'react'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AlwaysOnVisual, HostingVisual, LearningVisual, MemoryVisual } from '@/components/landing/why-openbots-visuals'

const reasons: { title: string; body: string; detail: string; visual: ReactNode }[] = [
    {
        title: 'memory that never resets',
        body: 'every agent keeps a long-term memory of you, your people and your rules. month six knows everything month one learned.',
        detail: 'persistent by default',
        visual: <MemoryVisual />,
    },
    {
        title: 'agents that improve themselves',
        body: 'correct it once and it sticks. every reply, fix and approval becomes a lesson, so your team gets sharper every week.',
        detail: 'self-improving',
        visual: <LearningVisual />,
    },
    {
        title: 'always on, never starting over',
        body: 'agents run around the clock on infrastructure built to stay up. schedules, follow-ups and half-finished work carry on without you.',
        detail: 'built to run 24/7',
        visual: <AlwaysOnVisual />,
    },
    {
        title: 'our cloud or yours',
        body: 'start in seconds on openbots cloud, where we handle updates, scaling and backups. need it in-house? self-host the same platform.',
        detail: 'your choice',
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
                title="infrastructure for agents that get better every day"
                description="most assistants forget you when the chat ends. openbots gives every agent a home: memory that lasts, a loop that learns from you, and a runtime that never switches off."
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
