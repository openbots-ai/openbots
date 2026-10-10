import { PhoneDemo } from '@/components/landing/phone-demo'
import { SectionHeading } from '@/components/landing/section-heading'

// After the builder in the hero: what using your agents actually looks like, in iMessage
export default function TextIt() {
    return (
        <section
            id="use-cases"
            className="scroll-mt-24 px-4 pt-44 pb-16 md:pt-60 md:pb-24">
            <SectionHeading
                title="then just text it"
                description="your agents live in imessage. ask for anything, approve what matters, and they get on with it."
            />
            <div className="mt-16">
                <PhoneDemo />
                <p className="type-caption text-muted-foreground mt-6 text-center">Example conversations · fictional places and amounts</p>
            </div>
        </section>
    )
}
