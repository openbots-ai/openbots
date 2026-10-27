import { FileText, Gauge, HardDrive, PauseCircle, ShieldCheck, UserCheck } from 'lucide-react'
import { SECTION, SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'

// Each card is something the app does today (see runner/README.md and Settings)
const controls = [
    {
        icon: FileText,
        title: 'Notes you can actually edit',
        body: 'What it knows about you is in its notes. Read them, fix anything that’s off, or delete them in the dashboard.',
        detail: 'View · edit · delete',
    },
    {
        icon: UserCheck,
        title: 'Only you and your people',
        body: 'It answers you and the people you allow. Texts from anyone else are ignored, never read by a model.',
        detail: 'Allowed people',
    },
    {
        icon: ShieldCheck,
        title: 'You approve the real stuff',
        body: 'Before it types, sends, pays or deletes anything on your computer, it texts you and waits for your yes.',
        detail: 'Reply YES to allow',
    },
    {
        icon: Gauge,
        title: 'Limits you set',
        body: 'Give it a daily or weekly usage budget. When it’s used up, it stops until the next one starts.',
        detail: 'Daily · weekly',
    },
    {
        icon: PauseCircle,
        title: 'One tap means stop',
        body: 'Pause any agent from the dashboard, or text stop to end a task on your computer right away.',
        detail: 'Pause anytime',
    },
    {
        icon: HardDrive,
        title: 'Your messages stay with you',
        body: 'Your texts stay on your own computer, encrypted. We only see your settings and daily counts.',
        detail: 'Encrypted on your computer',
    },
]

export default function Trust() {
    return (
        <section
            id="trust"
            className={`${SECTION} px-6`}>
            <SectionHeading
                title="Helpful, not weird about it"
                description="It can know you really well without owning your life. You decide what it knows, who it talks to, and what it does."
            />

            <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {controls.map(({ icon: Icon, title, body, detail }) => (
                    <StaggerItem key={title}>
                        <article className="group flex h-full min-h-64 flex-col rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 transition-[background-color,box-shadow,translate] duration-300 ease-out hover:-translate-y-1 hover:bg-white hover:shadow-[0_24px_48px_-24px_rgba(0,0,0,0.18)] hover:ring-black/8 dark:bg-white/5 dark:ring-white/8 dark:hover:bg-white/8">
                            <span className="flex size-11 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-black/5 transition-[background-color,color,rotate,scale] duration-300 ease-out group-hover:-rotate-6 group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground dark:bg-white/10 dark:ring-white/10">
                                <Icon className="size-5" aria-hidden />
                            </span>
                            <h3 className="type-subheading mt-8 text-balance">{title}</h3>
                            <p className="type-body-sm text-muted-foreground mt-2">{body}</p>
                            <p className="type-label text-muted-foreground group-hover:text-foreground mt-auto pt-7 transition-colors duration-300">{detail}</p>
                        </article>
                    </StaggerItem>
                ))}
            </Stagger>
        </section>
    )
}
