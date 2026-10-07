import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/landing/motion'

const principles = [
    { title: 'pay for what you use', body: 'Our planned model is usage-based pricing. Final rates and any channel costs will be shared before launch.' },
    { title: 'set your limit', body: 'We’re designing hard spending caps, so background tasks can’t keep running through your budget.' },
    { title: 'know where it went', body: 'See what messages, voice, and computer tasks cost. No mystery credit math.' },
]

export default function Pricing() {
    return (
        <section id="pricing" className="scroll-mt-24 px-6 py-24 md:py-32">
            <SectionHeading title="your assistant. your budget." description="customize the spend too: choose your models, set a hard cap and see where every bit went." />
            <Stagger className="mt-12 grid gap-5 md:grid-cols-3">
                {principles.map(({ title, body }) => (
                    <StaggerItem key={title}>
                        <div className="h-full rounded-[1.75rem] bg-neutral-100/70 p-7 ring-1 ring-black/4 dark:bg-white/5 dark:ring-white/8">
                            <h3 className="type-subheading">{title}</h3>
                            <p className="type-body-sm text-muted-foreground mt-3">{body}</p>
                        </div>
                    </StaggerItem>
                ))}
            </Stagger>
        </section>
    )
}
