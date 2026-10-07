import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'
import { AgentAvatar } from '@/components/landing/agent-avatar'

import { useCases } from '@/lib/assistant-examples'

export default function UseCases() {
    return (
        <section
            id="use-cases"
            className="px-6 py-28 md:py-40">
            <SectionHeading
                title="start with the stuff you keep ignoring"
                description="build one for one job, customize it till it’s exactly your vibe, then build the next."
            />

            <Stagger className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {useCases.map((u) => (
                    <StaggerItem key={u.title}>
                        <article className="flex h-full flex-col rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                            <div className="flex items-center gap-3">
                                <AgentAvatar
                                    name={u.agent}
                                    className="size-10"
                                />
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
