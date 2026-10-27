import type { ReactNode } from 'react'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AlwaysOnVisual, HostingVisual, LearningVisual, MemoryVisual } from '@/components/landing/why-openbots-visuals'

const reasons: { title: string; body: string; detail: string; visual: ReactNode }[] = [
    {
        title: 'Memory that never resets',
        body: 'Every agent keeps a long-term memory of you, your people and your rules. Month six knows everything month one learned.',
        detail: 'Persistent by default',
        visual: <MemoryVisual />,
    },
    {
        title: 'Agents that improve themselves',
        body: 'Correct it once and it sticks. Every reply, fix and approval becomes a lesson, so your team gets sharper every week.',
        detail: 'Self-improving',
        visual: <LearningVisual />,
    },
    {
        title: 'Always on, never starting over',
        body: 'Agents run around the clock on infrastructure built to stay up. Schedules, follow-ups and half-finished work carry on without you.',
        detail: 'Built to run 24/7',
        visual: <AlwaysOnVisual />,
    },
    {
        title: 'Our cloud or yours',
        body: 'Start in seconds on OpenBots Cloud, where we handle updates, scaling and backups. Need it in-house? Self-host the same platform.',
        detail: 'Your choice',
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
                title="Infrastructure for agents that get better every day"
                description="Most assistants forget you when the chat ends. OpenBots gives every agent a home: memory that lasts, a loop that learns from you, and a runtime that never switches off."
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
