import { Brain, Database, History, KeyRound, PauseCircle, ShieldCheck } from 'lucide-react'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'

const controls = [
    {
        icon: Brain,
        title: 'memory you can actually edit',
        body: 'see what your assistant remembers, fix anything that is off, or delete it for good.',
        detail: 'view · edit · forget',
    },
    {
        icon: KeyRound,
        title: 'access, app by app',
        body: 'calendar can be read-only while email needs approval. every app gets its own rules.',
        detail: 'read · write · always ask',
    },
    {
        icon: ShieldCheck,
        title: 'you approve the real stuff',
        body: 'sending, buying, posting, and anything sensitive waits for your yes.',
        detail: 'nothing sneaky ships',
    },
    {
        icon: History,
        title: 'the whole story, logged',
        body: 'see what it opened, changed, sent, and why. every action has a trail.',
        detail: 'searchable activity',
    },
    {
        icon: PauseCircle,
        title: 'one tap means stop',
        body: 'pause one assistant or the whole squad instantly without deleting your setup.',
        detail: 'pause anytime',
    },
    {
        icon: Database,
        title: 'your data stays yours',
        body: 'choose what stays, export a copy, and delete your data when you want.',
        detail: 'keep · export · delete',
    },
]

export default function Trust() {
    return (
        <section
            id="trust"
            className="px-6 py-44 md:py-52 lg:py-60 xl:py-72 ">
            <SectionHeading
                title="helpful, not weird about it"
                description="it can know you really well without owning your life. you decide what it remembers, touches, and does."
            />

            <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {controls.map(({ icon: Icon, title, body, detail }) => (
                    <StaggerItem key={title}>
                        <article className="flex h-full min-h-64 flex-col rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                            <span className="flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                                <Icon className="size-5" aria-hidden />
                            </span>
                            <h3 className="type-subheading mt-8 text-balance">{title}</h3>
                            <p className="type-body-sm text-muted-foreground mt-2">{body}</p>
                            <p className="type-label text-muted-foreground mt-auto pt-7">{detail}</p>
                        </article>
                    </StaggerItem>
                ))}
            </Stagger>
        </section>
    )
}
