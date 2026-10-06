import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { avatarBackground } from '@/lib/avatars'

const useCases = [
    {
        agent: 'Marcus',
        role: 'Sales Outbound',
        hue: 200,
        title: 'Sales outbound',
        body: 'Researches accounts overnight, scores who is showing intent, and has personalized drafts waiting for your thumbs up by morning.',
    },
    {
        agent: 'Kai',
        role: 'Demo Prep',
        hue: 120,
        title: 'Demo readiness',
        body: 'Checks the demo environment before every call, fixes stale data, and texts you a ready checklist an hour before you join.',
    },
    {
        agent: 'Emily',
        role: 'Chief of Staff',
        hue: 278,
        title: 'Pipeline ops',
        body: 'Keeps the CRM clean, flags deals that have gone quiet, and sends a Monday scoreboard so the week starts with everyone on the same page.',
    },
    {
        agent: 'Nora',
        role: 'Customer Support',
        hue: 160,
        title: 'Account follow-up',
        body: 'Keeps customers warm with product updates, files support tickets, and syncs next steps wherever your team already works.',
    },
]

export default function UseCases() {
    return (
        <section
            id="use-cases"
            className="px-6 py-28 md:py-40">
            <SectionHeading
                title="What teams hand off first"
                description="Start with one agent and one job. Most teams add a specialist for every lane within a few weeks."
            />

            <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {useCases.map((u) => (
                    <StaggerItem key={u.title}>
                        <article className="flex h-full flex-col rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                            <div className="flex items-center gap-3">
                                <span
                                    className="flex size-10 items-center justify-center rounded-full font-semibold text-white"
                                    style={{ background: avatarBackground(u.agent, u.hue) }}>
                                    {u.agent[0]}
                                </span>
                                <div className="type-label">
                                    <p className="font-medium">{u.agent}</p>
                                    <p className="text-muted-foreground">{u.role}</p>
                                </div>
                            </div>
                            <h3 className="type-subheading mt-8">{u.title}</h3>
                            <p className="type-body-sm text-muted-foreground mt-2">{u.body}</p>
                        </article>
                    </StaggerItem>
                ))}
            </Stagger>
        </section>
    )
}
