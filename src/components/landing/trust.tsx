import { Database, Gauge, Hand, HardDrive, PauseCircle, ShieldCheck } from 'lucide-react'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'

const controls = [
    {
        icon: ShieldCheck,
        title: 'you approve the real stuff',
        body: 'before it does anything on your computer that can’t be undone, it asks and waits for you to reply yes.',
        detail: 'nothing sneaky ships',
    },
    {
        icon: Hand,
        title: 'it knows when to hand off',
        body: 'when it can’t reply or someone asks for a person, it texts you, then stays out of that chat for a day.',
        detail: 'straight to your phone',
    },
    {
        icon: HardDrive,
        title: 'messages stay on your machine',
        body: 'conversations and contacts live encrypted on the engine you run. your backend only ever sees counts.',
        detail: 'encrypted at rest',
    },
    {
        icon: Gauge,
        title: 'a budget it can’t blow',
        body: 'set a daily or weekly usage budget. once it’s used up, agents stop replying and let you know.',
        detail: 'daily · weekly',
    },
    {
        icon: PauseCircle,
        title: 'one switch means stop',
        body: 'pause any agent instantly without deleting its setup. switch it back on when you’re ready.',
        detail: 'live · paused',
    },
    {
        icon: Database,
        title: 'your data stays yours',
        body: 'it runs on your own deployment. export your setup as a file from settings, and delete anything you want.',
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
                description="it can know you really well without owning your life. you decide what it knows, what it does, and where it all lives."
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
