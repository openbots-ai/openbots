import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { avatarBackground } from '@/lib/avatars'

const useCases = [
    {
        agent: 'Marcus',
        role: 'Sales Outbound',
        hue: 200,
        title: 'sales outbound',
        body: 'researches accounts overnight. drafts in your voice are ready before your coffee is.',
    },
    {
        agent: 'Kai',
        role: 'Demo Prep',
        hue: 120,
        title: 'demo prep',
        body: 'clicks through the demo an hour before the call, fixes whatever broke and texts you "we are good".',
    },
    {
        agent: 'Emily',
        role: 'Chief of Staff',
        hue: 278,
        title: 'pipeline ops',
        body: 'chases every deal that ghosted you. the monday scoreboard lands before standup.',
    },
    {
        agent: 'Nora',
        role: 'Customer Support',
        hue: 160,
        title: 'account follow-ups',
        body: 'sends updates and files the tickets, so no customer feels left on read.',
    },
]

export default function UseCases() {
    return (
        <section
            id="use-cases"
            className="px-6 py-28 md:py-40">
            <SectionHeading
                title="start with the stuff you keep ignoring"
                description="give one job to one agent. add another once it earns it."
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
